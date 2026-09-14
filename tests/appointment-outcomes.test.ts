import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAppointmentOutcome, scheduleVisit } from "../src/lib/appointment-bindings";
import { APPOINTMENT_HOLD_METHODS, reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const DAY = 86_400_000;
const TIMEZONE = "America/Denver";
/** Tomorrow at 14:00 in Denver (20:00 UTC in September), so a same-day beat can fall on either side of the start. */
function tomorrowAtTwo(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 20, 0));
}

describe.sequential("visit outcomes anchor the bound plan", () => {
  let fixture: BroadcastFixture;
  let workspaceId: string;
  let planId: string;
  let entryId: string;
  let bindingId: string;
  let visitStartsAt: Date;
  const rows = () => prisma.jump.findMany({ where: { appointmentBindingId: bindingId }, include: { mixStep: { select: { dayOffset: true, sortOrder: true } } }, orderBy: { mixStep: { sortOrder: "asc" } } });
  const shape = async () => (await rows()).map((row) => [row.mixStep.sortOrder, row.status, row.completionMethod]);
  const outcome = async (value: "COMPLETED" | "NO_SHOW" | null) => {
    const entry = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: entryId } });
    return recordAppointmentOutcome({ workspaceId, actorUserId: fixture.userId, entryId, version: entry.version, outcome: value });
  };

  beforeAll(async () => {
    fixture = await createBroadcastFixture("outcome", "Sam");
    workspaceId = fixture.workspaceId;
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Visit plan", channel: "SMS" } });
    const version = (n: number, body: string) => prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: n, body } });
    const dayBefore = await version(1, "Reminder for {{Appointment Date}}");
    const morningOf = await version(2, "See you at {{Appointment Time}} today");
    const afterVisit = await version(3, "Thanks for today, {{First Name}}");
    const weekOn = await version(4, "How is everything a week on?");
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Visit plan", triggerMode: "MANUAL_START", status: "ACTIVE" } });
    planId = mix.id;
    await prisma.mixStep.createMany({ data: [
      { mixId: mix.id, stepVersionId: dayBefore.id, dayOffset: -1, sortOrder: 1, sendTimeMinutes: 9 * 60 },
      // Same day, before the 14:00 visit: preparation too.
      { mixId: mix.id, stepVersionId: morningOf.id, dayOffset: 0, sortOrder: 2, sendTimeMinutes: 8 * 60 },
      // Same day with no time of its own: at the visit's time, so it follows the visit.
      { mixId: mix.id, stepVersionId: afterVisit.id, dayOffset: 0, sortOrder: 3 },
      { mixId: mix.id, stepVersionId: weekOn.id, dayOffset: 7, sortOrder: 4, sendTimeMinutes: 10 * 60 }
    ] });
    const startsAt = tomorrowAtTwo();
    visitStartsAt = startsAt;
    const result = await scheduleVisit({ workspaceId, title: "Site visit", kind: "MEETING", startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: TIMEZONE, contactId: fixture.contactId, planId, allowOverlap: true });
    entryId = result.entryId; bindingId = result.bindingId!;
  });
  afterAll(() => fixture.cleanup());

  it("prepares only the beats before the visit until its outcome is recorded", async () => {
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ created: 2, held: 0, canceled: 0, failedBindings: 0 });
    // What follows the visit is not on the calendar's word alone: no row exists for it yet.
    expect(await shape()).toEqual([[1, "PENDING", null], [2, "PENDING", null]]);
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ created: 0, updated: 0, held: 0, canceled: 0 });
  });

  it("lets preparation lapse, the same-day reminder included, and releases what follows once the visit happened", async () => {
    expect(await outcome("COMPLETED")).toEqual({ ok: true });
    const stale = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(await recordAppointmentOutcome({ workspaceId, entryId, version: stale.version - 1, outcome: "COMPLETED" })).toMatchObject({ ok: false, message: expect.stringContaining("changed") });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ held: 2, created: 2, canceled: 0, failedBindings: 0 });
    expect(await shape()).toEqual([
      [1, "CANCELED", APPOINTMENT_HOLD_METHODS.completed],
      [2, "CANCELED", APPOINTMENT_HOLD_METHODS.completed],
      [3, "PENDING", null],
      [4, "PENDING", null]
    ]);
    // A beat with no time of its own goes out at the visit's time; the timing stays day-based.
    expect((await rows()).find((row) => row.mixStep.sortOrder === 3)!.scheduledAt.toISOString()).toBe(visitStartsAt.toISOString());
    expect(await prisma.journeyEvent.count({ where: { workspaceId, contactId: fixture.contactId, eventType: "MEETING_COMPLETED" } })).toBe(1);
    expect(await prisma.contactActivity.count({ where: { contactId: fixture.contactId, summary: "Visit happened: Site visit" } })).toBe(1);
    // A second pass changes nothing.
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ created: 0, updated: 0, held: 0, canceled: 0 });
  });

  it("brings preparation back and re-holds what follows when the outcome is cleared after the visit, keeping a draft", async () => {
    const weekOn = (await rows()).find((row) => row.mixStep.sortOrder === 4)!;
    await prisma.jumpDraft.create({ data: { jumpId: weekOn.id, family: "TEXT", workspaceId, body: "Custom wording the owner wrote", stepVersionId: weekOn.stepVersionId } });
    expect(await outcome(null)).toEqual({ ok: true });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ held: 2, updated: 2, created: 0, canceled: 0 });
    expect(await shape()).toEqual([
      [1, "PENDING", null],
      [2, "PENDING", null],
      [3, "CANCELED", APPOINTMENT_HOLD_METHODS.outcomePending],
      [4, "CANCELED", APPOINTMENT_HOLD_METHODS.outcomePending]
    ]);
    expect(await prisma.contactActivity.count({ where: { contactId: fixture.contactId, summary: "Visit outcome cleared: Site visit" } })).toBe(1);
    // Recording the visit again releases the same rows, so the draft is exactly where it was.
    expect(await outcome("COMPLETED")).toEqual({ ok: true });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ held: 2, updated: 2, created: 0, canceled: 0 });
    expect(await shape()).toEqual([
      [1, "CANCELED", APPOINTMENT_HOLD_METHODS.completed],
      [2, "CANCELED", APPOINTMENT_HOLD_METHODS.completed],
      [3, "PENDING", null],
      [4, "PENDING", null]
    ]);
    expect((await rows()).find((row) => row.mixStep.sortOrder === 4)!.id).toBe(weekOn.id);
    expect(await prisma.jumpDraft.findUnique({ where: { jumpId_family: { jumpId: weekOn.id, family: "TEXT" } } })).toMatchObject({ body: "Custom wording the owner wrote" });
  });

  it("holds every bound beat for a missed visit, whatever it was held for before, and restores preparation when cleared", async () => {
    expect(await outcome("NO_SHOW")).toEqual({ ok: true });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ held: 4, canceled: 0 });
    expect((await rows()).map((row) => [row.status, row.completionMethod])).toEqual(Array(4).fill(["CANCELED", APPOINTMENT_HOLD_METHODS.noShow]));
    expect(await prisma.journeyEvent.count({ where: { workspaceId, contactId: fixture.contactId, eventType: "MEETING_NO_SHOW" } })).toBe(1);
    expect(await outcome(null)).toEqual({ ok: true });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ held: 2, updated: 2, canceled: 0 });
    expect(await shape()).toEqual([
      [1, "PENDING", null],
      [2, "PENDING", null],
      [3, "CANCELED", APPOINTMENT_HOLD_METHODS.outcomePending],
      [4, "CANCELED", APPOINTMENT_HOLD_METHODS.outcomePending]
    ]);
  });

  it("refuses an outcome on a time block and never touches another visit's rows", async () => {
    const block = await prisma.calendarEntry.create({ data: { workspaceId, title: "Focus time", kind: "BLOCK", startsAt: new Date(Date.now() + 2 * DAY), endsAt: new Date(Date.now() + 2 * DAY + 3_600_000), timezone: TIMEZONE } });
    expect(await recordAppointmentOutcome({ workspaceId, entryId: block.id, outcome: "COMPLETED" })).toMatchObject({ ok: false, message: expect.stringContaining("meeting") });
    const other = await scheduleVisit({ workspaceId, title: "Other visit", kind: "MEETING", startsAt: new Date(Date.now() + 3 * DAY), endsAt: new Date(Date.now() + 3 * DAY + 1_800_000), timezone: TIMEZONE, contactId: fixture.contactId, planId, allowOverlap: true });
    await reconcileJumps({ workspaceId, mixId: planId });
    const before = await prisma.jump.findMany({ where: { appointmentBindingId: other.bindingId! }, select: { id: true, status: true } });
    expect(before.length).toBe(2);
    expect(await outcome("NO_SHOW")).toEqual({ ok: true });
    await reconcileJumps({ workspaceId, mixId: planId });
    expect(await prisma.jump.findMany({ where: { appointmentBindingId: other.bindingId! }, select: { id: true, status: true } })).toEqual(before);
  });
});
