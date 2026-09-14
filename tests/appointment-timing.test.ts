import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StepAnchor } from "../src/generated/prisma/client";
import { recordAppointmentOutcome, scheduleVisit } from "../src/lib/appointment-bindings";
import { APPOINTMENT_HOLD_METHODS, reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const HOUR = 3_600_000, DAY = 24 * HOUR, MINUTE = 60_000;
type Beat = { body: string; anchor?: StepAnchor; offsetMinutes?: number | null; dayOffset?: number; sendTimeMinutes?: number | null };
/** Only the clock is frozen; timers stay real so the database client keeps working. */
function setClock(at: Date) { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at); }

describe.skipIf(!local).sequential("elapsed-minute timing for bound plans", () => {
  let fixture: BroadcastFixture;
  let workspaceId: string;
  const T0 = new Date(Math.floor(Date.now() / HOUR) * HOUR);

  async function plan(name: string, beats: Beat[]) {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name, channel: "SMS" } });
    const mix = await prisma.mix.create({ data: { workspaceId, name, triggerMode: "MANUAL_START", status: "ACTIVE" } });
    for (const [index, beat] of beats.entries()) {
      const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: index + 1, body: beat.body } });
      await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, sortOrder: index + 1, dayOffset: beat.dayOffset ?? 0, sendTimeMinutes: beat.sendTimeMinutes ?? null, anchor: beat.anchor ?? "CALENDAR_DAY", offsetMinutes: beat.offsetMinutes ?? null } });
    }
    return mix.id;
  }
  const visit = (planId: string, startsAt: Date, minutes: number, timezone: string, title: string, contactId = fixture.contactId) =>
    scheduleVisit({ workspaceId, title, kind: "MEETING", startsAt, endsAt: new Date(startsAt.getTime() + minutes * MINUTE), timezone, contactId, planId, allowOverlap: true });
  const rows = (bindingId: string) => prisma.jump.findMany({ where: { appointmentBindingId: bindingId }, include: { mixStep: { select: { sortOrder: true, anchor: true } } }, orderBy: { mixStep: { sortOrder: "asc" } } });
  const shape = async (bindingId: string) => (await rows(bindingId)).map((row) => [row.mixStep.sortOrder, row.status, row.completionMethod, row.scheduledAt.toISOString()]);
  const outcome = async (entryId: string, value: "COMPLETED" | "NO_SHOW" | null) => {
    const entry = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: entryId } });
    return recordAppointmentOutcome({ workspaceId, actorUserId: fixture.userId, entryId, version: entry.version, outcome: value });
  };

  beforeAll(async () => {
    setClock(T0);
    fixture = await createBroadcastFixture("timing", "Ren");
    workspaceId = fixture.workspaceId;
  });
  afterAll(async () => { vi.useRealTimers(); await fixture.cleanup(); });

  it("times beats in elapsed minutes from the visit, holds what follows until the outcome, and skips them without a visit", async () => {
    const planId = await plan("Elapsed plan", [
      { body: "Leaving now, see you soon", anchor: "APPOINTMENT_START", offsetMinutes: -90 },
      { body: "Running on time?", anchor: "APPOINTMENT_START", offsetMinutes: 30 },
      { body: "Thanks for having me", anchor: "APPOINTMENT_END", offsetMinutes: 60 },
      { body: "Estimate attached", anchor: "VISIT_COMPLETED", offsetMinutes: 1440 }
    ]);
    const startsAt = new Date(T0.getTime() + 2 * DAY);
    const bound = await visit(planId, startsAt, 45, "America/Denver", "Kitchen estimate");
    // The same person also has the plan on its own, with no appointment to count from.
    await prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${planId}:${fixture.contactId}`, workspaceId, mixId: planId, contactId: fixture.contactId, mode: "SNAPSHOT", startDate: new Date() } });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ created: 1, held: 0, canceled: 0, failedBindings: 0 });
    expect(await shape(bound.bindingId!)).toEqual([[1, "PENDING", null, new Date(startsAt.getTime() - 90 * MINUTE).toISOString()]]);
    expect(await prisma.jump.count({ where: { workspaceId, mixId: planId, appointmentBindingId: null } })).toBe(0);
    // Nothing moved it to a workday or out of quiet hours: the instant is exactly ninety minutes before the start.
    const [first] = await rows(bound.bindingId!);
    expect(first.baseScheduledAt?.toISOString()).toBe(new Date(startsAt.getTime() - 90 * MINUTE).toISOString());
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ created: 0, updated: 0, held: 0, canceled: 0 });
  });

  it("moves eligible pending rows in place when the visit is rescheduled, keeping drafts and the snooze rule, and leaves done work alone", async () => {
    const planId = await plan("Reschedule plan", [
      { body: "Two hours out", anchor: "APPOINTMENT_START", offsetMinutes: -120 },
      { body: "Half an hour out", anchor: "APPOINTMENT_START", offsetMinutes: -30 },
      { body: "Day before at nine", dayOffset: -1, sendTimeMinutes: 9 * 60 }
    ]);
    const startsAt = new Date(T0.getTime() + 3 * DAY);
    const bound = await visit(planId, startsAt, 30, "America/Denver", "Site walk");
    await reconcileJumps({ workspaceId, mixId: planId });
    const before = await rows(bound.bindingId!);
    expect(before.map((row) => row.status)).toEqual(["PENDING", "PENDING", "PENDING"]);
    const [twoHours, halfHour] = before;
    await prisma.jumpDraft.create({ data: { jumpId: twoHours.id, family: "TEXT", workspaceId, body: "My own wording", stepVersionId: twoHours.stepVersionId } });
    // A snooze later than the moved base wins; the other elapsed row is already done and never moves.
    const snoozedUntil = new Date(startsAt.getTime() + 5 * HOUR);
    await prisma.jump.update({ where: { id: twoHours.id }, data: { snoozedUntil, scheduledAt: snoozedUntil } });
    await prisma.jump.update({ where: { id: halfHour.id }, data: { status: "DONE", completedAt: new Date(), completionMethod: "manual" } });
    const entry = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: bound.entryId } });
    const movedStart = new Date(startsAt.getTime() + 3 * HOUR);
    await prisma.calendarEntry.update({ where: { id: entry.id }, data: { startsAt: movedStart, endsAt: new Date(movedStart.getTime() + 30 * MINUTE), version: entry.version + 1 } });
    // Only the elapsed row moves: the calendar-day beat keeps its day and the done row is never touched.
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ updated: 1, created: 0, canceled: 0, held: 0 });
    const after = await rows(bound.bindingId!);
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(after[0].baseScheduledAt?.toISOString()).toBe(new Date(movedStart.getTime() - 120 * MINUTE).toISOString());
    expect(after[0].scheduledAt.toISOString()).toBe(snoozedUntil.toISOString());
    expect(after[0].snoozedUntil?.toISOString()).toBe(snoozedUntil.toISOString());
    expect(after[1]).toMatchObject({ status: "DONE", scheduledAt: halfHour.scheduledAt });
    expect(after[2].scheduledAt.toISOString()).toBe(before[2].scheduledAt.toISOString());
    expect(await prisma.jumpDraft.findUnique({ where: { jumpId_family: { jumpId: twoHours.id, family: "TEXT" } } })).toMatchObject({ body: "My own wording" });
  });

  it("counts a completion beat from the recorded completion, re-times it on correction, and never resurrects expired preparation", async () => {
    const planId = await plan("Completion plan", [
      { body: "On my way", anchor: "APPOINTMENT_START", offsetMinutes: -60 },
      { body: "Thanks for your time", anchor: "APPOINTMENT_END", offsetMinutes: 120 },
      { body: "Here is the estimate", anchor: "VISIT_COMPLETED", offsetMinutes: 0 },
      { body: "Any questions?", anchor: "VISIT_COMPLETED", offsetMinutes: 2 * 1440 }
    ]);
    const startsAt = new Date(T0.getTime() + DAY);
    const bound = await visit(planId, startsAt, 60, "America/Denver", "Bathroom estimate");
    await reconcileJumps({ workspaceId, mixId: planId });
    expect((await shape(bound.bindingId!)).map((row) => row[0])).toEqual([1]);
    // The visit happens; the owner marks it completed an hour after it ended.
    const completedAt = new Date(startsAt.getTime() + 2 * HOUR);
    setClock(completedAt);
    expect(await outcome(bound.entryId, "COMPLETED")).toEqual({ ok: true });
    const recorded = (await prisma.calendarEntry.findUniqueOrThrow({ where: { id: bound.entryId } })).outcomeAt!;
    expect(recorded.toISOString()).toBe(completedAt.toISOString());
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ held: 1, created: 3, canceled: 0 });
    expect(await shape(bound.bindingId!)).toEqual([
      [1, "CANCELED", APPOINTMENT_HOLD_METHODS.completed, new Date(startsAt.getTime() - 60 * MINUTE).toISOString()],
      [2, "PENDING", null, new Date(startsAt.getTime() + 60 * MINUTE + 120 * MINUTE).toISOString()],
      [3, "PENDING", null, recorded.toISOString()],
      [4, "PENDING", null, new Date(recorded.getTime() + 2 * DAY).toISOString()]
    ]);
    const questions = (await rows(bound.bindingId!))[3];
    await prisma.jumpDraft.create({ data: { jumpId: questions.id, family: "TEXT", workspaceId, body: "Questions, in my words", stepVersionId: questions.stepVersionId } });
    // The outcome was a mistake: everything that follows waits again, and the passed preparation stays lapsed.
    setClock(new Date(completedAt.getTime() + HOUR));
    expect(await outcome(bound.entryId, null)).toEqual({ ok: true });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ held: 4, created: 0, updated: 0, canceled: 0 });
    expect((await shape(bound.bindingId!)).map((row) => [row[0], row[1], row[2]])).toEqual([
      [1, "CANCELED", APPOINTMENT_HOLD_METHODS.passed],
      [2, "CANCELED", APPOINTMENT_HOLD_METHODS.outcomePending],
      [3, "CANCELED", APPOINTMENT_HOLD_METHODS.outcomePending],
      [4, "CANCELED", APPOINTMENT_HOLD_METHODS.outcomePending]
    ]);
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ held: 0, created: 0, updated: 0, canceled: 0 });
    // Marked completed again, later: the completion beats count from the new recorded moment, in the same rows, draft intact.
    const completedAgain = new Date(completedAt.getTime() + 3 * HOUR);
    setClock(completedAgain);
    expect(await outcome(bound.entryId, "COMPLETED")).toEqual({ ok: true });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ held: 1, updated: 3, created: 0, canceled: 0 });
    const again = await rows(bound.bindingId!);
    expect(again.map((row) => row.id)).toEqual((await rows(bound.bindingId!)).map((row) => row.id));
    expect(again[3].id).toBe(questions.id);
    expect(await shape(bound.bindingId!)).toEqual([
      [1, "CANCELED", APPOINTMENT_HOLD_METHODS.completed, new Date(startsAt.getTime() - 60 * MINUTE).toISOString()],
      [2, "PENDING", null, new Date(startsAt.getTime() + 60 * MINUTE + 120 * MINUTE).toISOString()],
      [3, "PENDING", null, completedAgain.toISOString()],
      [4, "PENDING", null, new Date(completedAgain.getTime() + 2 * DAY).toISOString()]
    ]);
    expect(await prisma.jumpDraft.findUnique({ where: { jumpId_family: { jumpId: questions.id, family: "TEXT" } } })).toMatchObject({ body: "Questions, in my words" });
    // A missed visit holds the completion beats like everything else.
    expect(await outcome(bound.entryId, "NO_SHOW")).toEqual({ ok: true });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ held: 4 });
    expect((await rows(bound.bindingId!)).every((row) => row.completionMethod === APPOINTMENT_HOLD_METHODS.noShow)).toBe(true);
    setClock(T0);
  });

  it("keeps elapsed durations exact across a daylight-saving change while calendar-day beats keep their wall-clock time, and ignores the timezone", async () => {
    const planId = await plan("Autumn plan", [
      { body: "Four hours out", anchor: "APPOINTMENT_START", offsetMinutes: -240 },
      { body: "Day before at nine", dayOffset: -1, sendTimeMinutes: 9 * 60 }
    ]);
    // Denver leaves daylight time at 02:00 on 2026-11-01. The visit is at 01:30 that morning (07:30Z, still MDT).
    setClock(new Date("2026-10-20T12:00:00Z"));
    const startsAt = new Date("2026-11-01T07:30:00Z");
    const bound = await visit(planId, startsAt, 30, "America/Denver", "Early visit");
    await reconcileJumps({ workspaceId, mixId: planId });
    expect(await shape(bound.bindingId!)).toEqual([
      [1, "PENDING", null, "2026-11-01T03:30:00.000Z"],
      [2, "PENDING", null, "2026-10-31T15:00:00.000Z"]
    ]);
    // Moved a day later, into standard time: the elapsed beat is still exactly four hours before, the calendar beat is still nine in the morning local time.
    const entry = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: bound.entryId } });
    const movedStart = new Date("2026-11-02T08:30:00Z");
    await prisma.calendarEntry.update({ where: { id: entry.id }, data: { startsAt: movedStart, endsAt: new Date(movedStart.getTime() + 30 * MINUTE), version: entry.version + 1 } });
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ updated: 2, created: 0, canceled: 0 });
    expect(await shape(bound.bindingId!)).toEqual([
      [1, "PENDING", null, "2026-11-02T04:30:00.000Z"],
      [2, "PENDING", null, "2026-11-01T16:00:00.000Z"]
    ]);
    // The same instant in Tokyo gives the same elapsed beat and a calendar beat on its own local day.
    const other = await prisma.contact.create({ data: { workspaceId, firstName: "Yui", displayName: "Yui" } });
    const tokyo = await visit(planId, startsAt, 30, "Asia/Tokyo", "Tokyo visit", other.id);
    await reconcileJumps({ workspaceId, mixId: planId });
    expect(await shape(tokyo.bindingId!)).toEqual([
      [1, "PENDING", null, "2026-11-01T03:30:00.000Z"],
      [2, "PENDING", null, "2026-10-31T00:00:00.000Z"]
    ]);
    setClock(T0);
  });

  it("leaves another visit's rows untouched when one visit's outcome changes", async () => {
    const planId = await plan("Two visits plan", [
      { body: "Heads up", anchor: "APPOINTMENT_START", offsetMinutes: -60 },
      { body: "Follow through", anchor: "VISIT_COMPLETED", offsetMinutes: 60 }
    ]);
    const first = await visit(planId, new Date(T0.getTime() + DAY), 30, "America/Denver", "First");
    const second = await visit(planId, new Date(T0.getTime() + 4 * DAY), 30, "America/Denver", "Second");
    await reconcileJumps({ workspaceId, mixId: planId });
    const secondBefore = await shape(second.bindingId!);
    expect(secondBefore.map((row) => row[1])).toEqual(["PENDING"]);
    setClock(new Date(T0.getTime() + DAY + 2 * HOUR));
    expect(await outcome(first.entryId, "COMPLETED")).toEqual({ ok: true });
    await reconcileJumps({ workspaceId, mixId: planId });
    expect((await shape(first.bindingId!)).map((row) => [row[0], row[1]])).toEqual([[1, "CANCELED"], [2, "PENDING"]]);
    expect(await shape(second.bindingId!)).toEqual(secondBefore);
    expect(await outcome(first.entryId, null)).toEqual({ ok: true });
    await reconcileJumps({ workspaceId, mixId: planId });
    expect(await shape(second.bindingId!)).toEqual(secondBefore);
    setClock(T0);
  });
});
