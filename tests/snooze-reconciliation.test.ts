import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reconcileJumps } from "../src/lib/jump-engine";
import { logicalDateFromDate, zonedDateTimeToUtc } from "../src/lib/jump-schedule";
import { prisma } from "../src/lib/prisma";
import { BROADCAST_TIMEZONE, createBroadcastFixture, localDateDaysFromToday, type BroadcastFixture } from "./helpers/broadcast-fixture";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const baseAt = (days: number, timeMinutes = 600) =>
  zonedDateTimeToUtc(logicalDateFromDate(localDateDaysFromToday(days, now)), timeMinutes, BROADCAST_TIMEZONE).toISOString();
// The same write the snooze action performs once the not-before time is resolved.
const snooze = (jumpId: string, until: Date) => prisma.jump.update({ where: { id: jumpId }, data: { scheduledAt: until, snoozedUntil: until } });

describe.sequential("snoozed follow-ups survive reconciliation", () => {
  let fixture: BroadcastFixture;
  let mixId: string;
  let jumpId: string;
  const pendingJump = () => prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, mixId, status: "PENDING" } });

  beforeAll(async () => {
    fixture = await createBroadcastFixture("snooze");
    // The broadcast went out three days ago, so its follow-up is overdue and the kind of row an owner snoozes.
    mixId = await fixture.addBroadcast("Snooze Broadcast", -3);
  });
  afterAll(() => fixture.cleanup());

  it("keeps the chosen time through repeated reconciliation", async () => {
    await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    const jump = await pendingJump();
    jumpId = jump.id;
    expect(jump.scheduledAt.toISOString()).toBe(baseAt(-3));
    expect(jump.baseScheduledAt?.toISOString()).toBe(baseAt(-3));

    const until = new Date(now.getTime() + 2 * DAY);
    await snooze(jump.id, until);
    const first = await reconcileJumps({ workspaceId: fixture.workspaceId });
    const second = await reconcileJumps({ workspaceId: fixture.workspaceId });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } });
    expect(first.updated + second.updated).toBe(0);
    expect(after.status).toBe("PENDING");
    expect(after.scheduledAt.toISOString()).toBe(until.toISOString());
    expect(after.snoozedUntil?.toISOString()).toBe(until.toISOString());
  });

  it("refreshes the rendered message without touching the snooze", async () => {
    await prisma.contact.update({ where: { id: fixture.contactId }, data: { firstName: "Alexandra", displayName: "Alexandra" } });
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } });
    expect(result.updated).toBe(1);
    expect(after.status).toBe("PENDING");
    expect(after.renderedSnapshot).toMatchObject({ body: "Hi Alexandra" });
    expect(after.scheduledAt.toISOString()).toBe(after.snoozedUntil?.toISOString());
  });

  it("stays due at the chosen time after that time has passed", async () => {
    const passed = new Date(now.getTime() - DAY);
    await snooze(jumpId, passed);
    await reconcileJumps({ workspaceId: fixture.workspaceId });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } });
    expect(after.status).toBe("PENDING");
    expect(after.scheduledAt.toISOString()).toBe(passed.toISOString());
  });

  it("keeps the snooze when a paused mix resumes", async () => {
    await prisma.jump.update({ where: { id: jumpId }, data: { status: "CANCELED", completionMethod: "mix_paused", completedAt: new Date() } });
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } });
    expect(result.updated).toBe(1);
    expect(after.status).toBe("PENDING");
    expect(after.completedAt).toBeNull();
    expect(after.scheduledAt.toISOString()).toBe(after.snoozedUntil?.toISOString());
  });

  it("does not carry a snooze onto a different occurrence when the broadcast moves", async () => {
    // Saved-date, manual and broadcast modes identify an action by its occurrence date. Moving the
    // source creates a new action, and the snooze belonged to the old one. Appointment-anchored
    // follow-ups will get a stable identity separately.
    await prisma.mixBroadcastSchedule.update({ where: { mixId }, data: { localDate: localDateDaysFromToday(5, now) } });
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    expect(result.created).toBe(1);
    expect(result.canceled).toBe(1);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status).toBe("CANCELED");
    const fresh = await pendingJump();
    expect(fresh.snoozedUntil).toBeNull();
    expect(fresh.scheduledAt.toISOString()).toBe(baseAt(5));
  });

  it("carries the snooze onto the row regenerated after a time edit", async () => {
    // Changing only the time keeps the occurrence but changes the legacy key. The old row is
    // cancelled as stale and the new one inherits the snooze.
    const before = await pendingJump();
    const until = new Date(now.getTime() + 9 * DAY);
    await snooze(before.id, until);
    await prisma.mixBroadcastSchedule.update({ where: { mixId }, data: { timeMinutes: 690 } });
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    expect(result.created).toBe(1);
    expect(result.canceled).toBe(1);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: before.id } })).status).toBe("CANCELED");
    const after = await pendingJump();
    expect(after.id).not.toBe(before.id);
    expect(after.snoozedUntil?.toISOString()).toBe(until.toISOString());
    expect(after.scheduledAt.toISOString()).toBe(until.toISOString());
    expect(after.baseScheduledAt?.toISOString()).toBe(baseAt(5, 690));
  });
});

describe.sequential("a long-overdue snoozed follow-up outlives the generation window", () => {
  let fixture: BroadcastFixture;

  beforeAll(async () => {
    fixture = await createBroadcastFixture("overdue", "Sam");
    // The broadcast went out 60 days ago, well before the 45-day default window.
    await fixture.addBroadcast("Overdue Broadcast", -60);
    // Generate it as the worker would have 57 days ago, when the broadcast was three days overdue.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(now.getTime() - 57 * DAY));
      await reconcileJumps({ workspaceId: fixture.workspaceId });
    } finally {
      vi.useRealTimers();
    }
  });
  afterAll(() => fixture.cleanup());

  it("is kept at its snoozed time instead of being cancelled as stale", async () => {
    const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, status: "PENDING" } });
    expect(jump.scheduledAt.toISOString()).toBe(baseAt(-60));
    const until = new Date(now.getTime() + 2 * DAY);
    await snooze(jump.id, until);

    const result = await reconcileJumps({ workspaceId: fixture.workspaceId });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } });
    expect(result.canceled).toBe(0);
    expect(after.status).toBe("PENDING");
    expect(after.scheduledAt.toISOString()).toBe(until.toISOString());
  });

  it("returns from a pause at its snoozed time", async () => {
    const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, status: "PENDING" } });
    // The cancellation the pause action writes for a follow-up that is still ahead.
    await prisma.jump.update({ where: { id: jump.id }, data: { status: "CANCELED", completedAt: new Date(), completionMethod: "mix_paused" } });
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } });
    expect(result.updated).toBe(1);
    expect(after.status).toBe("PENDING");
    expect(after.scheduledAt.toISOString()).toBe(after.snoozedUntil?.toISOString());
  });
});
