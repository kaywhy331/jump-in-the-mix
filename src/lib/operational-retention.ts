import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;

export async function cleanupOperationalData(now = new Date()) {
  const completedJobsBefore = new Date(now.getTime() - 30 * DAY);
  const failedJobsBefore = new Date(now.getTime() - 90 * DAY);
  const heartbeatBefore = new Date(now.getTime() - 30 * DAY);
  const results = await prisma.$transaction([
    // Preparation successes prove that older failures were repaired. Keep those
    // receipts at least as long as the failures they cover.
    prisma.job.deleteMany({ where: { OR: [
      { task: { not: "generate-jumps" }, completedAt: { lt: completedJobsBefore } },
      { task: "generate-jumps", completedAt: { lt: failedJobsBefore } },
      { failedAt: { lt: failedJobsBefore } }
    ] } }),
    prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.workerHeartbeat.deleteMany({ where: { lastSeenAt: { lt: heartbeatBefore } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } })
  ]);
  return results.reduce((sum, result) => sum + result.count, 0);
}
