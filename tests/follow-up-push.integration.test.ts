import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../src/generated/prisma/client";

const state = vi.hoisted(() => ({ tx: null as unknown as Prisma.TransactionClient, send: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: (_, key) => key === "$transaction" ? async (fn: (tx: Prisma.TransactionClient) => unknown) => fn(state.tx) : Reflect.get(state.tx, key) }) }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: state.send } }));
vi.mock("@/lib/env", () => ({ env: { vapidPublicKey: "test-public", vapidPrivateKey: "test-private", vapidSubject: "mailto:test@example.com", appUrl: "https://example.com" } }));

import { sendFollowUpPush } from "../src/lib/follow-up-push";
import { runScheduledNotifications } from "../src/lib/notification-delivery";
const { prisma: database } = await vi.importActual<typeof import("../src/lib/prisma")>("../src/lib/prisma");

describe.skipIf(process.env.RUN_PUSH_DATABASE_TESTS !== "true" && process.env.CI !== "true")("push reminder database delivery", () => {
  afterAll(async () => database.$disconnect());

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
});
