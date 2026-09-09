import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workerRequestAuthorized } from "../src/lib/worker-request";
import { handler as tick } from "../netlify/functions/jump-worker-schedule";

const mocks = vi.hoisted(() => ({
  supportEmail: vi.fn(), release: vi.fn(), importBatch: vi.fn(), importFailure: vi.fn(),
  heartbeat: vi.fn(),
  findJob: vi.fn(),
  updateJob: vi.fn(),
  generate: vi.fn(),
  dispatch: vi.fn(), reportExport: vi.fn(), reportSnapshot: vi.fn(), reportFailed: vi.fn()
}));
vi.mock("@/lib/prisma", () => { const db = {
  workerHeartbeat: { upsert: mocks.heartbeat },
  job: { findFirst: mocks.findJob, updateMany: mocks.updateJob },
  workspacePreference: { findMany: vi.fn().mockResolvedValue([]) },
  contactImportBatch: { updateMany: mocks.importFailure }
}; return { prisma: { ...db, $transaction: async (callback: (tx: typeof db) => unknown) => callback(db) } }; });
vi.mock("@/lib/journey", () => ({ runJourneyMaintenance: vi.fn() }));
vi.mock("@/lib/database-release", () => ({ requireDatabaseRelease: mocks.release }));
vi.mock("@/lib/calendar", () => ({ runCalendarSync: vi.fn() }));
vi.mock("@/lib/jump-engine", () => ({ generateJumps: mocks.generate }));
vi.mock("@/lib/automatic-delivery", () => ({ runAutomaticDeliveries: vi.fn() }));
vi.mock("@/lib/support-email-delivery", () => ({ deliverSupportEmails: mocks.supportEmail }));
vi.mock("@/lib/notification-delivery", () => ({ runScheduledNotifications: vi.fn() }));
vi.mock("@/lib/operational-retention", () => ({ cleanupOperationalData: vi.fn() }));
vi.mock("@/lib/report-snapshots", () => ({ queueDailyReports: vi.fn(), runReportSnapshot: mocks.reportSnapshot, markReportJobFailed: mocks.reportFailed }));
vi.mock("@/lib/report-exports", () => ({ runReportExport: mocks.reportExport }));
vi.mock("@/lib/contact-import-jobs", () => ({ CONTACT_IMPORT_JOB_TASK: "contact-import", runContactImportBatch: mocks.importBatch }));
vi.mock("@/lib/worker-dispatch", () => ({ dispatchWorkerPass: mocks.dispatch }));

import { runWorkerPass } from "../src/worker/index";
import background from "../netlify/functions/jump-worker-background";

const secret = "worker-test-secret-".repeat(3);
const endpoint = "https://example.netlify.app/.netlify/functions/jump-worker-background";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.heartbeat.mockResolvedValue({});
  mocks.updateJob.mockResolvedValue({ count: 1 });
  mocks.importFailure.mockResolvedValue({ count: 1 });
  mocks.importBatch.mockResolvedValue(undefined);
  mocks.findJob.mockResolvedValue(null);
  mocks.release.mockResolvedValue(undefined);
  mocks.reportExport.mockResolvedValue(undefined); mocks.reportSnapshot.mockResolvedValue(undefined); mocks.reportFailed.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Netlify background worker", () => {
  it("does not claim work or advertise a heartbeat before the database release is ready", async () => {
    mocks.release.mockRejectedValueOnce(new Error("Database migrations pending"));
    await expect(runWorkerPass()).rejects.toThrow("migrations pending");
    expect(mocks.heartbeat).not.toHaveBeenCalled(); expect(mocks.findJob).not.toHaveBeenCalled(); expect(mocks.supportEmail).not.toHaveBeenCalled();
  });
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
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("checks for backlog continuation only after an authorized pass completes", async () => {
    vi.stubEnv("NETLIFY_WORKER_SECRET", secret);
    await background(new Request(endpoint, { method: "POST", headers: { authorization: `Bearer ${secret}` } }));
    expect(mocks.heartbeat).toHaveBeenCalled();
    expect(mocks.supportEmail).toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenCalledExactlyOnceWith({ queuedOnly: true });
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
  it("settles an exhausted lease without executing or incrementing it, then continues the pass", async () => {
    mocks.findJob.mockResolvedValueOnce({ id: "exhausted", task: "generate-jumps", payload: {}, workspaceId: "workspace", attempts: 8, maxAttempts: 8 })
      .mockResolvedValueOnce({ id: "next", task: "generate-jumps", payload: {}, workspaceId: "workspace", attempts: 0, maxAttempts: 8 });
    expect(await runWorkerPass({ maxJobs: 2 })).toBe(2);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.updateJob.mock.calls[0][0].data.attempts).toBeUndefined();
    expect(mocks.updateJob.mock.calls[0][0].where).toMatchObject({ attempts: 8, maxAttempts: 8 });
    expect(mocks.updateJob.mock.calls[1][0].data).toMatchObject({ failedAt: expect.any(Date), lockedBy: null, lastError: expect.stringContaining("attempt limit") });
  });
  it("passes the current lease to imports and records terminal failure in the same workspace", async () => {
    mocks.findJob.mockResolvedValueOnce({ id: "import-job", task: "contact-import", payload: { batchId: "batch" }, workspaceId: "workspace", attempts: 7, maxAttempts: 8 });
    mocks.importBatch.mockRejectedValueOnce(new Error("Import database interrupted"));
    await runWorkerPass({ maxJobs: 1 });
    const leaseId = mocks.updateJob.mock.calls[0][0].data.lockedBy;
    expect(mocks.importBatch).toHaveBeenCalledWith("batch", { jobId: "import-job", leaseId });
    expect(mocks.importFailure).toHaveBeenCalledExactlyOnceWith({
      where: { id: "batch", workspaceId: "workspace", canceledAt: null, status: { in: ["QUEUED", "RUNNING", "FAILED"] } },
      data: { status: "FAILED", completedAt: expect.any(Date), errorSummary: "Import processing was interrupted. Saved rows will be reused on retry." }
    });
  });
  it("does not overwrite import status after losing its lease", async () => {
    mocks.findJob.mockResolvedValueOnce({ id: "import-job", task: "contact-import", payload: { batchId: "batch" }, workspaceId: "workspace", attempts: 7, maxAttempts: 8 });
    mocks.updateJob.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mocks.importBatch.mockRejectedValueOnce(new Error("Old worker stopped"));
    await runWorkerPass({ maxJobs: 1 });
    expect(mocks.importFailure).not.toHaveBeenCalled();
  });
  it.each(["admin-report-export", "admin-report-snapshot"])("dispatches %s with its claimed lease only after checking customer work", async task => {
    mocks.findJob.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "report-job", task, payload: { exportId: "export", snapshotId: "snapshot" }, attempts: 0, maxAttempts: 3 });
    expect(await runWorkerPass({ maxJobs: 1 })).toBe(1);
    expect(mocks.findJob.mock.calls[0][0].where.task).toEqual({ notIn: ["admin-report-export", "admin-report-snapshot"] });
    const leaseId = mocks.updateJob.mock.calls[0][0].data.lockedBy;
    expect(task === "admin-report-export" ? mocks.reportExport : mocks.reportSnapshot).toHaveBeenCalledWith(task === "admin-report-export" ? "export" : "snapshot", { jobId: "report-job", leaseId });
  });
  it("records a terminal report failure only after updating its own job lease", async () => {
    mocks.findJob.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "failed-report", task: "admin-report-export", payload: { exportId: "export" }, attempts: 2, maxAttempts: 3 });
    mocks.reportExport.mockRejectedValueOnce(new Error("Aggregate report unavailable."));
    await runWorkerPass({ maxJobs: 1 }); expect(mocks.reportFailed).toHaveBeenCalledWith("failed-report");
  });

  it("authenticates the scheduled handoff and rejects unsuccessful invocation", async () => {
    vi.stubEnv("APP_URL", "https://example.netlify.app");
    vi.stubEnv("NETLIFY_WORKER_SECRET", secret);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(tick()).resolves.toEqual({ statusCode: 200 });
    expect(fetchMock).toHaveBeenCalledWith(new URL(endpoint), expect.objectContaining({
      method: "POST", headers: { authorization: `Bearer ${secret}`, origin: "https://example.netlify.app" }
    }));
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(tick()).rejects.toThrow("503");
  });
});
