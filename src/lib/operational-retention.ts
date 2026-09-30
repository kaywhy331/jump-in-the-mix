import { prisma } from "@/lib/prisma";
import { runDataRetention } from "@/lib/data-retention";
import { deleteExpiredImportSafeKeys } from "@/lib/import-receipt-retention";

const DAY = 24 * 60 * 60 * 1000;
/** Every limiter window is a day or shorter, so a window that opened this long ago is inert. */
const STALE_RATE_LIMIT_WINDOW_MS = 2 * DAY;

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
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    // Anonymous OAuth starts each store a state row that is useless once expired (10 minutes by default).
    prisma.authOAuthState.deleteMany({ where: { expiresAt: { lt: now } } }),
    // Stripe retries an event for up to three days, so an event id is no longer needed after 90.
    prisma.stripeWebhookEvent.deleteMany({ where: { receivedAt: { lt: new Date(now.getTime() - 90 * DAY) } } })
  ]);
  const privateData = await runDataRetention(now);
  const removed = results.reduce<number>((sum, result) => sum + (typeof result === "number" ? result : result.count), 0) + Object.values(privateData).reduce((sum, count) => sum + count, 0);
  // Last and guarded on its own, so a failure here cannot skip the passes above.
  return removed + await purgeStaleRateLimits(now);
}

/**
 * Removes rate-limit rows whose window opened more than 48 hours ago, unless they are still
 * blocked: an active block must outlive the cleanup. Every distinct address (forged or not)
 * creates a row, so without this pass the table only ever grows.
 */
async function purgeStaleRateLimits(now: Date): Promise<number> {
  try {
    const { count } = await prisma.authRateLimit.deleteMany({
      where: {
        windowStartedAt: { lt: new Date(now.getTime() - STALE_RATE_LIMIT_WINDOW_MS) },
        OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }]
      }
    });
    return count;
  } catch {
    console.error("Stale rate-limit cleanup failed; the other retention passes completed.");
    return 0;
  }
}
