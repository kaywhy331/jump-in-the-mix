import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { enableJourney, recordJourneyEvent, runJourneyMaintenance } from "@/lib/journey";
import { receiveIntake, resolveIntake } from "@/lib/intake";
import { saveCalendarEntry, importCalendar } from "@/lib/calendar";
import { createConnectionToken } from "@/lib/connection-tokens";
import type { JourneyEventType } from "@/generated/prisma/client";

// These tests deliberately exercise committed concurrent transactions. They
// must never run on a hosted or shared business database.
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("customer journey, scheduling and intake integration", () => {
  let workspaceId: string; const users: string[] = []; const workspaces: string[] = [];
  async function business() {
    const suffix = randomUUID(); const user = await prisma.user.create({ data: { email: `journey-${suffix}@example.com`, name: "Journey test", passwordHash: "test-only" } }); users.push(user.id);
    const workspace = await prisma.workspace.create({ data: { name: "Journey test", slug: `journey-${suffix}`, ownerId: user.id } }); workspaces.push(workspace.id); return workspace.id;
  }
  beforeEach(async () => { workspaceId = await business(); });
  afterEach(async () => { for (const id of workspaces.splice(0)) await prisma.workspace.delete({ where: { id } }); for (const id of users.splice(0)) await prisma.user.delete({ where: { id } }); });
  afterAll(async () => { await prisma.$disconnect(); });
  const person = (name = "Sample person") => prisma.contact.create({ data: { workspaceId, displayName: name } });
  async function stages() { await enableJourney(workspaceId); return prisma.journeyStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } }); }
  const event = (contactId: string, eventType: JourneyEventType, extra = {}) => recordJourneyEvent({ workspaceId, contactId, eventType, eventKey: randomUUID(), source: "Test source", ...extra });
  const plan = (name: string) => prisma.mix.create({ data: { workspaceId, name, status: "ACTIVE", triggerMode: "MANUAL_START" } });
  async function connection(kind = "CRM") { return prisma.intakeConnection.create({ data: { workspaceId, kind, name: "Sample source", ...createConnectionToken() } }); }

  it("follows milestones without regressing on delayed or repeated events", async () => {
    const stage = await stages(); const contact = await person();
    expect((await event(contact.id,"CONTACT_RECEIVED")).stageId).toBe(stage[0].id);
    expect((await event(contact.id,"MEETING_SCHEDULED")).stageId).toBe(stage[1].id);
    const key = randomUUID(); expect((await event(contact.id,"SALE_CONFIRMED",{ eventKey: key })).stageId).toBe(stage[2].id);
    expect((await event(contact.id,"SALE_CONFIRMED",{ eventKey: key })).duplicate).toBe(true);
    expect((await event(contact.id,"CONVERSATION_STARTED")).changed).toBe(false);
    expect((await event(contact.id,"WORK_COMPLETED")).stageId).toBe(stage[3].id);
    expect(await prisma.contactActivity.count({ where: { workspaceId, contactId: contact.id } })).toBe(4);
    const existingClient = await person(); expect((await event(existingClient.id,"SALE_CONFIRMED")).stageId).toBe(stage[2].id);
  });
  it("serializes duplicate events, rejects cross-tenant moves and stale manual changes", async () => {
    const stage = await stages(), contact = await person(); const eventKey = randomUUID();
    const results = await Promise.all([event(contact.id,"CONTACT_RECEIVED",{ eventKey }), event(contact.id,"CONTACT_RECEIVED",{ eventKey })]);
    expect(results.filter(item => item.duplicate)).toHaveLength(1);
    expect(await prisma.journeyEvent.count({ where: { workspaceId, eventKey } })).toBe(1);
    await expect(event(contact.id,"MANUAL",{ targetStageId: stage[1].id, expectedVersion: 0 })).rejects.toThrow("stage changed");
    const foreign = await business(); await enableJourney(foreign); const foreignStage = await prisma.journeyStage.findFirstOrThrow({ where: { workspaceId: foreign } });
    await expect(event(contact.id,"MANUAL",{ targetStageId: foreignStage.id })).rejects.toThrow("available stage");
    await expect(recordJourneyEvent({ workspaceId: foreign, contactId: contact.id, eventKey: randomUUID(), eventType: "SALE_CONFIRMED", source: "Test" })).rejects.toThrow("Contact not found");
    await expect(event(contact.id,"WORK_COMPLETED",{ eventKey })).rejects.toThrow("different event");
  });
  it("keeps milestones recorded while automation is paused and supports manual overrides", async () => {
    const stage = await stages(), contact = await person(); await event(contact.id,"CONTACT_RECEIVED");
    await prisma.contactJourney.update({ where: { contactId: contact.id }, data: { automatic: false } });
    expect((await event(contact.id,"SALE_CONFIRMED")).changed).toBe(false);
    expect((await event(contact.id,"MANUAL",{ targetStageId: stage[1].id })).changed).toBe(true);
    expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: contact.id } })).automatic).toBe(false);
    await prisma.journeyPreference.update({ where: { workspaceId }, data: { enabled: false } });
    const key = randomUUID(); expect((await event(contact.id,"WORK_COMPLETED",{ eventKey: key })).changed).toBe(false);
    expect(await prisma.journeyEvent.count({ where: { workspaceId, eventKey: key } })).toBe(1);
    expect((await event(contact.id,"MANUAL",{ targetStageId: stage[3].id })).changed).toBe(true);
  });
  it("keeps no-op worker events retryable after a pause or changed timer rule", async () => {
    const stage = await stages(), contact = await person(); const eventKey = `journey-new:${contact.id}`;
    await prisma.journeyPreference.update({ where: { workspaceId }, data: { enabled: false } });
    expect((await event(contact.id,"CONTACT_RECEIVED",{ eventKey, maintenance: true })).changed).toBe(false);
    expect(await prisma.journeyEvent.count({ where: { workspaceId, eventKey } })).toBe(0);
    await prisma.journeyPreference.update({ where: { workspaceId }, data: { enabled: true } });
    expect((await event(contact.id,"CONTACT_RECEIVED",{ eventKey, maintenance: true })).stageId).toBe(stage[0].id);
    await prisma.journeyRule.create({ data: { workspaceId, fromStageId: stage[0].id, toStageId: stage[1].id, eventType: "TIME_IN_STAGE", afterDays: 7 } });
    const timerKey = `journey:${contact.id}:1:TIME_IN_STAGE`;
    expect((await event(contact.id,"TIME_IN_STAGE",{ eventKey: timerKey, maintenance: true, expectedVersion: 1 })).changed).toBe(false);
    expect((await event(contact.id,"TIME_IN_STAGE",{ eventKey: timerKey, maintenance: true, expectedVersion: 1, now: new Date(Date.now()+8*86_400_000) })).stageId).toBe(stage[1].id);
  });
  it("changes only stage-owned plans and respects independent plans, DNC and manual stops", async () => {
    const stage = await stages(), leadPlan = await plan("Lead follow-up"), prospectPlan = await plan("Prospect follow-up"), independent = await plan("Independent"), contact = await person();
    await prisma.journeyStage.update({ where: { id: stage[0].id }, data: { planId: leadPlan.id } });
    await prisma.journeyStage.update({ where: { id: stage[1].id }, data: { planId: prospectPlan.id } });
    const separate = await prisma.mixAssignment.create({ data: { workspaceId, contactId: contact.id, mixId: independent.id, assignmentKey: randomUUID(), isActive: true } });
    await event(contact.id,"CONTACT_RECEIVED"); const initial = await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: contact.id } }); expect(initial.managedAssignmentId).toBeTruthy();
    await event(contact.id,"CONVERSATION_STARTED");
    expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { id: initial.managedAssignmentId! } })).isActive).toBe(false);
    expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { id: separate.id } })).isActive).toBe(true);
    expect((await prisma.mixStop.findFirstOrThrow({ where: { workspaceId, contactId: contact.id, mixId: leadPlan.id } })).reason).toBe("journey.stage.exit");
    await prisma.mixStop.updateMany({ where: { workspaceId, contactId: contact.id, mixId: leadPlan.id }, data: { reason: "manual.user.stop" } });
    await event(contact.id,"MANUAL",{ targetStageId: stage[0].id });
    expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: contact.id } })).managedAssignmentId).toBeNull();
    const dnc = await person("DNC"); await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: dnc.id, doNotContact: true } });
    await event(dnc.id,"CONTACT_RECEIVED"); expect(await prisma.mixAssignment.count({ where: { contactId: dnc.id } })).toBe(0);
    const alreadyAssigned = await person("Independent assignment");
    await prisma.mixAssignment.create({ data: { workspaceId, contactId: alreadyAssigned.id, mixId: leadPlan.id, assignmentKey: randomUUID(), isActive: true } });
    await event(alreadyAssigned.id,"CONTACT_RECEIVED"); expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: alreadyAssigned.id } })).managedAssignmentId).toBeNull();
  });
  it("initializes only new contacts and rotates timer checks so due people are reached", async () => {
    const historical = await person("Historical"); await prisma.contact.update({ where: { id: historical.id }, data: { createdAt: new Date("2020-01-01") } });
    const stage = await stages(), fresh = await person("New"); await runJourneyMaintenance({ limit: 100 });
    expect(await prisma.contactJourney.findUnique({ where: { contactId: historical.id } })).toBeNull();
    expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: fresh.id } })).stageId).toBe(stage[0].id);
    await prisma.journeyRule.create({ data: { workspaceId, fromStageId: stage[0].id, toStageId: stage[1].id, eventType: "TIME_IN_STAGE", afterDays: 7 } });
    const old = await person("Due next"), now = new Date(); await event(old.id,"CONTACT_RECEIVED");
    await prisma.contactJourney.update({ where: { contactId: old.id }, data: { stageSince: new Date(now.getTime()-8*86_400_000), lastCheckedAt: new Date(now.getTime()-1000) } });
    await prisma.contactJourney.update({ where: { contactId: fresh.id }, data: { lastCheckedAt: new Date(now.getTime()-2000) } });
    expect((await runJourneyMaintenance({ now, limit: 1 })).advanced).toBe(0);
    expect((await runJourneyMaintenance({ now: new Date(now.getTime()+1000), limit: 1 })).advanced).toBe(1);
    expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: old.id } })).stageId).toBe(stage[1].id);
  });
  it("completes the plan actually assigned to the current stage even after its next-entry plan changes", async () => {
    const stage = await stages(), assigned = await plan("Currently assigned"), replacement = await plan("For future entries"), contact = await person();
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Test call", channel: "PHONE_CALL" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Sample call" } });
    const step = await prisma.mixStep.create({ data: { mixId: assigned.id, stepVersionId: version.id, sortOrder: 1, dayOffset: 0 } });
    await prisma.journeyStage.update({ where: { id: stage[0].id }, data: { planId: assigned.id } });
    await prisma.journeyRule.create({ data: { workspaceId, fromStageId: stage[0].id, toStageId: stage[1].id, eventType: "PLAN_COMPLETED" } });
    await event(contact.id,"CONTACT_RECEIVED");
    await prisma.journeyStage.update({ where: { id: stage[0].id }, data: { planId: replacement.id } });
    const jump = await prisma.jump.create({ data: { workspaceId, contactId: contact.id, mixId: assigned.id, mixStepId: step.id, stepVersionId: version.id, scheduledAt: new Date(), status: "PENDING", reason: "Test step", templateSnapshot: {}, renderedSnapshot: {}, uniquenessKey: randomUUID() } });
    await runJourneyMaintenance({ limit: 100 }); expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: contact.id } })).stageId).toBe(stage[0].id);
    await prisma.jump.update({ where: { id: jump.id }, data: { status: "DONE", completedAt: new Date() } });
    await runJourneyMaintenance({ limit: 100 }); expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: contact.id } })).stageId).toBe(stage[1].id);
  });
  it("accepts concurrent retries once, links exact identities and preserves existing data", async () => {
    await stages(); const source = await connection(); const payload = { eventId: "inquiry-1", externalId: "source-person-1", displayName: "Original name", email: "HELLO@example.com", message: "First inquiry" };
    const results = await Promise.all([receiveIntake(source.id,payload,{ tokenHash: source.tokenHash }), receiveIntake(source.id,payload,{ tokenHash: source.tokenHash })]);
    expect(results.filter(item => item.duplicate)).toHaveLength(1); const contactId = results[0].contactId!;
    expect(await prisma.contact.count({ where: { workspaceId } })).toBe(1);
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId, doNotContact: true } });
    await receiveIntake(source.id,{ ...payload, eventId: "inquiry-2", displayName: "Changed incoming name", eventType: "SALE_CONFIRMED" },{ tokenHash: source.tokenHash });
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).displayName).toBe("Original name");
    expect((await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId } })).doNotContact).toBe(true);
    expect(await prisma.contact.count({ where: { workspaceId } })).toBe(1);
    await expect(receiveIntake(source.id,{ ...payload, message: "Changed replay" },{ tokenHash: source.tokenHash })).rejects.toThrow("already used");
    await expect(receiveIntake(source.id,payload,{ tokenHash: "wrong" })).rejects.toThrow("unavailable");
  });
  it("holds ambiguous and archived identities for review, with workspace isolation", async () => {
    const source = await connection();
    const a = await prisma.contact.create({ data: { workspaceId, displayName: "Email owner", emails: { create: { email: "shared@example.com", normalized: "shared@example.com" } } } });
    const b = await prisma.contact.create({ data: { workspaceId, displayName: "Phone owner", phones: { create: { phone: "+14155550123", normalized: "+14155550123" } } } });
    const result = await receiveIntake(source.id,{ eventId: "ambiguous", email: "shared@example.com", phone: "+14155550123" },{ tokenHash: source.tokenHash });
    expect(result.status).toBe("REVIEW"); expect(result.contactId).toBeNull(); expect(await prisma.contact.count({ where: { workspaceId } })).toBe(2);
    const foreign = await business(); await expect(resolveIntake(foreign,result.receiptId,"link",a.id)).rejects.toThrow("unavailable");
    await resolveIntake(workspaceId,result.receiptId,"link",a.id); expect((await prisma.intakeReceipt.findUniqueOrThrow({ where: { id: result.receiptId } })).contactId).toBe(a.id);
    await prisma.contact.update({ where: { id: b.id }, data: { archivedAt: new Date() } });
    expect((await receiveIntake(source.id,{ eventId: "archived", phone: "+14155550123" },{ tokenHash: source.tokenHash })).status).toBe("REVIEW");
    await prisma.intakeConnection.update({ where: { id: source.id }, data: { enabled: false } });
    await expect(receiveIntake(source.id,{ eventId: "paused", email: "new@example.com" },{ tokenHash: source.tokenHash })).rejects.toThrow("unavailable");
  });
  it("keeps hosted forms separate from privileged milestone connectors", async () => {
    const source = await connection("HOSTED_FORM");
    const payload = { eventId: "public-1", email: "sample@example.com" };
    expect((await receiveIntake(source.id,payload,{ publicForm: true })).status).toBe("ACCEPTED");
    await expect(receiveIntake(source.id,{ ...payload, eventId: "public-2", eventType: "SALE_CONFIRMED" },{ publicForm: true })).rejects.toThrow();
    await expect(receiveIntake(source.id,payload,{ tokenHash: source.tokenHash })).rejects.toThrow("unavailable");
    const crm = await connection(); await expect(receiveIntake(crm.id,payload,{ publicForm: true })).rejects.toThrow("unavailable");
  });
  it("prevents concurrent double booking, permits adjacency and advances a booked contact", async () => {
    const stage = await stages(), contact = await person();
    const input = { workspaceId, title: "Discovery", kind: "MEETING", contactId: contact.id, startsAt: new Date("2026-09-07T16:00Z"), endsAt: new Date("2026-09-07T16:30Z"), timezone: "America/Los_Angeles" };
    const results = await Promise.allSettled([saveCalendarEntry(input),saveCalendarEntry(input)]);
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: contact.id } })).stageId).toBe(stage[1].id);
    await saveCalendarEntry({ ...input, contactId: undefined, kind: "BLOCK", startsAt: input.endsAt, endsAt: new Date("2026-09-07T17:00Z") });
    expect(await prisma.calendarEntry.count({ where: { workspaceId } })).toBe(2);
    const entry = await prisma.calendarEntry.findFirstOrThrow({ where: { workspaceId, kind: "MEETING" } });
    await expect(saveCalendarEntry({ ...input, id: entry.id, version: 0 })).rejects.toThrow("changed");
    const foreign = await business(); await expect(saveCalendarEntry({ ...input, workspaceId: foreign })).rejects.toThrow("contact in this business");
    await saveCalendarEntry({ ...input, id: entry.id, version: entry.version, startsAt: new Date("2026-09-08T16:00Z"), endsAt: new Date("2026-09-08T16:30Z") });
    expect(await prisma.journeyEvent.count({ where: { workspaceId, eventType: "MEETING_SCHEDULED" } })).toBe(1);
  });
  it("refreshes imported availability idempotently and removes canceled external events", async () => {
    const connection = await prisma.calendarConnection.create({ data: { workspaceId, name: "Imported" } });
    const body = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:external\r\nDTSTAMP:20260905T120000Z\r\nDTSTART:20260907T090000Z\r\nDTEND:20260907T100000Z\r\nSUMMARY:External busy time\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    const now = new Date("2026-09-05T12:00Z"); await importCalendar(workspaceId,connection.id,body,"UTC",now); await importCalendar(workspaceId,connection.id,body,"UTC",now);
    expect(await prisma.calendarEntry.count({ where: { workspaceId, canceledAt: null } })).toBe(1);
    expect(await prisma.journeyEvent.count({ where: { workspaceId } })).toBe(0);
    const input = { workspaceId, title: "Conflict", kind: "MEETING", startsAt: new Date("2026-09-07T09:30Z"), endsAt: new Date("2026-09-07T10:30Z"), timezone: "UTC" };
    await expect(saveCalendarEntry(input)).rejects.toThrow("overlaps");
    await expect(importCalendar(workspaceId,connection.id,"not a calendar","UTC",now)).rejects.toThrow();
    expect(await prisma.calendarEntry.count({ where: { workspaceId, canceledAt: null } })).toBe(1);
    await importCalendar(workspaceId,connection.id,body.replace("SUMMARY:","STATUS:CANCELLED\r\nSUMMARY:"),"UTC",now);
    expect(await prisma.calendarEntry.count({ where: { workspaceId, canceledAt: null } })).toBe(0);
    await saveCalendarEntry(input);
  });
});
