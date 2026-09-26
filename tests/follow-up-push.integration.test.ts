import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FollowUpPushDelivery, JumpStatus, NotificationDeliveryStatus, Prisma } from "../src/generated/prisma/client";

const state = vi.hoisted(() => ({ tx: null as unknown as Prisma.TransactionClient, send: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: (_, key) => key === "$transaction" ? async (fn: (tx: Prisma.TransactionClient) => unknown) => fn(state.tx) : Reflect.get(state.tx, key) }) }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: state.send } }));
vi.mock("@/lib/env", () => ({ env: { vapidPublicKey: "test-public", vapidPrivateKey: "test-private", vapidSubject: "mailto:test@example.com", appUrl: "https://example.com" } }));

import { needsPushReminder, readDueReminders, sendFollowUpPush } from "../src/lib/follow-up-push";
import { runScheduledNotifications } from "../src/lib/notification-delivery";
const { prisma: database } = await vi.importActual<typeof import("../src/lib/prisma")>("../src/lib/prisma");

const leaseMs = 15 * 60_000;
const body = (call: number) => JSON.parse(state.send.mock.calls[call][1]).body as string;
const receiptKey = (subscriptionId: string, jumpId: string, scheduledAt: Date) => createHash("sha256").update(`${subscriptionId}:${jumpId}:${scheduledAt.toISOString()}`).digest("hex");

async function rolledBack(test: (tx: Prisma.TransactionClient) => Promise<void>) {
  const rollback = new Error("ROLLBACK_PUSH_TEST_FIXTURES");
  await expect(database.$transaction(async (tx) => { state.tx = tx; await test(tx); throw rollback; }, { timeout: 60_000 })).rejects.toBe(rollback);
}

async function pushAccount(tx: Prisma.TransactionClient) {
  const suffix = randomUUID();
  const user = await tx.user.create({ data: { email: `push-${suffix}@example.com`, name: "Push test", passwordHash: "test-only" } });
  const workspace = await tx.workspace.create({ data: { ownerId: user.id, name: "Push test", slug: `push-${suffix}` } });
  const workspaceId = workspace.id, userId = user.id;
  const session = await tx.session.create({ data: { userId, tokenHash: randomUUID(), expiresAt: new Date("2100-01-01") } });
  await tx.notificationPreference.create({ data: { workspaceId, userId, pushEnabled: true, emailDigestEnabled: false, weeklyReportEnabled: false } });
  const subscription = await tx.pushSubscription.create({ data: { workspaceId, userId, sessionId: session.id, endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`, p256dh: "test", auth: "test" } });
  const contact = await tx.contact.create({ data: { workspaceId, displayName: "Sample customer" } });
  const template = await tx.stepTemplate.create({ data: { workspaceId, name: "Sample text", channel: "SMS" } });
  const version = await tx.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Sample" } });
  const mix = await tx.mix.create({ data: { workspaceId, name: "Sample plan", triggerMode: "MANUAL_START", status: "ACTIVE" } });
  const step = await tx.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
  // `count` follow-ups `spacingMs` apart from `from`, oldest first.
  const followUps = async (count: number, from: string | Date, options: { spacingMs?: number; contactId?: string; status?: JumpStatus } = {}) => {
    const start = new Date(from).getTime();
    const rows = Array.from({ length: count }, (_, index) => ({ id: `push-jump-${randomUUID()}`, workspaceId, contactId: options.contactId ?? contact.id, mixId: mix.id, mixStepId: step.id, stepVersionId: version.id, scheduledAt: new Date(start + index * (options.spacingMs ?? 1_000)), status: options.status ?? "PENDING", reason: "Sample follow-up", templateSnapshot: {}, renderedSnapshot: { body: "Sample" }, uniquenessKey: randomUUID() }));
    await tx.jump.createMany({ data: rows });
    return rows;
  };
  const run = (time: string | Date) => sendFollowUpPush({ workspaceId, userId, now: new Date(time) });
  return { workspaceId, userId, subscription, followUps, run };
}

describe.skipIf(process.env.RUN_PUSH_DATABASE_TESTS !== "true" && process.env.CI !== "true")("push reminder database delivery", () => {
  afterAll(async () => database.$disconnect());
  beforeEach(() => { state.send.mockReset(); state.send.mockResolvedValue({ statusCode: 201 }); });

  it("delivers later follow-ups, batches due items, retries only failed devices, and honors quiet hours", async () => {
    const rollback = new Error("ROLLBACK_PUSH_TEST_FIXTURES");
    await expect(database.$transaction(async (tx) => {
      state.tx = tx;
      state.send.mockResolvedValue({ statusCode: 201 });
      const suffix = randomUUID();
      const user = await tx.user.create({ data: { email: `push-${suffix}@example.com`, name: "Push test", passwordHash: "test-only" } });
      const workspace = await tx.workspace.create({ data: { ownerId: user.id, name: "Push test", slug: `push-${suffix}` } });
      const workspaceId = workspace.id, userId = user.id;
      const session = await tx.session.create({ data: { userId, tokenHash: randomUUID(), expiresAt: new Date("2100-01-01") } });
      await tx.userPreference.create({ data: { userId, timezone: "America/Los_Angeles" } });
      await tx.notificationPreference.create({ data: { workspaceId, userId, pushEnabled: true, emailDigestEnabled: false, weeklyReportEnabled: false } });
      const subscription = await tx.pushSubscription.create({ data: { workspaceId, userId, sessionId: session.id, endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`, p256dh: "test", auth: "test" } });
      const contact = await tx.contact.create({ data: { workspaceId, displayName: "Sample customer" } });
      const template = await tx.stepTemplate.create({ data: { workspaceId, name: "Sample text", channel: "SMS" } });
      const version = await tx.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Sample" } });
      const mix = await tx.mix.create({ data: { workspaceId, name: "Sample plan", triggerMode: "MANUAL_START", status: "ACTIVE" } });
      const step = await tx.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
      const createJump = (time: string, status: "PENDING" | "DONE" | "CANCELED" = "PENDING") => tx.jump.create({ data: { workspaceId, contactId: contact.id, mixId: mix.id, mixStepId: step.id, stepVersionId: version.id, scheduledAt: new Date(time), status, reason: "Sample follow-up", templateSnapshot: {}, renderedSnapshot: { body: "Sample" }, uniquenessKey: randomUUID() } });
      const first = await createJump("2026-09-05T17:00:00Z");
      await createJump("2026-09-05T17:00:00Z");
      const later = await createJump("2026-09-05T20:00:00Z");
      await createJump("2026-09-05T17:00:00Z", "DONE");
      await createJump("2026-09-05T17:00:00Z", "CANCELED");
      const run = (time: string) => sendFollowUpPush({ workspaceId, userId, now: new Date(time) });

      expect(await run("2026-09-05T16:59:00Z")).toBe(0);
      expect(await run("2026-09-05T17:01:00Z")).toBe(1);
      expect(JSON.parse(state.send.mock.calls[0][1]).body).toMatch(/^2 follow-ups/);
      expect(await run("2026-09-05T17:02:00Z")).toBe(0);
      expect(await run("2026-09-05T20:01:00Z")).toBe(1);
      expect(JSON.parse(state.send.mock.calls[1][1]).body).toMatch(/^1 follow-up/);
      expect(await tx.followUpPushDelivery.count({ where: { workspaceId, status: "DELIVERED" } })).toBe(3);

      // A new device gets its own catch-up without repeating the first phone.
      const second = await tx.pushSubscription.create({ data: { workspaceId, userId, sessionId: session.id, endpoint: `https://web.push.apple.com/${suffix}`, p256dh: "test", auth: "test" } });
      state.send.mockRejectedValueOnce({ statusCode: 503 });
      expect(await run("2026-09-05T20:02:00Z")).toBe(0);
      expect(await tx.followUpPushDelivery.count({ where: { subscriptionId: second.id, status: "FAILED" } })).toBe(3);
      expect(await run("2026-09-05T20:03:00Z")).toBe(1);
      expect(state.send.mock.calls.at(-1)![0].endpoint).toBe(second.endpoint);
      expect(await run("2026-09-05T20:04:00Z")).toBe(0);

      // A moved appointment is a new scheduled occurrence on both devices.
      await tx.jump.update({ where: { id: first.id }, data: { scheduledAt: new Date("2026-09-05T21:00:00Z") } });
      expect(await run("2026-09-05T20:59:00Z")).toBe(0);
      expect(await run("2026-09-05T21:01:00Z")).toBe(2);
      expect(await run("2026-09-05T21:02:00Z")).toBe(0);

      await createJump("2026-09-06T04:00:00Z"); // 9 PM in Los Angeles.
      const beforeQuiet = state.send.mock.calls.length;
      // Limit the scheduler to these uncommitted fixtures, even on a shared DB.
      const scoped = new Proxy(tx, { get: (target, key) => key === "notificationPreference" ? { ...target.notificationPreference, findMany: () => target.notificationPreference.findMany({ where: { workspaceId } }) } : Reflect.get(target, key) });
      state.tx = scoped;
      expect(await runScheduledNotifications("push-test", new Date("2026-09-06T04:01:00Z"))).toEqual({ attempted: 0 });
      expect(state.send).toHaveBeenCalledTimes(beforeQuiet);
      expect(await runScheduledNotifications("push-test", new Date("2026-09-06T15:01:00Z"))).toEqual({ attempted: 2 });
      state.tx = tx;

      // Expired devices are removed; the healthy device still receives the batch.
      await createJump("2026-09-06T16:00:00Z");
      state.send.mockImplementation(async (target) => { if (target.endpoint === subscription.endpoint) throw { statusCode: 410 }; return { statusCode: 201 }; });
      expect(await run("2026-09-06T16:01:00Z")).toBe(1);
      expect(await tx.pushSubscription.findUnique({ where: { id: subscription.id } })).toBeNull();
      expect((await tx.notificationPreference.findUniqueOrThrow({ where: { workspaceId } })).pushEnabled).toBe(true);
      expect(await tx.followUpPushDelivery.count({ where: { subscriptionId: subscription.id } })).toBe(0);
      expect(await tx.followUpPushDelivery.count({ where: { jumpId: later.id, subscriptionId: second.id, status: "DELIVERED" } })).toBe(1);

      await createJump("2026-09-06T16:10:00Z");
      const concurrent = await Promise.all([run("2026-09-06T16:11:00Z"), run("2026-09-06T16:11:00Z")]);
      expect(concurrent.reduce((sum, count) => sum + count, 0)).toBe(1);

      await createJump("2026-09-06T16:20:00Z");
      state.send.mockRejectedValue({ statusCode: 410 });
      expect(await run("2026-09-06T16:21:00Z")).toBe(0);
      expect((await tx.notificationPreference.findUniqueOrThrow({ where: { workspaceId } })).pushEnabled).toBe(false);
      throw rollback;
    }, { timeout: 60_000 })).rejects.toBe(rollback);
  }, 70_000);

  it("turns a backlog into one summary push with a receipt per follow-up, then reminds each new follow-up once", async () => {
    await rolledBack(async (tx) => {
      const { subscription, followUps, run } = await pushAccount(tx);
      const backlog = await followUps(300, "2026-09-05T10:00:00Z");
      const later = await followUps(3, "2026-09-05T12:00:00Z", { spacingMs: 10 * 60_000 });

      expect(await run("2026-09-05T11:00:00Z")).toBe(1);
      expect(state.send).toHaveBeenCalledTimes(1);
      expect(body(0)).toBe("300 follow-ups are ready. Open Today to take care of them.");
      const receipts = await tx.followUpPushDelivery.findMany({ where: { subscriptionId: subscription.id } });
      expect(receipts).toHaveLength(300);
      expect(receipts.filter(row => row.status === "DELIVERED" && row.attempts === 1 && !row.lockedBy && !row.lockedAt && row.deliveredAt?.toISOString() === "2026-09-05T11:00:00.000Z")).toHaveLength(300);
      // The SQL claim writes the same deterministic ids as the per-row path.
      expect(new Set(receipts.map(row => row.id))).toEqual(new Set(backlog.map(jump => receiptKey(subscription.id, jump.id, jump.scheduledAt))));

      // Steady state: nothing repeats, and each later follow-up is reminded once, when it is due.
      for (const [time, sent] of [["11:01", 0], ["12:05", 1], ["12:06", 0], ["12:15", 1], ["12:25", 1], ["12:26", 0]] as const) {
        expect(await run(`2026-09-05T${time}:00Z`)).toBe(sent);
      }
      expect(state.send).toHaveBeenCalledTimes(4);
      expect([body(1), body(2), body(3)]).toEqual(Array(3).fill("1 follow-up is ready. Open Today to take care of it."));
      const perFollowUp = await tx.followUpPushDelivery.groupBy({ by: ["jumpId"], where: { subscriptionId: subscription.id }, _count: { _all: true }, _max: { attempts: true } });
      expect(perFollowUp).toHaveLength(303);
      expect(perFollowUp.every(row => row._count._all === 1 && row._max.attempts === 1)).toBe(true);
      expect(await tx.followUpPushDelivery.count({ where: { subscriptionId: subscription.id, status: "DELIVERED", jumpId: { in: later.map(jump => jump.id) } } })).toBe(3);
    });
  }, 70_000);

  it("claims at most 1,000 follow-ups per pass, rechecks them by id in chunks and skips changed ones", async () => {
    await rolledBack(async (tx) => {
      const { subscription, followUps, run } = await pushAccount(tx);
      const rows = await followUps(1_050, "2026-09-05T10:00:00Z");
      const [completed, moved] = rows;
      const movedTo = new Date("2026-09-05T13:00:00Z");
      // Record the recheck reads; complete one claimed follow-up and move another between the claim and the recheck.
      const recheckSizes: number[] = [];
      state.tx = new Proxy(tx, { get: (target, key) => key === "jump" ? { ...target.jump, findMany: async (args: Prisma.JumpFindManyArgs) => {
        if (!recheckSizes.length) {
          await target.jump.update({ where: { id: completed.id }, data: { status: "DONE" } });
          await target.jump.update({ where: { id: moved.id }, data: { scheduledAt: movedTo } });
        }
        recheckSizes.push((args.where?.id as { in: string[] }).in.length);
        return target.jump.findMany(args);
      } } : Reflect.get(target, key) });

      expect(await run("2026-09-05T11:00:00Z")).toBe(1);
      state.tx = tx;
      expect(recheckSizes).toEqual([500, 500]);
      expect(body(0)).toBe("998 follow-ups are ready. Open Today to take care of them.");
      expect(await tx.followUpPushDelivery.count({ where: { subscriptionId: subscription.id, status: "DELIVERED" } })).toBe(998);
      expect(await tx.followUpPushDelivery.findMany({ where: { subscriptionId: subscription.id, status: "SKIPPED" }, select: { jumpId: true, scheduledAt: true, lockedBy: true }, orderBy: { scheduledAt: "asc" } }))
        .toEqual([{ jumpId: completed.id, scheduledAt: completed.scheduledAt, lockedBy: null }, { jumpId: moved.id, scheduledAt: moved.scheduledAt, lockedBy: null }]);
      // The oldest 1,000 were claimed; the 50 newest wait for the next pass, which is one ordinary batch.
      expect(await tx.followUpPushDelivery.count({ where: { subscriptionId: subscription.id, jumpId: { in: rows.slice(1_000).map(jump => jump.id) } } })).toBe(0);
      expect(await run("2026-09-05T11:01:00Z")).toBe(1);
      expect(body(1)).toBe("50 follow-ups are ready. Open Today to take care of them.");
      expect(await run("2026-09-05T11:02:00Z")).toBe(0);

      // The moved follow-up is a new occurrence and gets its own receipt when it is due.
      expect(await run("2026-09-05T13:00:00Z")).toBe(1);
      expect(body(2)).toBe("1 follow-up is ready. Open Today to take care of it.");
      expect(await tx.followUpPushDelivery.findMany({ where: { jumpId: moved.id }, select: { id: true, scheduledAt: true, status: true }, orderBy: { scheduledAt: "asc" } }))
        .toEqual([{ id: receiptKey(subscription.id, moved.id, moved.scheduledAt), scheduledAt: moved.scheduledAt, status: "SKIPPED" }, { id: receiptKey(subscription.id, moved.id, movedTo), scheduledAt: movedTo, status: "DELIVERED" }]);
    });
  }, 70_000);

  it("retries a failed backlog together, at most three times, and a later ordinary batch retries the same receipts", async () => {
    await rolledBack(async (tx) => {
      const { subscription, followUps, run } = await pushAccount(tx);
      const rows = await followUps(150, "2026-09-05T10:00:00Z");
      state.send.mockRejectedValue({ statusCode: 503 });
      for (const time of ["11:00", "11:01", "11:02"]) expect(await run(`2026-09-05T${time}:00Z`)).toBe(0);
      expect(state.send).toHaveBeenCalledTimes(3);
      expect([body(0), body(1), body(2)]).toEqual(Array(3).fill("150 follow-ups are ready. Open Today to take care of them."));
      const failed = await tx.followUpPushDelivery.findMany({ where: { subscriptionId: subscription.id } });
      expect(failed).toHaveLength(150);
      expect(failed.filter(row => row.status === "FAILED" && row.attempts === 3 && row.error === "Push provider 503" && !row.lockedBy)).toHaveLength(150);
      expect(await run("2026-09-05T11:03:00Z")).toBe(0);
      expect(state.send).toHaveBeenCalledTimes(3);

      // Receipts the backlog claim wrote are the ones an ordinary batch retries: no duplicate rows.
      await tx.followUpPushDelivery.updateMany({ where: { subscriptionId: subscription.id }, data: { attempts: 1 } });
      await tx.jump.updateMany({ where: { id: { in: rows.slice(0, 100).map(jump => jump.id) } }, data: { status: "DONE" } });
      state.send.mockResolvedValue({ statusCode: 201 });
      expect(await run("2026-09-05T11:04:00Z")).toBe(1);
      expect(body(3)).toBe("50 follow-ups are ready. Open Today to take care of them.");
      expect(await tx.followUpPushDelivery.count({ where: { subscriptionId: subscription.id } })).toBe(150);
      expect(await tx.followUpPushDelivery.count({ where: { subscriptionId: subscription.id, status: "DELIVERED", attempts: 2, jumpId: { in: rows.slice(100).map(jump => jump.id) } } })).toBe(50);
    });
  }, 70_000);

  it("removes the device when the provider answers a backlog push with 410", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId, subscription, followUps, run } = await pushAccount(tx);
      await followUps(150, "2026-09-05T10:00:00Z");
      state.send.mockRejectedValue({ statusCode: 410 });
      expect(await run("2026-09-05T11:00:00Z")).toBe(0);
      expect(state.send).toHaveBeenCalledTimes(1);
      expect(await tx.pushSubscription.findUnique({ where: { id: subscription.id } })).toBeNull();
      expect(await tx.followUpPushDelivery.count({ where: { subscriptionId: subscription.id } })).toBe(0);
      expect((await tx.notificationPreference.findUniqueOrThrow({ where: { workspaceId } })).pushEnabled).toBe(false);
    });
  }, 70_000);

  it("selects in SQL exactly the follow-ups needsPushReminder accepts, and the backlog claim takes only those", async () => {
    await rolledBack(async (tx) => {
      const account = await pushAccount(tx);
      const { workspaceId, userId, subscription, followUps } = account;
      const now = new Date("2026-09-05T18:00:00Z");
      const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
      // Another device's receipt; without a live session it takes no part in the pass below.
      const other = await tx.pushSubscription.create({ data: { workspaceId, userId, endpoint: `https://web.push.apple.com/${randomUUID()}`, p256dh: "test", auth: "test" } });
      const archived = await tx.contact.create({ data: { workspaceId, displayName: "Archived person", archivedAt: at(-60_000) } });
      const blocked = await tx.contact.create({ data: { workspaceId, displayName: "Do not contact" } });
      await tx.contactRelationshipState.create({ data: { workspaceId, contactId: blocked.id, doNotContact: true } });
      const reachable = await tx.contact.create({ data: { workspaceId, displayName: "Reachable person" } });
      await tx.contactRelationshipState.create({ data: { workspaceId, contactId: reachable.id, doNotContact: false } });
      const elsewhere = await pushAccount(tx);

      type Receipt = { status: NotificationDeliveryStatus; attempts: number; lockedAt?: Date; scheduledAt?: Date; subscriptionId?: string };
      const cases: Array<{ name: string; due: boolean; scheduledAt?: Date; status?: JumpStatus; contactId?: string; elsewhere?: boolean; receipt?: Receipt }> = [
        { name: "due, no receipt", due: true },
        { name: "due exactly now", due: true, scheduledAt: now },
        { name: "one millisecond early", due: false, scheduledAt: at(1) },
        { name: "delivered", due: false, receipt: { status: "DELIVERED", attempts: 1 } },
        { name: "skipped", due: false, receipt: { status: "SKIPPED", attempts: 1 } },
        { name: "failed once", due: true, receipt: { status: "FAILED", attempts: 1 } },
        { name: "failed twice", due: true, receipt: { status: "FAILED", attempts: 2 } },
        { name: "failed three times", due: false, receipt: { status: "FAILED", attempts: 3 } },
        { name: "pending at the attempt limit", due: false, receipt: { status: "PENDING", attempts: 3 } },
        { name: "live lease", due: false, receipt: { status: "PENDING", attempts: 1, lockedAt: now } },
        { name: "lease ending now", due: false, receipt: { status: "PENDING", attempts: 1, lockedAt: at(-leaseMs) } },
        { name: "expired lease", due: true, receipt: { status: "PENDING", attempts: 1, lockedAt: at(-leaseMs - 1) } },
        { name: "failed, live lease", due: false, receipt: { status: "FAILED", attempts: 1, lockedAt: at(-1_000) } },
        { name: "delivered, then rescheduled", due: true, receipt: { status: "DELIVERED", attempts: 1, scheduledAt: at(-3_600_000) } },
        { name: "delivered to another device", due: true, receipt: { status: "DELIVERED", attempts: 1, subscriptionId: other.id } },
        { name: "completed", due: false, status: "DONE" },
        { name: "canceled", due: false, status: "CANCELED" },
        { name: "archived person", due: false, contactId: archived.id },
        { name: "do not contact", due: false, contactId: blocked.id },
        { name: "reachable person with a state row", due: true, contactId: reachable.id },
        { name: "another workspace", due: false, elsewhere: true }
      ];
      const fixtures: Array<Omit<(typeof cases)[number], "receipt"> & { jump: { id: string; scheduledAt: Date }; receipt?: FollowUpPushDelivery }> = [];
      for (const item of cases) {
        const [jump] = await (item.elsewhere ? elsewhere : account).followUps(1, item.scheduledAt ?? at(-60_000), { status: item.status, contactId: item.contactId });
        const subscriptionId = item.receipt?.subscriptionId ?? subscription.id, scheduledAt = item.receipt?.scheduledAt ?? jump.scheduledAt;
        const receipt = item.receipt && await tx.followUpPushDelivery.create({ data: {
          id: receiptKey(subscriptionId, jump.id, scheduledAt), workspaceId, subscriptionId, jumpId: jump.id, scheduledAt,
          status: item.receipt.status, attempts: item.receipt.attempts, lockedAt: item.receipt.lockedAt ?? null, lockedBy: item.receipt.lockedAt ? "another-worker" : null
        } });
        fixtures.push({ ...item, jump, receipt });
      }

      // The query the pass used to run, filtered by the JavaScript rule.
      const loaded = await tx.jump.findMany({
        where: { workspaceId, status: "PENDING", scheduledAt: { lte: now }, contact: { archivedAt: null, OR: [{ relationshipState: null }, { relationshipState: { doNotContact: false } }] } },
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
        select: { id: true, scheduledAt: true, pushDeliveries: { where: { subscriptionId: subscription.id }, select: { scheduledAt: true, status: true, attempts: true, lockedAt: true } } }
      });
      const expected = loaded.filter(jump => needsPushReminder(jump.scheduledAt, jump.pushDeliveries, now)).map(jump => jump.id);
      expect(new Set(expected)).toEqual(new Set(fixtures.filter(item => item.due).map(item => item.jump.id)));
      const read = await readDueReminders(subscription, now);
      expect(read.due).toBe(expected.length);
      expect(read.rows.map(row => row.id)).toEqual(expected);
      expect(read.rows.every(row => row.scheduledAt instanceof Date)).toBe(true);

      // A backlog (more than 100 due) takes the SQL claim, which must honour the same rule.
      const extra = await followUps(110, at(-7_200_000));
      expect(await account.run(now)).toBe(1);
      expect(body(0)).toBe(`${expected.length + extra.length} follow-ups are ready. Open Today to take care of them.`);
      for (const item of fixtures) {
        const current = await tx.followUpPushDelivery.findMany({ where: { subscriptionId: subscription.id, jumpId: item.jump.id }, orderBy: { scheduledAt: "asc" } });
        const mine = item.receipt?.subscriptionId === subscription.id ? item.receipt : undefined;
        if (item.due) {
          const fresh = current.find(row => row.scheduledAt.getTime() === item.jump.scheduledAt.getTime());
          expect(fresh, item.name).toMatchObject({ status: "DELIVERED", attempts: (mine && mine.scheduledAt.getTime() === item.jump.scheduledAt.getTime() ? mine.attempts : 0) + 1, lockedBy: null });
        } else {
          expect(current, item.name).toEqual(mine ? [mine] : []);
        }
      }
      expect(await tx.followUpPushDelivery.count({ where: { subscriptionId: other.id, status: "DELIVERED" } })).toBe(1);
    });
  }, 70_000);
});
