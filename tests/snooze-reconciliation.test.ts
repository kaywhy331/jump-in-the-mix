import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reconcileJumps } from "../src/lib/jump-engine";
import { baseScheduledAtFromSnapshot, logicalDateFromDate, zonedDateTimeToUtc } from "../src/lib/jump-schedule";
import { prisma } from "../src/lib/prisma";
import { resolveSnooze } from "../src/lib/snooze-schedule";

const DAY = 24 * 60 * 60 * 1000;

describe("snooze resolution", () => {
  it("never pulls a follow-up ahead of its base instant", () => {
    const base = new Date("2026-09-20T17:00:00.000Z");
    const earlier = new Date("2026-09-18T17:00:00.000Z");
    const later = new Date("2026-09-22T17:00:00.000Z");
    expect(resolveSnooze({ chosen: earlier, baseScheduledAt: base })).toEqual({ ok: false, dueAt: base });
    expect(resolveSnooze({ chosen: later, baseScheduledAt: base })).toEqual({ ok: true, scheduledAt: later });
    expect(resolveSnooze({ chosen: earlier, baseScheduledAt: null })).toEqual({ ok: true, scheduledAt: earlier });
  });

  it("recovers the base instant from stored scheduling provenance", () => {
    expect(baseScheduledAtFromSnapshot({ localDateTime: "2026-09-20T10:00", timezone: "America/Los_Angeles" })?.toISOString())
      .toBe("2026-09-20T17:00:00.000Z");
    expect(baseScheduledAtFromSnapshot({ body: "Hi" })).toBeNull();
    expect(baseScheduledAtFromSnapshot({ localDateTime: "not a time", timezone: "UTC" })).toBeNull();
    expect(baseScheduledAtFromSnapshot(null)).toBeNull();
  });
});

describe.sequential("snoozed follow-ups survive reconciliation", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};
  const now = new Date();
  const timezone = "America/Los_Angeles";
  // The broadcast went out three days ago, so its follow-up is overdue and the kind of row an owner snoozes.
  const localDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3, 12));

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `snooze-${suffix}@example.com`, name: "Snooze Owner", passwordHash: "test-only" } });
    ids.user = user.id;
    const workspace = await prisma.workspace.create({
      data: { name: "Snooze Workspace", slug: `snooze-${suffix}`, ownerId: user.id, profile: { create: {} } }
    });
    ids.workspace = workspace.id;
    const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, firstName: "Alex", displayName: "Alex" } });
    ids.contact = contact.id;
    const template = await prisma.stepTemplate.create({ data: { workspaceId: workspace.id, name: "Snooze SMS", channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}" } });
    const mix = await prisma.mix.create({ data: { workspaceId: workspace.id, name: "Snooze Broadcast", triggerMode: "BROADCAST", status: "ACTIVE" } });
    ids.mix = mix.id;
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
    await prisma.mixAssignment.create({
      data: { assignmentKey: `${workspace.id}:${mix.id}:audience:${contact.id}`, workspaceId: workspace.id, mixId: mix.id, contactId: contact.id, mode: "DYNAMIC" }
    });
    await prisma.mixBroadcastSchedule.create({ data: { workspaceId: workspace.id, mixId: mix.id, localDate, timeMinutes: 600, timezone } });
  });

  afterAll(async () => {
    if (ids.workspace) {
      await prisma.mixBroadcastSchedule.deleteMany({ where: { workspaceId: ids.workspace } });
      await prisma.workspace.deleteMany({ where: { id: ids.workspace } });
    }
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  function pendingJump() {
    return prisma.jump.findFirstOrThrow({ where: { workspaceId: ids.workspace, mixId: ids.mix, status: "PENDING" } });
  }

  // The same write the snooze action performs once the not-before time is resolved.
  function snooze(jumpId: string, until: Date) {
    return prisma.jump.update({ where: { id: jumpId }, data: { scheduledAt: until, snoozedUntil: until } });
  }

  it("keeps the chosen time through repeated reconciliation", async () => {
    await reconcileJumps({ workspaceId: ids.workspace, mixId: ids.mix });
    const jump = await pendingJump();
    ids.jump = jump.id;
    const base = zonedDateTimeToUtc(logicalDateFromDate(localDate), 600, timezone);
    expect(jump.scheduledAt.toISOString()).toBe(base.toISOString());
    expect(baseScheduledAtFromSnapshot(jump.templateSnapshot)?.toISOString()).toBe(base.toISOString());

    const until = new Date(now.getTime() + 2 * DAY);
    await snooze(jump.id, until);
    const first = await reconcileJumps({ workspaceId: ids.workspace });
    const second = await reconcileJumps({ workspaceId: ids.workspace });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } });
    expect(first.updated + second.updated).toBe(0);
    expect(after.status).toBe("PENDING");
    expect(after.scheduledAt.toISOString()).toBe(until.toISOString());
    expect(after.snoozedUntil?.toISOString()).toBe(until.toISOString());
  });

  it("refreshes the rendered message without touching the snooze", async () => {
    await prisma.contact.update({ where: { id: ids.contact }, data: { firstName: "Alexandra", displayName: "Alexandra" } });
    const result = await reconcileJumps({ workspaceId: ids.workspace });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: ids.jump } });
    expect(result.updated).toBe(1);
    expect(after.renderedSnapshot).toMatchObject({ body: "Hi Alexandra" });
    expect(after.scheduledAt.toISOString()).toBe(after.snoozedUntil?.toISOString());
  });

  it("stays due at the chosen time after that time has passed", async () => {
    const passed = new Date(now.getTime() - DAY);
    await snooze(ids.jump, passed);
    await reconcileJumps({ workspaceId: ids.workspace });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: ids.jump } });
    expect(after.status).toBe("PENDING");
    expect(after.scheduledAt.toISOString()).toBe(passed.toISOString());
  });

  it("keeps the snooze when a paused mix resumes", async () => {
    await prisma.jump.update({ where: { id: ids.jump }, data: { status: "CANCELED", completionMethod: "mix_paused", completedAt: new Date() } });
    const result = await reconcileJumps({ workspaceId: ids.workspace });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: ids.jump } });
    expect(result.updated).toBe(1);
    expect(after.status).toBe("PENDING");
    expect(after.completedAt).toBeNull();
    expect(after.scheduledAt.toISOString()).toBe(after.snoozedUntil?.toISOString());
  });

  it("does not carry a snooze onto a different occurrence when the broadcast moves", async () => {
    // Saved-date, manual and broadcast modes identify an action by its occurrence date. Moving the
    // source creates a new action, and the snooze belonged to the old one. Appointment-anchored
    // follow-ups will get a stable identity separately.
    const movedLocalDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 5, 12));
    await prisma.mixBroadcastSchedule.update({ where: { mixId: ids.mix }, data: { localDate: movedLocalDate } });
    const result = await reconcileJumps({ workspaceId: ids.workspace, mixId: ids.mix });
    expect(result.created).toBe(1);
    expect(result.canceled).toBe(1);
    const old = await prisma.jump.findUniqueOrThrow({ where: { id: ids.jump } });
    expect(old.status).toBe("CANCELED");
    const fresh = await pendingJump();
    expect(fresh.snoozedUntil).toBeNull();
    expect(fresh.scheduledAt.toISOString()).toBe(zonedDateTimeToUtc(logicalDateFromDate(movedLocalDate), 600, timezone).toISOString());
  });
});

describe.sequential("a long-overdue snoozed follow-up outlives the generation window", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};
  const now = new Date();
  const timezone = "America/Los_Angeles";
  // The broadcast went out 60 days ago, well before the 45-day default window.
  const localDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 60, 12));

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `overdue-${suffix}@example.com`, name: "Overdue Owner", passwordHash: "test-only" } });
    ids.user = user.id;
    const workspace = await prisma.workspace.create({ data: { name: "Overdue Workspace", slug: `overdue-${suffix}`, ownerId: user.id, profile: { create: {} } } });
    ids.workspace = workspace.id;
    const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, firstName: "Sam", displayName: "Sam" } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId: workspace.id, name: "Overdue SMS", channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}" } });
    const mix = await prisma.mix.create({ data: { workspaceId: workspace.id, name: "Overdue Broadcast", triggerMode: "BROADCAST", status: "ACTIVE" } });
    ids.mix = mix.id;
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
    await prisma.mixAssignment.create({
      data: { assignmentKey: `${workspace.id}:${mix.id}:audience:${contact.id}`, workspaceId: workspace.id, mixId: mix.id, contactId: contact.id, mode: "DYNAMIC" }
    });
    await prisma.mixBroadcastSchedule.create({ data: { workspaceId: workspace.id, mixId: mix.id, localDate, timeMinutes: 600, timezone } });
    // Generate it as the worker would have 57 days ago, when the broadcast was three days overdue.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(now.getTime() - 57 * DAY));
      await reconcileJumps({ workspaceId: workspace.id });
    } finally {
      vi.useRealTimers();
    }
  });

  afterAll(async () => {
    if (ids.workspace) {
      await prisma.mixBroadcastSchedule.deleteMany({ where: { workspaceId: ids.workspace } });
      await prisma.workspace.deleteMany({ where: { id: ids.workspace } });
    }
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  it("is kept at its snoozed time instead of being cancelled as stale", async () => {
    const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId: ids.workspace, status: "PENDING" } });
    expect(jump.scheduledAt.toISOString()).toBe(zonedDateTimeToUtc(logicalDateFromDate(localDate), 600, timezone).toISOString());
    const until = new Date(now.getTime() + 2 * DAY);
    await prisma.jump.update({ where: { id: jump.id }, data: { scheduledAt: until, snoozedUntil: until } });

    const result = await reconcileJumps({ workspaceId: ids.workspace });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } });
    expect(result.canceled).toBe(0);
    expect(after.status).toBe("PENDING");
    expect(after.scheduledAt.toISOString()).toBe(until.toISOString());
  });
});
