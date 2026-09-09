import { prisma } from "@/lib/prisma";
import { runDataRetention } from "@/lib/data-retention";
import { deleteExpiredImportSafeKeys } from "@/lib/import-receipt-retention";

const DAY = 24 * 60 * 60 * 1000;

export async function cleanupOperationalData(now = new Date()) {
  const completedJobsBefore = new Date(now.getTime() - 30 * DAY);
  const failedJobsBefore = new Date(now.getTime() - 90 * DAY);
  const heartbeatBefore = new Date(now.getTime() - 30 * DAY);
  const results = await prisma.$transaction([
    prisma.reportExport.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.reportDailySnapshot.deleteMany({ where: { day: { lt: new Date(now.getTime() - 400 * DAY) } } }),
    prisma.reportStorageObservation.deleteMany({ where: { day: { lt: new Date(now.getTime() - 400 * DAY) } } }),
    // Preparation successes prove that older failures were repaired. Keep those
    // receipts at least as long as the failures they cover.
    prisma.job.deleteMany({ where: { OR: [
      { task: { not: "generate-jumps" }, completedAt: { lt: completedJobsBefore } },
      { task: "generate-jumps", completedAt: { lt: failedJobsBefore } },
      { failedAt: { lt: failedJobsBefore } }
    ] } }),
    deleteExpiredImportSafeKeys(prisma, now),
    prisma.workerHeartbeat.deleteMany({ where: { lastSeenAt: { lt: heartbeatBefore } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } })
  ]);
  const privateData = await runDataRetention(now);
  return results.reduce<number>((sum, result) => sum + (typeof result === "number" ? result : result.count), 0) + Object.values(privateData).reduce((sum, count) => sum + count, 0);
}
