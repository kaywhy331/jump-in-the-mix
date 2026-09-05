import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;

export async function cleanupOperationalData(now = new Date()) {
  const completedJobsBefore = new Date(now.getTime() - 30 * DAY);
  const failedJobsBefore = new Date(now.getTime() - 90 * DAY);
  const heartbeatBefore = new Date(now.getTime() - 30 * DAY);
  const results = await prisma.$transaction([
    prisma.job.deleteMany({ where: { OR: [{ completedAt: { lt: completedJobsBefore } }, { failedAt: { lt: failedJobsBefore } }] } }),
    prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.workerHeartbeat.deleteMany({ where: { lastSeenAt: { lt: heartbeatBefore } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } })
  ]);
  return results.reduce((sum, result) => sum + result.count, 0);
}
