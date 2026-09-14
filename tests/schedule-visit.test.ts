import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appointmentAssignmentKey, scheduleVisit, setAppointmentBindingDelivery, setAppointmentBindingHold } from "../src/lib/appointment-bindings";
import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const TIMEZONE = "America/Chicago";
const startsAt = new Date(Date.now() + 5 * 86_400_000);
const endsAt = new Date(startsAt.getTime() + 45 * 60_000);

describe.sequential("one-save visit creation", () => {
  let fixture: BroadcastFixture;
  let workspaceId: string;
  let planId: string;
  let otherPlanId: string;
  const visit = (overrides: Partial<Parameters<typeof scheduleVisit>[0]> = {}) => scheduleVisit({
    workspaceId, actorUserId: fixture.userId, title: "Roof inspection", kind: "MEETING", startsAt, endsAt, timezone: TIMEZONE,
    location: "44 Oak Ave", link: "https://meet.example.test/roof", details: "Gate code 1234", allowOverlap: true, ...overrides
  });

  async function plan(name: string) {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name, channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "See you {{Appointment Date}} at {{Appointment Location}}. {{Appointment Details}}" } });
    const mix = await prisma.mix.create({ data: { workspaceId, name, triggerMode: "MANUAL_START", status: "ACTIVE" } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: -1, sortOrder: 1, sendTimeMinutes: 10 * 60 } });
    return mix.id;
  }

  beforeAll(async () => {
    fixture = await createBroadcastFixture("visit", "Riley");
    workspaceId = fixture.workspaceId;
    planId = await plan("Inspection plan");
    otherPlanId = await plan("Second plan");
  });
  afterAll(() => fixture.cleanup());

  it("saves the appointment, its details, the bound plan and the worker request together", async () => {
    const result = await visit({ contactId: fixture.contactId, planId });
    expect(result).toMatchObject({ contactId: fixture.contactId, unscopedEnrollmentKept: false, createdContact: false });
    expect(result.bindingId).toBeTruthy();
    const entry = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: result.entryId } });
    expect(entry).toMatchObject({ title: "Roof inspection", contactId: fixture.contactId, location: "44 Oak Ave", link: "https://meet.example.test/roof", details: "Gate code 1234" });
    const binding = await prisma.appointmentBinding.findUniqueOrThrow({ where: { id: result.bindingId! }, include: { assignment: true } });
    expect(binding).toMatchObject({ calendarEntryId: entry.id, mixId: planId, contactId: fixture.contactId, automaticDelivery: false, heldAt: null });
    expect(binding.assignment).toMatchObject({ assignmentKey: appointmentAssignmentKey(workspaceId, planId, entry.id, fixture.contactId), isActive: true, contactId: fixture.contactId });
    expect(await prisma.job.count({ where: { workspaceId, task: "generate-jumps", completedAt: null, payload: { path: ["mixId"], equals: planId } } })).toBeGreaterThan(0);
    // The follow-ups the worker will generate anchor to the visit.
    await reconcileJumps({ workspaceId, mixId: planId });
    const generated = await prisma.jump.findMany({ where: { appointmentBindingId: binding.id } });
    expect(generated).toHaveLength(1);
    expect((generated[0].renderedSnapshot as { body: string }).body).toContain("at 44 Oak Ave. Gate code 1234");
  });

  it("reuses the binding already on this appointment, and refuses a link that is not https", async () => {
    const existing = await prisma.appointmentBinding.findFirstOrThrow({ where: { workspaceId, mixId: planId } });
    const entry = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: existing.calendarEntryId } });
    const again = await visit({ id: entry.id, version: entry.version, contactId: fixture.contactId, planId, title: "Roof inspection (moved)" });
    expect(again.bindingId).toBe(existing.id);
    expect(await prisma.appointmentBinding.count({ where: { calendarEntryId: entry.id } })).toBe(1);
    await expect(visit({ contactId: fixture.contactId, planId, link: "ftp://files.example.test" })).rejects.toThrow(/https/);
  });

  it("leaves an unscoped enrollment for the same plan alone and says so", async () => {
    await prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${otherPlanId}:${fixture.contactId}`, workspaceId, mixId: otherPlanId, contactId: fixture.contactId, mode: "SNAPSHOT", startDate: new Date() } });
    const result = await visit({ contactId: fixture.contactId, planId: otherPlanId, title: "Second visit" });
    expect(result.unscopedEnrollmentKept).toBe(true);
    const assignments = await prisma.mixAssignment.findMany({ where: { workspaceId, mixId: otherPlanId, contactId: fixture.contactId, isActive: true }, include: { appointmentBinding: true } });
    expect(assignments).toHaveLength(2);
    expect(assignments.filter((item) => item.appointmentBinding)).toHaveLength(1);
    expect(assignments.filter((item) => !item.appointmentBinding)).toHaveLength(1);
  });

  it("creates the person in the same save and never duplicates a saved phone", async () => {
    const created = await visit({ newContact: { name: "Morgan Vale", phone: "+1 (555) 010-0777" }, planId, title: "New customer visit" });
    expect(created.createdContact).toBe(true);
    const person = await prisma.contact.findUniqueOrThrow({ where: { id: created.contactId! }, include: { phones: true } });
    expect(person).toMatchObject({ firstName: "Morgan", lastName: "Vale", displayName: "Morgan Vale" });
    expect(person.phones.map((item) => item.normalized)).toEqual(["+15550100777"]);
    // Methods match by their normalized identity, so the same number written differently finds the same person.
    const repeat = await visit({ newContact: { name: "M. Vale", phone: "+1 555 010 0777" }, planId, title: "Repeat visit" });
    expect(repeat).toMatchObject({ contactId: created.contactId, createdContact: false });
    await expect(visit({ newContact: { name: "No Number", phone: "12" } })).rejects.toThrow(/7 to 15 digits/);
    await expect(visit({ planId })).rejects.toThrow(/Choose or add the person/);
    await expect(visit({ contactId: fixture.contactId, planId: "not-a-plan" })).rejects.toThrow(/active plan/);
  });

  it("holds and resumes one visit's follow-ups and turns automatic sending on only when asked", async () => {
    const binding = await prisma.appointmentBinding.findFirstOrThrow({ where: { workspaceId, mixId: planId } });
    expect(await setAppointmentBindingHold({ workspaceId, bindingId: binding.id, held: true })).toBe(true);
    expect((await prisma.appointmentBinding.findUniqueOrThrow({ where: { id: binding.id } })).heldAt).toBeInstanceOf(Date);
    expect(await setAppointmentBindingHold({ workspaceId: "someone-else", bindingId: binding.id, held: false })).toBe(false);
    expect(await setAppointmentBindingHold({ workspaceId, bindingId: binding.id, held: false })).toBe(true);
    expect(await setAppointmentBindingDelivery({ workspaceId, bindingId: binding.id, automaticDelivery: true })).toBe(true);
    expect((await prisma.appointmentBinding.findUniqueOrThrow({ where: { id: binding.id } })).automaticDelivery).toBe(true);
    expect(await setAppointmentBindingDelivery({ workspaceId: "someone-else", bindingId: binding.id, automaticDelivery: false })).toBe(false);
  });
});
