import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAppointmentOutcome, scheduleVisit } from "../src/lib/appointment-bindings";
import { APPOINTMENT_HOLD_METHODS, reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const DAY = 86_400_000;

describe.sequential("visit outcomes anchor the bound plan", () => {
  let fixture: BroadcastFixture;
  let workspaceId: string;
  let planId: string;
  let entryId: string;
  let bindingId: string;
  const rows = () => prisma.jump.findMany({ where: { appointmentBindingId: bindingId }, include: { mixStep: { select: { dayOffset: true } } }, orderBy: { scheduledAt: "asc" } });

  beforeAll(async () => {
    fixture = await createBroadcastFixture("outcome", "Sam");
    workspaceId = fixture.workspaceId;
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Visit plan", channel: "SMS" } });
    const before = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Reminder for {{Appointment Date}}" } });
    const after = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 2, body: "Thanks for today, {{First Name}}" } });
    const later = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 3, body: "How is everything a week on?" } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Visit plan", triggerMode: "MANUAL_START", status: "ACTIVE" } });
    planId = mix.id;
    await prisma.mixStep.createMany({ data: [
      { mixId: mix.id, stepVersionId: before.id, dayOffset: -1, sortOrder: 1, sendTimeMinutes: 9 * 60 },
      { mixId: mix.id, stepVersionId: after.id, dayOffset: 0, sortOrder: 2 },
      { mixId: mix.id, stepVersionId: later.id, dayOffset: 7, sortOrder: 3, sendTimeMinutes: 10 * 60 }
    ] });
    // The visit is tomorrow, so the reminder before it and everything after it are all open work.
    const startsAt = new Date(Date.now() + DAY);
    const result = await scheduleVisit({ workspaceId, title: "Site visit", kind: "MEETING", startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: "America/Denver", contactId: fixture.contactId, planId, allowOverlap: true });
    entryId = result.entryId; bindingId = result.bindingId!;
    await reconcileJumps({ workspaceId, mixId: planId });
    expect((await rows()).map((row) => row.status)).toEqual(["PENDING", "PENDING", "PENDING"]);
  });
  afterAll(() => fixture.cleanup());

  it("lets the beats before a completed visit lapse, runs the ones after, and records the event", async () => {
    const entry = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(await recordAppointmentOutcome({ workspaceId, actorUserId: fixture.userId, entryId, version: entry.version, outcome: "COMPLETED" })).toEqual({ ok: true });
    expect(await recordAppointmentOutcome({ workspaceId, entryId, version: entry.version, outcome: "COMPLETED" })).toMatchObject({ ok: false, message: expect.stringContaining("changed") });
    const result = await reconcileJumps({ workspaceId, mixId: planId });
    expect(result).toMatchObject({ held: 1, canceled: 0, failedBindings: 0 });
    const after = await rows();
    expect(after.map((row) => [row.mixStep.dayOffset, row.status, row.completionMethod])).toEqual([[-1, "CANCELED", APPOINTMENT_HOLD_METHODS.completed], [0, "PENDING", null], [7, "PENDING", null]]);
    expect(await prisma.journeyEvent.count({ where: { workspaceId, contactId: fixture.contactId, eventType: "MEETING_COMPLETED" } })).toBe(1);
    expect(await prisma.contactActivity.count({ where: { contactId: fixture.contactId, summary: "Visit happened: Site visit" } })).toBe(1);
    // A second pass changes nothing.
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ created: 0, updated: 0, held: 0, canceled: 0 });
  });

  it("holds every bound beat for a missed visit and brings them back when the outcome is cleared", async () => {
    const entry = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(await recordAppointmentOutcome({ workspaceId, entryId, version: entry.version, outcome: "NO_SHOW" })).toEqual({ ok: true });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ held: 2, canceled: 0 });
    expect((await rows()).every((row) => row.status === "CANCELED")).toBe(true);
    expect((await rows()).filter((row) => row.completionMethod === APPOINTMENT_HOLD_METHODS.noShow)).toHaveLength(2);
    expect(await prisma.journeyEvent.count({ where: { workspaceId, contactId: fixture.contactId, eventType: "MEETING_NO_SHOW" } })).toBe(1);
    const cleared = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(await recordAppointmentOutcome({ workspaceId, entryId, version: cleared.version, outcome: null })).toEqual({ ok: true });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ updated: 3, held: 0 });
    expect((await rows()).map((row) => row.status)).toEqual(["PENDING", "PENDING", "PENDING"]);
  });

  it("refuses an outcome on a time block and never touches another visit's rows", async () => {
    const block = await prisma.calendarEntry.create({ data: { workspaceId, title: "Focus time", kind: "BLOCK", startsAt: new Date(Date.now() + 2 * DAY), endsAt: new Date(Date.now() + 2 * DAY + 3_600_000), timezone: "America/Denver" } });
    expect(await recordAppointmentOutcome({ workspaceId, entryId: block.id, outcome: "COMPLETED" })).toMatchObject({ ok: false, message: expect.stringContaining("meeting") });
    const other = await scheduleVisit({ workspaceId, title: "Other visit", kind: "MEETING", startsAt: new Date(Date.now() + 3 * DAY), endsAt: new Date(Date.now() + 3 * DAY + 1_800_000), timezone: "America/Denver", contactId: fixture.contactId, planId, allowOverlap: true });
    await reconcileJumps({ workspaceId, mixId: planId });
    const entry = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: entryId } });
    await recordAppointmentOutcome({ workspaceId, entryId, version: entry.version, outcome: "NO_SHOW" });
    await reconcileJumps({ workspaceId, mixId: planId });
    expect((await prisma.jump.findMany({ where: { appointmentBindingId: other.bindingId! } })).every((row) => row.status === "PENDING")).toBe(true);
  });
});
