import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateJumps } from "@/lib/jump-engine";
import {
  enqueueDueGoogleContactsSyncs,
  googleSyncJobTask,
  runGoogleContactsSync
} from "@/lib/google-sync-service";
import { reconcileDueReferralEntitlements } from "@/lib/referral-service";

const workerId = `worker-${randomUUID().slice(0, 8)}`;
const workerStartedAt = new Date();
const heartbeatIntervalMs = 15_000;
let stopping = false;
let heartbeatTimer: NodeJS.Timeout | null = null;
let heartbeatChain: Promise<void> = Promise.resolve();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordHeartbeat(lastJobAt?: Date) {
  const now = new Date();
  await prisma.workerHeartbeat.upsert({
    where: { workerId },
    create: {
      workerId,
      status: "RUNNING",
      startedAt: workerStartedAt,
      lastSeenAt: now,
      lastJobAt,
      metadata: { pid: process.pid, node: process.version }
    },
    update: {
      status: "RUNNING",
      lastSeenAt: now,
      stoppedAt: null,
      ...(lastJobAt ? { lastJobAt } : {})
    }
  });
}

function queueHeartbeat(lastJobAt?: Date): Promise<void> {
  const queued = heartbeatChain
    .catch(() => undefined)
    .then(() => recordHeartbeat(lastJobAt));
  heartbeatChain = queued;
  return queued;
}

async function markWorkerStopped() {
  await prisma.workerHeartbeat.updateMany({
    where: { workerId },
    data: { status: "STOPPED", stoppedAt: new Date(), lastSeenAt: new Date() }
  });
}

async function claimJob() {
  const candidate = await prisma.job.findFirst({
    where: { completedAt: null, failedAt: null, lockedAt: null, runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" }
  });
  if (!candidate) return null;
  const claimed = await prisma.job.updateMany({
    where: { id: candidate.id, lockedAt: null, completedAt: null, failedAt: null },
    data: { lockedAt: new Date(), lockedBy: workerId, attempts: { increment: 1 } }
  });
  return claimed.count ? candidate : null;
}

async function processJob(job: Awaited<ReturnType<typeof claimJob>>) {
  if (!job) return;
  try {
    if (job.task === "generate-jumps") {
      const payload = job.payload as { contactId?: string; mixId?: string };
      await generateJumps({ workspaceId: job.workspaceId ?? undefined, contactId: payload.contactId, mixId: payload.mixId });
    } else if (job.task === googleSyncJobTask()) {
      const payload = job.payload as { connectionId?: string; syncRunId?: string; actorUserId?: string | null };
      if (!payload.connectionId || !payload.syncRunId) throw new Error("Google Contacts sync job is missing its connection or run identifier.");
      await runGoogleContactsSync({
        connectionId: payload.connectionId,
        syncRunId: payload.syncRunId,
        actorUserId: payload.actorUserId ?? null
      });
    }
    await prisma.job.update({ where: { id: job.id }, data: { completedAt: new Date(), lockedAt: null, lockedBy: null } });
    await queueHeartbeat(new Date()).catch((error) => console.error("Worker heartbeat failed", error));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldFail = job.attempts + 1 >= job.maxAttempts;
    await prisma.job.update({
      where: { id: job.id },
      data: {
        lastError: message,
        lockedAt: null,
        lockedBy: null,
        failedAt: shouldFail ? new Date() : null,
        runAt: shouldFail ? job.runAt : new Date(Date.now() + Math.min(60_000, 2 ** (job.attempts + 1) * 1000))
      }
    });
    await queueHeartbeat(new Date()).catch((heartbeatError) => console.error("Worker heartbeat failed", heartbeatError));
  }
}

async function main() {
  console.log(`[${workerId}] Jump worker started.`);
  await prisma.workerHeartbeat.deleteMany({
    where: { lastSeenAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60_000) } }
  });
  await queueHeartbeat();
  heartbeatTimer = setInterval(() => {
    void queueHeartbeat().catch((error) => console.error("Worker heartbeat failed", error));
  }, heartbeatIntervalMs);
  heartbeatTimer.unref();
  await prisma.job.updateMany({
    where: {
      completedAt: null,
      failedAt: null,
      lockedAt: { lt: new Date(Date.now() - 10 * 60_000) }
    },
    data: { lockedAt: null, lockedBy: null }
  });
  let lastReconciliation = 0;
  let lastGoogleSchedule = 0;
  let lastReferralReconciliation = 0;
  while (!stopping) {
    const job = await claimJob();
    if (job) {
      await processJob(job);
      continue;
    }
    if (Date.now() - lastReconciliation > 5 * 60_000) {
      try { await generateJumps(); } catch (error) { console.error("Periodic Jump reconciliation failed", error); }
      lastReconciliation = Date.now();
    }
    if (Date.now() - lastGoogleSchedule > 5 * 60_000) {
      try { await enqueueDueGoogleContactsSyncs(); } catch (error) { console.error("Google Contacts scheduling failed", error); }
      lastGoogleSchedule = Date.now();
    }
    if (Date.now() - lastReferralReconciliation > 5 * 60_000) {
      try { await reconcileDueReferralEntitlements(); } catch (error) { console.error("Referral entitlement reconciliation failed", error); }
      lastReferralReconciliation = Date.now();
    }
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
