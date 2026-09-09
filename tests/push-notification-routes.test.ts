import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserScope } from "../src/lib/browser-scope";

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), find: vi.fn(), send: vi.fn(), forget: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.workspace }));
vi.mock("@/lib/prisma", () => ({ prisma: { pushSubscription: { findFirst: mocks.find } } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/follow-up-push", () => ({ pushConfigured: () => true, sendDevicePush: mocks.send, forgetPushSubscription: mocks.forget, pushSubscriptionExpired: (error: { statusCode?: number }) => error.statusCode === 410 }));
vi.mock("@/lib/env", () => ({ env: { requireEmailVerification: true } }));
import { POST } from "../src/app/api/notifications/test/route";

const identity = () => ({ id: "session-a", authUser: { id: "owner-a" }, user: { id: "owner-a", emailVerifiedAt: new Date(), memberships: [{ workspaceId: "workspace-a" }] }, impersonation: null });
const endpoint = "https://fcm.googleapis.com/fcm/send/sample";
const request = (value: unknown = { endpoint }) => new Request("https://example.com/api/notifications/test", { method: "POST", body: JSON.stringify(value), headers: { "content-type": "application/json", "x-jitm-browser-scope": browserScope(identity())! } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.mockResolvedValue(identity());
  mocks.find.mockResolvedValue({ id: "device-a", endpoint, workspaceId: "workspace-a", userId: "owner-a", p256dh: "private-key", auth: "private-auth" });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.send.mockResolvedValue(true);
});

describe("test push endpoint", () => {
  it("sends only to a device belonging to the signed-in owner and workspace", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({ where: { workspaceId: "workspace-a", userId: "owner-a", sessionId: "session-a", endpoint } });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ id: "device-a" }), expect.objectContaining({ url: "/jumps", tag: "jitm-push-test" }));
    expect(await response.text()).not.toContain("private-key");
  });

  it("rejects signed-out and stale-account controls before touching a device", async () => {
    const stale = request(); stale.headers.set("x-jitm-browser-scope", "old-account");
    expect((await POST(stale)).status).toBe(409);
    mocks.workspace.mockResolvedValue(null);
    const response = await POST(request()); expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not claim delivery when the session binding ended before provider handoff", async () => {
    mocks.send.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.forget).not.toHaveBeenCalled();
  });

  it("rejects another account's device without sending", async () => {
    mocks.find.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects malformed requests and view-only sessions", async () => {
    expect((await POST(request({ endpoint: 12 }))).status).toBe(400);
    mocks.workspace.mockResolvedValue({ workspace: { id: "a" }, user: { id: "a" }, impersonation: {} });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("limits repeated tests", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, retryAfterSeconds: 45 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("45");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("asks users to reconnect expired devices and keeps temporary failures retryable", async () => {
    mocks.send.mockRejectedValueOnce({ statusCode: 410 });
    expect((await POST(request())).status).toBe(410);
    expect(mocks.forget).toHaveBeenCalledTimes(1);
    mocks.send.mockRejectedValueOnce({ statusCode: 503 });
    expect((await POST(request())).status).toBe(502);
    expect(mocks.forget).toHaveBeenCalledTimes(1);
  });
});
