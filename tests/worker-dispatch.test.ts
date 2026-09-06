import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ job: vi.fn(), heartbeat: vi.fn(), rate: vi.fn(), after: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { job: { findFirst: mocks.job }, workerHeartbeat: { findFirst: mocks.heartbeat } } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { dispatchWorkerPass } from "@/lib/worker-dispatch";
import { wakeWorkerAfterResponse } from "@/lib/worker-dispatch-after";

const secret = "dispatch-test-secret-".repeat(3);
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("WORKER_DISPATCH_MODE", "netlify");
  vi.stubEnv("NETLIFY_WORKER_SECRET", secret);
  vi.stubEnv("APP_URL", "https://example.netlify.app");
  vi.stubGlobal("fetch", fetchMock);
  mocks.job.mockResolvedValue({ id: "queued" });
  mocks.heartbeat.mockResolvedValue({ lastSeenAt: new Date() });
  mocks.rate.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("background processor wakeups", () => {
  it.each([
    ["WORKER_DISPATCH_MODE", "off"], ["NETLIFY_WORKER_SECRET", "short"],
    ["APP_URL", "http://example.netlify.app"], ["APP_URL", "https://user:password@example.netlify.app"], ["APP_URL", "invalid"]
  ])("does no work with invalid or disabled configuration: %s=%s", async (key, value) => {
    vi.stubEnv(key, value);
    expect(await dispatchWorkerPass({ workspaceId: "owner" })).toBe("disabled");
    expect(mocks.job).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("scopes foreground queue checks and uses the authenticated handoff without following redirects", async () => {
    expect(await dispatchWorkerPass({ workspaceId: "owner" })).toBe("accepted");
    expect(mocks.job).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: "owner", completedAt: null, failedAt: null }) }));
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://example.netlify.app/.netlify/functions/jump-worker-background"), expect.objectContaining({
      method: "POST", redirect: "error", headers: { authorization: `Bearer ${secret}`, origin: "https://example.netlify.app" }, signal: expect.any(AbortSignal)
    }));
  });
  it("does not restart a healthy processor with an empty queue", async () => {
    mocks.job.mockResolvedValue(null);
    expect(await dispatchWorkerPass({ workspaceId: "owner" })).toBe("idle");
    expect(mocks.rate).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("catches up maintenance when an authenticated visit finds a stale heartbeat", async () => {
    mocks.job.mockResolvedValue(null);
    mocks.heartbeat.mockResolvedValue({ lastSeenAt: new Date(Date.now() - 61_000) });
    expect(await dispatchWorkerPass({ workspaceId: "owner" })).toBe("accepted");
  });
  it("ends backlog continuation when no claimable job remains, regardless of heartbeat", async () => {
    mocks.job.mockResolvedValue(null); mocks.heartbeat.mockResolvedValue(null);
    expect(await dispatchWorkerPass({ queuedOnly: true })).toBe("idle");
    expect(mocks.heartbeat).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("waits for a trailing window and rechecks whether another pass already completed the work", async () => {
    vi.useFakeTimers();
    mocks.rate.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 10 }).mockResolvedValue({ allowed: true });
    mocks.job.mockResolvedValueOnce({ id: "queued" }).mockResolvedValue(null);
    const result = dispatchWorkerPass({ workspaceId: "owner" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBe("idle"); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("dispatches changes that remain pending after the throttle window", async () => {
    vi.useFakeTimers();
    mocks.rate.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 10 }).mockResolvedValue({ allowed: true });
    const result = dispatchWorkerPass({ workspaceId: "owner" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBe("accepted"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("bounds repeated contention instead of holding a web response indefinitely", async () => {
    vi.useFakeTimers(); mocks.rate.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 10 }).mockResolvedValueOnce({ allowed: true }).mockResolvedValue({ allowed: false, retryAfterSeconds: 10 });
    const result = dispatchWorkerPass({ workspaceId: "owner" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBe("throttled"); expect(mocks.rate).toHaveBeenCalledTimes(3); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not keep more responses waiting when a trailing dispatch is already reserved", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, retryAfterSeconds: 10 });
    expect(await dispatchWorkerPass({ workspaceId: "owner" })).toBe("throttled");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([200, 401, 503])("does not treat HTTP %i as accepted processing", async status => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    expect(await dispatchWorkerPass({ workspaceId: "owner" })).toBe("failed");
  });
  it("keeps dispatch failures out of the completed request and does not log credentials", async () => {
    fetchMock.mockRejectedValue(new Error(`Sensitive detail: ${secret}`));
    expect(await dispatchWorkerPass({ workspaceId: "owner" })).toBe("failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
  });
  it("registers processing after the response without running it during a transaction", async () => {
    wakeWorkerAfterResponse("owner");
    expect(mocks.after).toHaveBeenCalledTimes(1); expect(mocks.job).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.job).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: "owner" }) }));
  });
});
