import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateJumps } from "@/lib/jump-engine";

const workerId = `worker-${randomUUID().slice(0, 8)}`;
let stopping = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    }
    await prisma.job.update({ where: { id: job.id }, data: { completedAt: new Date(), lockedAt: null, lockedBy: null } });
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
  }
}

async function main() {
  console.log(`[${workerId}] Jump worker started.`);
  await prisma.job.updateMany({
    where: {
      completedAt: null,
      failedAt: null,
      lockedAt: { lt: new Date(Date.now() - 10 * 60_000) }
    },
    data: { lockedAt: null, lockedBy: null }
  });
  let lastReconciliation = 0;
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
    await sleep(2000);
  }
  await prisma.$disconnect();
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
