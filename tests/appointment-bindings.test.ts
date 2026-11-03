import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runAutomaticDeliveries } from "../src/lib/automatic-delivery";
import { APPOINTMENT_HOLD_METHODS, reconcileJumps } from "../src/lib/jump-engine";
import { saveJumpDraft } from "../src/lib/jump-drafts";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const DAY = 86_400_000;
const TIMEZONE = "America/Los_Angeles";
// Local Pacific times on days ahead of October 5, 2026, expressed as instants (PDT is UTC-7).
const at = (daysAhead: number, hourLocal: number, minute = 30) => new Date(Date.UTC(2026, 9, 5 + daysAhead, hourLocal + 7, minute));
/** The clock those instants count from: 9:00 AM Pacific on October 5, 2026. */
const T0 = at(0, 9, 0);
/** Only the clock is frozen; timers stay real so the database client keeps working. */
function setClock(instant: Date) { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(instant); }

describe.sequential("appointment bindings", () => {
  let fixture: BroadcastFixture;
  let workspaceId: string;
  let mixId: string;
  const rows = (bindingId: string) => prisma.jump.findMany({ where: { appointmentBindingId: bindingId }, orderBy: { scheduledAt: "asc" } });

  /**
   * A two-beat plan: a reminder the day before, and one the morning of. Both are preparation, so
   * they exist before the visit; a beat that follows the visit waits for its recorded outcome
   * (see appointment-outcomes.test.ts), which these identity and hold cases do not exercise.
   */
  async function planWithTwoBeats(name: string) {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name, channel: "SMS" } });
    const before = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}, see you {{Appointment Date}} at {{Appointment Time}} at {{Appointment Location}}. {{Appointment Details}}" } });
    const morningOf = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 2, body: "See you later today, {{First Name}}. {{Appointment Link}}" } });
    const mix = await prisma.mix.create({ data: { workspaceId, name, triggerMode: "MANUAL_START", status: "ACTIVE" } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: before.id, dayOffset: -1, sortOrder: 1, sendTimeMinutes: 9 * 60 } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: morningOf.id, dayOffset: 0, sortOrder: 2, sendTimeMinutes: 8 * 60 } });
    return mix.id;
  }

  /** A one-beat plan that follows the visit: the day after at ten. It is released once the visit is recorded as having happened. */
  async function planWithFollowingBeat(name: string) {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name, channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Thanks for the visit, {{First Name}}." } });
    const mix = await prisma.mix.create({ data: { workspaceId, name, triggerMode: "MANUAL_START", status: "ACTIVE" } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 1, sortOrder: 1, sendTimeMinutes: 10 * 60 } });
    return mix.id;
  }

  async function bind(contactId: string, entryId: string, planId: string, extra: { automaticDelivery?: boolean } = {}) {
    const assignment = await prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${planId}:appointment:${entryId}:${contactId}`, workspaceId, mixId: planId, contactId, mode: "SNAPSHOT" } });
    return prisma.appointmentBinding.create({ data: { workspaceId, contactId, calendarEntryId: entryId, mixId: planId, assignmentId: assignment.id, ...extra } });
  }

  async function appointment(contactId: string, startsAt: Date, title = "Kitchen estimate") {
    return prisma.calendarEntry.create({ data: { workspaceId, contactId, title, kind: "MEETING", startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60_000), timezone: TIMEZONE, location: "12 Elm St", link: "https://meet.example.test/abc", details: "Bring the tile samples." } });
  }

  beforeAll(async () => {
    setClock(T0);
    fixture = await createBroadcastFixture("appointment", "Alex");
    workspaceId = fixture.workspaceId;
    await prisma.contactPhone.create({ data: { contactId: fixture.contactId, phone: "+15550100400", normalized: "+15550100400", isPrimary: true } });
    mixId = await planWithTwoBeats("Estimate visit plan");
  });
  afterAll(async () => { vi.useRealTimers(); await fixture.cleanup(); });

  it("anchors the plan's beats to the appointment and renders its details", async () => {
    const entry = await appointment(fixture.contactId, at(10, 14));
    const binding = await bind(fixture.contactId, entry.id, mixId);
    const result = await reconcileJumps({ workspaceId, mixId });
    expect(result).toMatchObject({ created: 2, held: 0, failedBindings: 0 });
    const [reminder, checkIn] = await rows(binding.id);
    // The reminder beat carries its own 9:00 time; the morning-of beat its own 8:00 on the appointment's day.
    expect(reminder.scheduledAt.toISOString()).toBe(at(9, 9, 0).toISOString());
    expect(checkIn.scheduledAt.toISOString()).toBe(at(10, 8, 0).toISOString());
    expect(reminder.reason).toBe("Kitchen estimate");
    expect(reminder.renderedSnapshot).toMatchObject({ body: "Hi Alex, see you Thursday, October 15 at 2:30 PM at 12 Elm St. Bring the tile samples." });
    expect(checkIn.renderedSnapshot).toMatchObject({ body: "See you later today, Alex. https://meet.example.test/abc" });
    expect((await prisma.appointmentBinding.findUniqueOrThrow({ where: { id: binding.id } })).lastEvaluatedAt).toBeInstanceOf(Date);
  });

  it("keeps the same rows, the draft and the snooze when the appointment moves", async () => {
    const binding = await prisma.appointmentBinding.findFirstOrThrow({ where: { workspaceId, mixId } });
    const [reminder, checkIn] = await rows(binding.id);
    expect((await saveJumpDraft({ workspaceId, jumpId: checkIn.id, family: "TEXT", body: "See you later today, {{First Name}}, my own words.", revision: null })).ok).toBe(true);
    const snoozedUntil = new Date(at(9, 9, 0).getTime() + 3 * 60 * 60_000);
    await prisma.jump.update({ where: { id: reminder.id }, data: { scheduledAt: snoozedUntil, snoozedUntil } });
    await prisma.calendarEntry.update({ where: { id: binding.calendarEntryId }, data: { startsAt: at(12, 16), endsAt: at(12, 17), version: { increment: 1 } } });
    const result = await reconcileJumps({ workspaceId, mixId });
    expect(result).toMatchObject({ created: 0, updated: 2, canceled: 0 });
    const [movedReminder, movedCheckIn] = await rows(binding.id);
    expect([movedReminder.id, movedCheckIn.id]).toEqual([reminder.id, checkIn.id]);
    expect(movedReminder.baseScheduledAt?.toISOString()).toBe(at(11, 9, 0).toISOString());
    // The new base is later than the snooze, so the base wins; the snooze stays recorded.
    expect(movedReminder.scheduledAt.toISOString()).toBe(at(11, 9, 0).toISOString());
    expect(movedReminder.snoozedUntil?.toISOString()).toBe(snoozedUntil.toISOString());
    expect(movedCheckIn.scheduledAt.toISOString()).toBe(at(12, 8, 0).toISOString());
    expect(movedCheckIn.renderedSnapshot).toMatchObject({ body: "See you later today, Alex. https://meet.example.test/abc" });
    expect(await prisma.jumpDraft.findMany({ where: { jumpId: checkIn.id } })).toMatchObject([{ body: "See you later today, {{First Name}}, my own words." }]);
  });

  it("holds the binding's rows on an owner hold and brings them back when it lifts", async () => {
    const binding = await prisma.appointmentBinding.findFirstOrThrow({ where: { workspaceId, mixId } });
    await prisma.appointmentBinding.update({ where: { id: binding.id }, data: { heldAt: new Date() } });
    const held = await reconcileJumps({ workspaceId, mixId });
    expect(held).toMatchObject({ held: 2, canceled: 0 });
    expect((await rows(binding.id)).map((row) => [row.status, row.completionMethod])).toEqual([["CANCELED", APPOINTMENT_HOLD_METHODS.held], ["CANCELED", APPOINTMENT_HOLD_METHODS.held]]);
    await prisma.appointmentBinding.update({ where: { id: binding.id }, data: { heldAt: null } });
    const lifted = await reconcileJumps({ workspaceId, mixId });
    expect(lifted).toMatchObject({ updated: 2, held: 0 });
    expect((await rows(binding.id)).every((row) => row.status === "PENDING")).toBe(true);
    expect(await prisma.jumpDraft.count({ where: { jump: { appointmentBindingId: binding.id } } })).toBe(1);
  });

  it("holds work for a canceled appointment and for one that cannot be evaluated, without treating it as stale", async () => {
    const binding = await prisma.appointmentBinding.findFirstOrThrow({ where: { workspaceId, mixId } });
    await prisma.calendarEntry.update({ where: { id: binding.calendarEntryId }, data: { timezone: "Nowhere/Invalid" } });
    const failed = await reconcileJumps({ workspaceId, mixId });
    expect(failed).toMatchObject({ held: 2, failedBindings: 1, canceled: 0 });
    expect((await rows(binding.id)).every((row) => row.status === "CANCELED" && row.completionMethod === APPOINTMENT_HOLD_METHODS.unresolved)).toBe(true);
    expect(await prisma.appointmentBinding.findUniqueOrThrow({ where: { id: binding.id } })).toMatchObject({ lastEvaluationError: "The appointment's timezone is not valid." });
    await prisma.calendarEntry.update({ where: { id: binding.calendarEntryId }, data: { timezone: TIMEZONE } });
    const repaired = await reconcileJumps({ workspaceId, mixId });
    expect(repaired).toMatchObject({ updated: 2, failedBindings: 0 });
    expect(await prisma.appointmentBinding.findUniqueOrThrow({ where: { id: binding.id } })).toMatchObject({ lastEvaluationError: null });

    await prisma.calendarEntry.update({ where: { id: binding.calendarEntryId }, data: { canceledAt: new Date() } });
    const canceled = await reconcileJumps({ workspaceId, mixId });
    expect(canceled).toMatchObject({ held: 2, canceled: 0 });
    expect((await rows(binding.id)).every((row) => row.completionMethod === APPOINTMENT_HOLD_METHODS.canceled)).toBe(true);
    await prisma.calendarEntry.update({ where: { id: binding.calendarEntryId }, data: { canceledAt: null } });
    expect(await reconcileJumps({ workspaceId, mixId })).toMatchObject({ updated: 2 });
  });

  it("keeps two appointments for the same person apart, and apart from an unscoped enrollment", async () => {
    const first = await prisma.appointmentBinding.findFirstOrThrow({ where: { workspaceId, mixId } });
    const second = await bind(fixture.contactId, (await appointment(fixture.contactId, at(20, 10), "Follow-up visit")).id, mixId);
    await prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${mixId}:${fixture.contactId}`, workspaceId, mixId, contactId: fixture.contactId, mode: "SNAPSHOT", startDate: new Date() } });
    const result = await reconcileJumps({ workspaceId, mixId });
    expect(result.created).toBe(4);
    expect((await rows(second.id)).map((row) => row.reason)).toEqual(["Follow-up visit", "Follow-up visit"]);
    const unscoped = await prisma.jump.findMany({ where: { workspaceId, mixId, contactId: fixture.contactId, appointmentBindingId: null, status: "PENDING" } });
    expect(unscoped).toHaveLength(2);
    expect(unscoped.every((row) => row.renderedSnapshot && (row.renderedSnapshot as { body: string }).body.includes("see you  at"))).toBe(false);
    // Moving the second appointment touches only its own rows.
    const firstBefore = await rows(first.id);
    await prisma.calendarEntry.update({ where: { id: second.calendarEntryId }, data: { startsAt: at(21, 10), endsAt: at(21, 11) } });
    const moved = await reconcileJumps({ workspaceId, mixId });
    expect(moved).toMatchObject({ updated: 2, created: 0, canceled: 0 });
    expect((await rows(first.id)).map((row) => row.updatedAt.toISOString())).toEqual(firstBefore.map((row) => row.updatedAt.toISOString()));
  });

  it("never sends a bound follow-up automatically unless the binding allows it", async () => {
    await prisma.automationPreference.create({ data: { workspaceId, enabled: true, smsEnabled: true, reviewWindowMinutes: 15 } });
    // A visit three days ago recorded as having happened, so the beat after it is released, due, and inside the review window.
    const past = new Date(Date.now() - 3 * DAY);
    const happened = async (title: string) => (await appointment(fixture.contactId, past, title)).id;
    const quiet = await bind(fixture.contactId, await happened("Quiet visit"), await planWithFollowingBeat("Quiet plan"));
    const loud = await bind(fixture.contactId, await happened("Loud visit"), await planWithFollowingBeat("Loud plan"), { automaticDelivery: true });
    await prisma.calendarEntry.updateMany({ where: { workspaceId, title: { in: ["Quiet visit", "Loud visit"] } }, data: { outcome: "COMPLETED", outcomeAt: past } });
    await reconcileJumps({ workspaceId });
    await prisma.jump.updateMany({ where: { appointmentBindingId: { in: [quiet.id, loud.id] } }, data: { createdAt: new Date(Date.now() - 2 * DAY) } });
    await runAutomaticDeliveries(`bindings-${randomUUID().slice(0, 6)}`, new Date());
    const jumpIds = async (bindingId: string) => (await prisma.jump.findMany({ where: { appointmentBindingId: bindingId }, select: { id: true } })).map((row) => row.id);
    expect(await prisma.automatedDelivery.count({ where: { jumpId: { in: await jumpIds(quiet.id) } } })).toBe(0);
    expect(await prisma.automatedDelivery.count({ where: { jumpId: { in: await jumpIds(loud.id) } } })).toBeGreaterThan(0);
  });
});
