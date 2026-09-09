import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../src/generated/prisma/client";

const state = vi.hoisted(() => ({ tx: null as unknown as Prisma.TransactionClient, cookies: new Map<string, string>(), send: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: (_, key) => key === "$transaction"
  ? async (input: ((tx: Prisma.TransactionClient) => unknown) | Promise<unknown>[]) => typeof input === "function" ? input(state.tx) : Promise.all(input)
  : Reflect.get(state.tx, key) }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined, set: (name: string, value: string) => state.cookies.set(name, value), delete: (name: string) => state.cookies.delete(name) }) }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: null, userAgent: "Local privacy test" }) }));
vi.mock("@/lib/worker-dispatch-after", () => ({ wakeWorkerAfterResponse: vi.fn() }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: state.send } }));
vi.mock("@/lib/env", () => ({ env: { cookieName: "test-session", impersonationCookieName: "test-impersonation", sessionDays: 14, maxSessionsPerUser: 100, sessionTouchMinutes: 60, secureSessionCookie: true, requireEmailVerification: true, vapidPublicKey: "test-public", vapidPrivateKey: "test-private", vapidSubject: "mailto:test@example.com" } }));

import { createSession, destroySession, destroyAllSessionsForUser, getCurrentSession } from "../src/lib/auth";
import { browserScope } from "../src/lib/browser-scope";
import { sendDevicePush } from "../src/lib/follow-up-push";
import { GET, POST } from "../src/app/api/notifications/subscribe/route";
const { prisma: database } = await vi.importActual<typeof import("../src/lib/prisma")>("../src/lib/prisma");
const payload = { title: "Local test", body: "Never sent to a provider", url: "/jumps", tag: "local-test" };

describe.skipIf(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""))("push ownership with real sessions", () => {
  afterAll(async () => database.$disconnect());
  it("binds opt-in to a session, preserves same-owner renewal, and stops old devices on account replacement and revocation", async () => {
    const rollback = new Error("ROLLBACK_PUSH_OWNERSHIP");
    await expect(database.$transaction(async tx => {
      state.tx = tx; state.cookies.clear(); state.send.mockReset().mockResolvedValue({ statusCode: 201 });
      const owners = [];
      for (const name of ["Alpha", "Beta"]) {
        const suffix = randomUUID();
        const user = await tx.user.create({ data: { email: `push-owner-${suffix}@example.com`, name, passwordHash: "fixture", emailVerifiedAt: new Date() } });
        const workspace = await tx.workspace.create({ data: { ownerId: user.id, name, slug: `push-owner-${suffix}`, members: { create: { userId: user.id } } } });
        owners.push({ user, workspace });
      }
      const [alpha, beta] = owners;
      const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
      const body = { endpoint, keys: { p256dh: "a".repeat(88), auth: "b".repeat(24) } };
      const scope = async () => browserScope((await getCurrentSession())!)!;
      const request = (scope: string, method = "POST", data: unknown = body) => new Request("https://example.com/api/notifications/subscribe", { method, headers: { "x-jitm-browser-scope": scope, "content-type": "application/json" }, ...(method !== "GET" ? { body: JSON.stringify(data) } : {}) });
      const device = () => tx.pushSubscription.findUniqueOrThrow({ where: { endpoint } });

      // Migration leaves legacy subscriptions unbound; they cannot send.
      await tx.pushSubscription.create({ data: { workspaceId: alpha.workspace.id, userId: alpha.user.id, endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth } });
      expect(await sendDevicePush(await device(), payload)).toBe(false);
      expect(state.send).not.toHaveBeenCalled();
      const first = await createSession(alpha.user.id), alphaScope = await scope();
      expect(await (await GET(request(alphaScope, "GET"))).json()).toEqual({ endpoints: [] });
      expect((await POST(request(alphaScope))).status).toBe(200);
      expect((await device()).sessionId).toBe(first);
      const receiptRequest = async (currentScope: string) => new Request(`https://example.com/api/notifications/subscribe?subscriptionId=${(await device()).id}`, { headers: { "x-jitm-browser-scope": currentScope } });
      expect(await (await GET(await receiptRequest(alphaScope))).json()).toEqual({ active: true });
      await tx.notificationPreference.update({ where: { workspaceId: alpha.workspace.id }, data: { pushEnabled: false } });
      expect(await (await GET(await receiptRequest(alphaScope))).json()).toEqual({ active: false });
      await tx.notificationPreference.update({ where: { workspaceId: alpha.workspace.id }, data: { pushEnabled: true } });

      const renewed = await createSession(alpha.user.id);
      expect(renewed).not.toBe(first); expect(await tx.session.findUnique({ where: { id: first } })).toBeNull();
      expect(await scope()).toBe(alphaScope); expect((await device()).sessionId).toBe(renewed);
      expect(await sendDevicePush(await device(), payload)).toBe(true);
      expect(JSON.parse(state.send.mock.calls[0][1]).scope).toBe(alphaScope);
      const oldDevice = await device();

      const betaSession = await createSession(beta.user.id), betaScope = await scope();
      const betaCookie = state.cookies.get("test-session")!;
      expect(await tx.session.findUnique({ where: { id: renewed } })).toBeNull();
      expect((await device()).sessionId).toBeNull();
      expect(await sendDevicePush(oldDevice, payload)).toBe(false);
      expect(await (await GET(request(betaScope, "GET"))).json()).toEqual({ endpoints: [] });
      expect(await (await GET(await receiptRequest(betaScope))).json()).toEqual({ active: false });
      expect((await GET(await receiptRequest(alphaScope))).status).toBe(409);
      expect((await POST(request(alphaScope))).status).toBe(409);
      expect((await device()).userId).toBe(alpha.user.id);
      // Browser permission alone does not opt Beta in. This explicit action does.
      expect((await POST(request(betaScope))).status).toBe(200);
      expect(await device()).toMatchObject({ userId: beta.user.id, workspaceId: beta.workspace.id, sessionId: betaSession });
      expect(await sendDevicePush(oldDevice, payload)).toBe(false);

      // A separate Alpha browser can remain enabled without changing Beta.
      state.cookies.clear();
      const otherSession = await createSession(alpha.user.id);
      const other = await tx.pushSubscription.create({ data: { workspaceId: alpha.workspace.id, userId: alpha.user.id, sessionId: otherSession, endpoint: endpoint + "-other", p256dh: body.keys.p256dh, auth: body.keys.auth } });
      await destroyAllSessionsForUser(alpha.user.id);
      expect((await tx.pushSubscription.findUniqueOrThrow({ where: { id: other.id } })).sessionId).toBeNull();
      expect(await sendDevicePush(other, payload)).toBe(false);
      expect((await device()).sessionId).toBe(betaSession);
      state.cookies.set("test-session", betaCookie);
      const current = await device();
      await tx.session.update({ where: { id: betaSession }, data: { expiresAt: new Date(0) } });
      expect(await sendDevicePush(current, payload)).toBe(false);
      await destroySession();
      expect((await device()).sessionId).toBeNull(); expect(state.cookies.has("test-session")).toBe(false);
      expect(state.send).toHaveBeenCalledTimes(1);
      throw rollback;
    }, { timeout: 60_000 })).rejects.toBe(rollback);
  }, 70_000);
});
