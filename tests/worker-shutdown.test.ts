import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// How the worker ends a job that stopped at a saved step (Release B, B9): a contact import between
// chunks or a phone-number sweep, when the worker is stopping or has lost its lease. The job goes back
// to the queue due now with its attempt returned; other failures keep the backoff and the attempt.
const mocks = vi.hoisted(() => ({
  heartbeat: vi.fn(), findJob: vi.fn(), updateJob: vi.fn(), release: vi.fn(),
  importBatch: vi.fn(), importFailure: vi.fn(), phoneSweep: vi.fn(), generate: vi.fn()
}));
vi.mock("@/lib/prisma", () => { const db = {
  workerHeartbeat: { upsert: mocks.heartbeat },
  job: { findFirst: mocks.findJob, updateMany: mocks.updateJob },
  workspacePreference: { findMany: vi.fn().mockResolvedValue([]) },
  contactImportBatch: { updateMany: mocks.importFailure }
}; return { prisma: { ...db, $transaction: async (callback: (tx: typeof db) => unknown) => callback(db) } }; });
vi.mock("@/lib/journey", () => ({ runJourneyMaintenance: vi.fn() }));
vi.mock("@/lib/mix-workflow", () => ({ processWorkflowInstance: vi.fn(), runMixWorkflowMaintenance: vi.fn() }));
vi.mock("@/lib/database-release", () => ({ requireDatabaseRelease: mocks.release, waitForDatabaseRelease: vi.fn() }));
vi.mock("@/lib/calendar", () => ({ runCalendarSync: vi.fn() }));
vi.mock("@/lib/jump-engine", () => ({ generateJumps: mocks.generate }));
vi.mock("@/lib/automatic-delivery", () => ({ runAutomaticDeliveries: vi.fn() }));
vi.mock("@/lib/support-email-delivery", () => ({ deliverSupportEmails: vi.fn() }));
vi.mock("@/lib/notification-delivery", () => ({ runScheduledNotifications: vi.fn() }));
vi.mock("@/lib/operational-retention", () => ({ cleanupOperationalData: vi.fn() }));
vi.mock("@/lib/waitlist", () => ({ runDueWaitlistWave: vi.fn() }));
vi.mock("@/lib/waitlist-delivery", () => ({ deliverWaitlistInvitations: vi.fn() }));
vi.mock("@/lib/report-snapshots", () => ({ queueDailyReports: vi.fn(), runReportSnapshot: vi.fn(), markReportJobFailed: vi.fn() }));
vi.mock("@/lib/report-exports", () => ({ runReportExport: vi.fn() }));
vi.mock("@/lib/contact-import-jobs", () => ({ CONTACT_IMPORT_JOB_TASK: "contact-import", runContactImportBatch: mocks.importBatch }));
vi.mock("@/lib/phone-canonicalization", () => ({ PHONE_KEYS_TASK: "canonicalize-phones", runPhoneKeySweep: mocks.phoneSweep }));
vi.mock("@/lib/marketplace-service", () => ({ MARKETPLACE_REFRESH_INTERVAL_MS: 3_600_000, refreshStaleListings: vi.fn().mockResolvedValue({ checked: 0, changed: 0, next: null }) }));

import { runWorkerPass } from "../src/worker/index";
import { ImportInterruptedError } from "../src/lib/contact-import-lease";

const PAUSED = "Paused while the worker stopped. It resumes from its saved progress.";
type Lease = { jobId: string; leaseId: string; shouldStop(): boolean };

function job(fields: Record<string, unknown>) {
  return { id: "job-1", workspaceId: "workspace-1", payload: {}, attempts: 0, maxAttempts: 8, runAt: new Date(0), ...fields };
}
const claimedLease = () => mocks.updateJob.mock.calls[0][0].data.lockedBy as string;
const lastUpdate = () => mocks.updateJob.mock.calls.at(-1)![0] as { where: Record<string, unknown>; data: Record<string, unknown> };

// The lease renewal (every 30 s) finds the job no longer held by this worker, so shouldStop() turns true.
async function loseLease() {
  mocks.updateJob.mockResolvedValueOnce({ count: 0 });
  await vi.advanceTimersByTimeAsync(30_000);
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  mocks.heartbeat.mockResolvedValue({});
  mocks.updateJob.mockResolvedValue({ count: 1 });
  mocks.importFailure.mockResolvedValue({ count: 1 });
  mocks.release.mockResolvedValue(undefined);
  mocks.findJob.mockResolvedValue(null);
  mocks.phoneSweep.mockResolvedValue({ scanned: 0, rewritten: 0, merged: 0 });
});
afterEach(() => { vi.useRealTimers(); });

describe("worker lease and pause release", () => {
  it("gives imports a lease that can tell them to stop", async () => {
    mocks.findJob.mockResolvedValueOnce(job({ id: "import-job", task: "contact-import", payload: { batchId: "batch" } }));
    await runWorkerPass({ maxJobs: 1 });
    expect(mocks.importBatch).toHaveBeenCalledWith("batch", { jobId: "import-job", leaseId: claimedLease(), shouldStop: expect.any(Function) });
    expect((mocks.importBatch.mock.calls[0][1] as Lease).shouldStop()).toBe(false);
    expect(lastUpdate().data).toMatchObject({ completedAt: expect.any(Date), lockedBy: null });
  });

  it("hands an import interrupted after a lost lease back without failing it, even on its last attempt", async () => {
    mocks.findJob.mockResolvedValueOnce(job({ id: "import-job", task: "contact-import", payload: { batchId: "batch" }, attempts: 7, maxAttempts: 8 }));
    mocks.importBatch.mockImplementationOnce(async () => { await loseLease(); throw new ImportInterruptedError(); });
    const before = Date.now();
    await runWorkerPass({ maxJobs: 1 });
    const release = lastUpdate();
    expect(release.where).toEqual({ id: "import-job", lockedBy: claimedLease(), completedAt: null, failedAt: null });
    expect(release.data).toEqual({ lockedAt: null, lockedBy: null, runAt: expect.any(Date), attempts: 7, lastError: PAUSED });
    expect((release.data.runAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((release.data.runAt as Date).getTime()).toBeLessThanOrEqual(Date.now());
    expect(mocks.importFailure).not.toHaveBeenCalled();
  });

  it("keeps an ordinary import interruption on the retry path with its attempt spent", async () => {
    mocks.findJob.mockResolvedValueOnce(job({ id: "import-job", task: "contact-import", payload: { batchId: "batch" }, attempts: 2 }));
    mocks.importBatch.mockRejectedValueOnce(new ImportInterruptedError());
    await runWorkerPass({ maxJobs: 1 });
    const retry = lastUpdate().data;
    expect(retry).toMatchObject({ lastError: "Import processing was interrupted. Saved rows will be reused on retry.", failedAt: null, lockedBy: null });
    expect(retry).not.toHaveProperty("attempts");
    expect((retry.runAt as Date).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("phone-number sweep jobs", () => {
  it.each([
    ["the payload's workspace", { workspaceId: "workspace-1" }, "workspace-1", { workspaceId: "workspace-1" }],
    ["the job's workspace", {}, "workspace-2", { workspaceId: "workspace-2" }],
    ["every workspace", {}, null, {}],
    ["every workspace (null payload)", null, null, {}]
  ])("sweeps %s with the job lease and records completion", async (_name, payload, workspaceId, scope) => {
    mocks.findJob.mockResolvedValueOnce(job({ id: "sweep", task: "canonicalize-phones", payload, workspaceId }));
    expect(await runWorkerPass({ maxJobs: 1 })).toBe(1);
    expect(mocks.phoneSweep).toHaveBeenCalledExactlyOnceWith(scope, { jobId: "sweep", leaseId: claimedLease(), shouldStop: expect.any(Function) });
    expect(lastUpdate().data).toEqual({ completedAt: expect.any(Date), lockedAt: null, lockedBy: null, lastError: null });
  });

  it.each([
    ["names two workspaces", { workspaceId: "other" }, "Phone number job names two different workspaces."],
    ["has an invalid workspace", { workspaceId: 42 }, "Phone number job has an invalid workspace."],
    ["has an empty workspace", { workspaceId: "" }, "Phone number job has an invalid workspace."],
    ["has an invalid payload", ["workspace-1"], "Phone number job has an invalid payload."]
  ])("fails a job that %s without sweeping", async (_name, payload, message) => {
    mocks.findJob.mockResolvedValueOnce(job({ id: "sweep", task: "canonicalize-phones", payload }));
    await runWorkerPass({ maxJobs: 1 });
    expect(mocks.phoneSweep).not.toHaveBeenCalled();
    expect(lastUpdate().data).toMatchObject({ lastError: message, failedAt: expect.any(Date), lockedBy: null });
  });

  it.each([
    ["returns", async () => ({ scanned: 3, rewritten: 1, merged: 0 })],
    ["throws", async () => { throw new Error("Stopped between contacts."); }]
  ])("pauses instead of completing when the sweep %s after being told to stop", async (_name, finish) => {
    mocks.findJob.mockResolvedValueOnce(job({ id: "sweep", task: "canonicalize-phones", attempts: 7, maxAttempts: 8 }));
    mocks.phoneSweep.mockImplementationOnce(async (_scope: unknown, lease: Lease) => {
      await loseLease();
      expect(lease.shouldStop()).toBe(true);
      return finish();
    });
    await runWorkerPass({ maxJobs: 1 });
    expect(mocks.updateJob.mock.calls.some(([call]) => call.data.completedAt)).toBe(false);
    expect(lastUpdate()).toEqual({
      where: { id: "sweep", lockedBy: claimedLease(), completedAt: null, failedAt: null },
      data: { lockedAt: null, lockedBy: null, runAt: expect.any(Date), attempts: 7, lastError: PAUSED }
    });
  });

  it("retries a sweep failure that happens while the worker is running normally", async () => {
    mocks.findJob.mockResolvedValueOnce(job({ id: "sweep", task: "canonicalize-phones", attempts: 1 }));
    mocks.phoneSweep.mockRejectedValueOnce(new Error("Sweep query failed"));
    await runWorkerPass({ maxJobs: 1 });
    const retry = lastUpdate().data;
    expect(retry).toMatchObject({ lastError: "Sweep query failed", failedAt: null, lockedBy: null });
    expect(retry).not.toHaveProperty("attempts");
    expect((retry.runAt as Date).getTime()).toBeGreaterThan(Date.now());
  });
});
