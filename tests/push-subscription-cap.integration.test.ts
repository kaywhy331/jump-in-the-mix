import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../src/generated/prisma/client";

const state = vi.hoisted(() => ({ tx: null as unknown as Prisma.TransactionClient, cookies: new Map<string, string>() }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: (_, key) => key === "$transaction"
  ? async (input: ((tx: Prisma.TransactionClient) => unknown) | Promise<unknown>[]) => typeof input === "function" ? input(state.tx) : Promise.all(input)
  : Reflect.get(state.tx, key) }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined, set: (name: string, value: string) => state.cookies.set(name, value), delete: (name: string) => state.cookies.delete(name) }) }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: null, userAgent: "Local push cap test" }) }));
vi.mock("@/lib/worker-dispatch-after", () => ({ wakeWorkerAfterResponse: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { cookieName: "test-session", impersonationCookieName: "test-impersonation", sessionDays: 14, sessionMaxDays: 90, maxSessionsPerUser: 100, sessionTouchMinutes: 60, secureSessionCookie: true, requireEmailVerification: true, vapidPublicKey: "test-public", vapidPrivateKey: "test-private", vapidSubject: "mailto:test@example.com" } }));

import { createSession, getCurrentSession } from "../src/lib/auth";
import { browserScope } from "../src/lib/browser-scope";
import { POST } from "../src/app/api/notifications/subscribe/route";
const { prisma: database } = await vi.importActual<typeof import("../src/lib/prisma")>("../src/lib/prisma");

describe.skipIf(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""))("push subscription cap", () => {
  afterAll(async () => database.$disconnect());
  it("keeps at most 20 devices per person and drops the least recently renewed one", async () => {
    const rollback = new Error("ROLLBACK_PUSH_CAP");
    await expect(database.$transaction(async tx => {
      state.tx = tx; state.cookies.clear();
      const suffix = randomUUID();
      const user = await tx.user.create({ data: { email: `push-cap-${suffix}@example.com`, name: "Cap", passwordHash: "fixture", emailVerifiedAt: new Date() } });
      const workspace = await tx.workspace.create({ data: { ownerId: user.id, name: "Cap", slug: `push-cap-${suffix}`, members: { create: { userId: user.id } } } });
      const keys = { p256dh: "a".repeat(88), auth: "b".repeat(24) };
      const device = (name: string | number) => `https://fcm.googleapis.com/fcm/send/cap-${suffix}-${name}`;
      const monthAgo = Date.now() - 30 * 24 * 60 * 60_000;
      for (let index = 0; index < 20; index++) {
        const at = new Date(monthAgo + index * 60_000);
        await tx.pushSubscription.create({ data: { workspaceId: workspace.id, userId: user.id, endpoint: device(index), ...keys, lastUsedAt: at, createdAt: at } });
      }
      await createSession(user.id);
      const scope = browserScope((await getCurrentSession())!)!;
      const subscribe = (endpoint: string) => POST(new Request("https://example.com/api/notifications/subscribe", { method: "POST", headers: { "x-jitm-browser-scope": scope, "content-type": "application/json" }, body: JSON.stringify({ endpoint, keys }) }));
      const endpoints = async () => (await tx.pushSubscription.findMany({ where: { userId: user.id }, select: { endpoint: true } })).map(item => item.endpoint);

      expect((await subscribe(device("new"))).status).toBe(200);
      let current = await endpoints();
      expect(current).toHaveLength(20);
      expect(current).toContain(device("new"));
      expect(current).not.toContain(device(0));
      expect(current).toContain(device(1));

      // Renewing a device this person already has refreshes it without evicting another.
      expect((await subscribe(device(1))).status).toBe(200);
      current = await endpoints();
      expect(current).toHaveLength(20);
      expect(current).toContain(device(2));
      throw rollback;
    }, { timeout: 60_000 })).rejects.toBe(rollback);
  }, 70_000);
});
