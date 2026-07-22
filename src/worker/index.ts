import { randomUUID } from "node:crypto";
import { retryPendingAccountDeletionRevocations } from "@/lib/account-deletion";
import { CONTACT_IMPORT_JOB_TASK, runContactImportBatch } from "@/lib/contact-import-jobs";
import {
  enqueueDueGoogleContactsSyncs,
  googleSyncJobTask,
  runGoogleContactsSync
} from "@/lib/google-sync-service";
import { generateJumps } from "@/lib/jump-engine";
import { deliverNotificationEvent, enqueueDueDailyDigests } from "@/lib/notification-service";
import { cleanupOperationalData } from "@/lib/operational-retention";
import { prisma } from "@/lib/prisma";
import { reconcileDueReferralEntitlements } from "@/lib/referral-service";

const workerId = `worker-${randomUUID().slice(0, 8)}`;
const workerStartedAt = new Date();
const heartbeatIntervalMs = 15_000;
const jobLeaseMs = 10 * 60_000;
const jobLeaseRenewalMs = 30_000;
const maintenanceIntervalMs = 5 * 60_000;
const retentionIntervalMs = 24 * 60 * 60_000;
const maximumRetryDelayMs = 6 * 60 * 60_000;
let stopping = false;
let heartbeatTimer: NodeJS.Timeout | null = null;
let heartbeatChain: Promise<void> = Promise.resolve();

class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJobError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(?:postgres(?:ql)?:\/\/)[^\s]+/gi, "[database-url-redacted]").slice(0, 2000);
}

async function recordHeartbeat(lastJobAt?: Date) {
  const now = new Date();
  await prisma.workerHeartbeat.upsert({
    where: { workerId },
    create: { workerId, status: "RUNNING", startedAt: workerStartedAt, lastSeenAt: now, lastJobAt, metadata: { pid: process.pid, node: process.version } },
    update: { status: "RUNNING", lastSeenAt: now, stoppedAt: null, ...(lastJobAt ? { lastJobAt } : {}) }
  });
}

function queueHeartbeat(lastJobAt?: Date): Promise<void> {
  const queued = heartbeatChain.catch(() => undefined).then(() => recordHeartbeat(lastJobAt));
  heartbeatChain = queued;
  return queued;
}

async function markWorkerStopped() {
  await prisma.workerHeartbeat.updateMany({ where: { workerId }, data: { status: "STOPPED", stoppedAt: new Date(), lastSeenAt: new Date() } });
}

async function claimJob() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - jobLeaseMs);
  const candidate = await prisma.job.findFirst({
    where: { completedAt: null, failedAt: null, runAt: { lte: now }, OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
    orderBy: [{ runAt: "asc" }, { createdAt: "asc" }]
  });
  if (!candidate) return null;
  const leaseId = `${workerId}:${randomUUID()}`;
  const claimed = await prisma.job.updateMany({
    where: { id: candidate.id, completedAt: null, failedAt: null, runAt: { lte: now }, OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
    data: { lockedAt: now, lockedBy: leaseId, attempts: { increment: 1 } }
  });
  return claimed.count ? { ...candidate, attempts: candidate.attempts + 1, lockedAt: now, lockedBy: leaseId } : null;
}

type ClaimedJob = NonNullable<Awaited<ReturnType<typeof claimJob>>>;

function retryDelayMs(attempts: number): number {
  const base = Math.min(maximumRetryDelayMs, Math.max(5_000, 2 ** Math.min(attempts, 16) * 1000));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

async function executeJob(job: ClaimedJob): Promise<void> {
  if (job.task === "generate-jumps") {
    const payload = job.payload as { contactId?: string; mixId?: string };
    await generateJumps({ workspaceId: job.workspaceId ?? undefined, contactId: payload.contactId, mixId: payload.mixId });
    return;
  }
  if (job.task === googleSyncJobTask()) {
    const payload = job.payload as { connectionId?: string; syncRunId?: string; actorUserId?: string | null };
    if (!payload.connectionId || !payload.syncRunId) throw new PermanentJobError("Google Contacts sync job is missing its connection or run identifier.");
    await runGoogleContactsSync({ connectionId: payload.connectionId, syncRunId: payload.syncRunId, actorUserId: payload.actorUserId ?? null });
    return;
  }
  if (job.task === CONTACT_IMPORT_JOB_TASK) {
    const payload = job.payload as { batchId?: string };
    if (!payload.batchId) throw new PermanentJobError("Contact import job is missing its batch identifier.");
    await runContactImportBatch(payload.batchId);
    return;
  }
  if (job.task === "notification-delivery") {
    const payload = job.payload as { eventId?: string };
    if (!payload.eventId) throw new PermanentJobError("Notification delivery job is missing its event identifier.");
    await deliverNotificationEvent(payload.eventId);
    return;
  }
  throw new PermanentJobError(`Unsupported worker task: ${job.task}`);
}

async function processJob(job: ClaimedJob) {
  const leaseId = job.lockedBy;
  let leaseLost = false;
  const renewal = setInterval(() => {
    void prisma.job.updateMany({ where: { id: job.id, lockedBy: leaseId, completedAt: null, failedAt: null }, data: { lockedAt: new Date() } })
      .then((result) => { if (result.count !== 1) leaseLost = true; })
      .catch((error) => { leaseLost = true; console.error(`[${workerId}] Job lease renewal failed for ${job.id}`, error); });
  }, jobLeaseRenewalMs);
  renewal.unref();

  try {
    await executeJob(job);
    if (leaseLost) throw new Error("The job lease was lost before completion could be recorded.");
    const completed = await prisma.job.updateMany({ where: { id: job.id, lockedBy: leaseId, completedAt: null, failedAt: null }, data: { completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
    if (completed.count !== 1) throw new Error("The job lease was lost before completion could be recorded.");
    await queueHeartbeat(new Date()).catch((error) => console.error("Worker heartbeat failed", error));
  } catch (error) {
    const message = safeJobError(error);
    const permanent = error instanceof PermanentJobError;
    const shouldFail = permanent || job.attempts >= job.maxAttempts;
    const updated = await prisma.job.updateMany({
      where: { id: job.id, lockedBy: leaseId, completedAt: null, failedAt: null },
      data: { lastError: message, lockedAt: null, lockedBy: null, failedAt: shouldFail ? new Date() : null, runAt: shouldFail ? job.runAt : new Date(Date.now() + retryDelayMs(job.attempts)) }
    });
    if (shouldFail && job.task === CONTACT_IMPORT_JOB_TASK) {
      const payload = job.payload as { batchId?: string };
      if (payload.batchId) {
        await prisma.contactImportBatch.updateMany({ where: { id: payload.batchId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "FAILED", failedCount: { increment: 1 }, completedAt: new Date(), errorSummary: message } }).catch(() => undefined);
      }
    }
    if (updated.count !== 1) console.error(`[${workerId}] Job ${job.id} failed after its lease was lost: ${message}`);
    await queueHeartbeat().catch((heartbeatError) => console.error("Worker heartbeat failed", heartbeatError));
  } finally {
    clearInterval(renewal);
  }
}

type MaintenanceState = {
  jumpReconciliation: number;
  googleSchedule: number;
  referralReconciliation: number;
  accountDeletionRevocation: number;
  notificationDigests: number;
  retentionCleanup: number;
};

async function runMaintenanceIfDue(state: MaintenanceState): Promise<void> {
  const now = Date.now();
  if (now - state.jumpReconciliation >= maintenanceIntervalMs) {
    try { await generateJumps(); } catch (error) { console.error("Periodic Jump reconciliation failed", error); }
    state.jumpReconciliation = Date.now();
  }
  if (now - state.googleSchedule >= maintenanceIntervalMs) {
    try { await enqueueDueGoogleContactsSyncs(); } catch (error) { console.error("Google Contacts scheduling failed", error); }
    state.googleSchedule = Date.now();
  }
  if (now - state.referralReconciliation >= maintenanceIntervalMs) {
    try { await reconcileDueReferralEntitlements(); } catch (error) { console.error("Referral entitlement reconciliation failed", error); }
    state.referralReconciliation = Date.now();
  }
  if (now - state.accountDeletionRevocation >= maintenanceIntervalMs) {
    try { await retryPendingAccountDeletionRevocations(); } catch (error) { console.error("Account deletion revocation retry failed", error); }
    state.accountDeletionRevocation = Date.now();
  }
  if (now - state.notificationDigests >= maintenanceIntervalMs) {
    try { await enqueueDueDailyDigests(); } catch (error) { console.error("Notification digest scheduling failed", error); }
    state.notificationDigests = Date.now();
  }
  if (now - state.retentionCleanup >= retentionIntervalMs) {
    try { await cleanupOperationalData(); } catch (error) { console.error("Operational retention cleanup failed", error); }
    state.retentionCleanup = Date.now();
  }
}

async function main() {
  console.log(`[${workerId}] Jump worker started.`);
  await cleanupOperationalData().catch((error) => console.error("Startup retention cleanup failed", error));
  await queueHeartbeat();
  heartbeatTimer = setInterval(() => { void queueHeartbeat().catch((error) => console.error("Worker heartbeat failed", error)); }, heartbeatIntervalMs);
  heartbeatTimer.unref();

  const maintenance: MaintenanceState = { jumpReconciliation: 0, googleSchedule: 0, referralReconciliation: 0, accountDeletionRevocation: 0, notificationDigests: 0, retentionCleanup: Date.now() };
  while (!stopping) {
    await runMaintenanceIfDue(maintenance);
    const job = await claimJob();
    if (job) { await processJob(job); continue; }
    await sleep(2000);
  }
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await heartbeatChain.catch(() => undefined);
  await markWorkerStopped().catch((error) => console.error("Unable to record worker shutdown", error));
  await prisma.$disconnect();
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

main().catch(async (error) => {
  console.error(error);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await heartbeatChain.catch(() => undefined);
  await markWorkerStopped().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
