import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workerRequestAuthorized } from "../src/lib/worker-request";
import tick from "../netlify/functions/jump-worker-tick";

const mocks = vi.hoisted(() => ({
  heartbeat: vi.fn(),
  findJob: vi.fn(),
  updateJob: vi.fn(),
  generate: vi.fn()
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  workerHeartbeat: { upsert: mocks.heartbeat },
  job: { findFirst: mocks.findJob, updateMany: mocks.updateJob },
  workspacePreference: { findMany: vi.fn().mockResolvedValue([]) }
} }));
vi.mock("@/lib/jump-engine", () => ({ generateJumps: mocks.generate }));
vi.mock("@/lib/automatic-delivery", () => ({ runAutomaticDeliveries: vi.fn() }));
vi.mock("@/lib/notification-delivery", () => ({ runScheduledNotifications: vi.fn() }));
vi.mock("@/lib/operational-retention", () => ({ cleanupOperationalData: vi.fn() }));
vi.mock("@/lib/contact-import-jobs", () => ({ CONTACT_IMPORT_JOB_TASK: "contact-import", runContactImportBatch: vi.fn() }));

import { runWorkerPass } from "../src/worker/index";
import background from "../netlify/functions/jump-worker-background";

const secret = "worker-test-secret-".repeat(3);
const endpoint = "https://example.netlify.app/.netlify/functions/jump-worker-background";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.heartbeat.mockResolvedValue({});
  mocks.updateJob.mockResolvedValue({ count: 1 });
  mocks.findJob.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Netlify background worker", () => {
  it("rejects missing, incorrect, and short secrets and non-POST requests", () => {
    const request = (token?: string, method = "POST") => new Request(endpoint, {
      method, headers: token ? { authorization: `Bearer ${token}` } : {}
    });
    expect(workerRequestAuthorized(request(secret), secret)).toBe(true);
    expect(workerRequestAuthorized(request(), secret)).toBe(false);
    expect(workerRequestAuthorized(request(`${secret.slice(0, -1)}x`), secret)).toBe(false);
    expect(workerRequestAuthorized(request(secret), undefined)).toBe(false);
    expect(workerRequestAuthorized(request("short"), "short")).toBe(false);
    expect(workerRequestAuthorized(request(secret, "GET"), secret)).toBe(false);
  });

  it("performs no database work for an unauthorized background invocation", async () => {
    vi.stubEnv("NETLIFY_WORKER_SECRET", secret);
    await background(new Request(endpoint, { method: "POST" }));
    expect(mocks.heartbeat).not.toHaveBeenCalled();
    expect(mocks.findJob).not.toHaveBeenCalled();
  });

  it("finishes a bounded pass using the existing job lease", async () => {
    mocks.findJob.mockResolvedValue({ id: "job", task: "generate-jumps", payload: {}, workspaceId: "workspace", attempts: 0, maxAttempts: 6 });
    expect(await runWorkerPass({ maxJobs: 1 })).toBe(1);
    expect(mocks.findJob).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith({ workspaceId: "workspace", contactId: undefined, mixId: undefined });
    const leaseId = mocks.updateJob.mock.calls[0][0].data.lockedBy;
    expect(mocks.updateJob).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "job", lockedBy: leaseId, completedAt: null, failedAt: null },
      data: { completedAt: expect.any(Date), lockedAt: null, lockedBy: null, lastError: null }
    }));
    expect(mocks.heartbeat).toHaveBeenCalled();
  });

  it("does not execute a job claimed by another worker", async () => {
    mocks.findJob.mockResolvedValue({ id: "contested", attempts: 0 });
    mocks.updateJob.mockResolvedValue({ count: 0 });
    expect(await runWorkerPass()).toBe(0);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("authenticates the scheduled handoff and rejects unsuccessful invocation", async () => {
    vi.stubEnv("APP_URL", "https://example.netlify.app");
    vi.stubEnv("NETLIFY_WORKER_SECRET", secret);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await tick();
    expect(fetchMock).toHaveBeenCalledWith(new URL(endpoint), expect.objectContaining({
      method: "POST", headers: { authorization: `Bearer ${secret}`, origin: "https://example.netlify.app" }
    }));
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(tick()).rejects.toThrow("503");
  });
});
