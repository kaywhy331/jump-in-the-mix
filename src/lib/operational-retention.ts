import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;

export async function cleanupOperationalData(now = new Date()) {
  const completedJobsBefore = new Date(now.getTime() - 30 * DAY);
  const failedJobsBefore = new Date(now.getTime() - 90 * DAY);
  const shortLivedBefore = new Date(now.getTime() - 7 * DAY);
  const draftBefore = new Date(now.getTime() - 30 * DAY);
  const historyBefore = new Date(now.getTime() - 180 * DAY);
  const invitationBefore = new Date(now.getTime() - 90 * DAY);

  await prisma.workspaceInvitation.updateMany({ where: { status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  const results = await prisma.$transaction([
    prisma.job.deleteMany({ where: { OR: [{ completedAt: { lt: completedJobsBefore } }, { failedAt: { lt: failedJobsBefore } }] } }),
    prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: shortLivedBefore } } }),
    prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.captureDraft.deleteMany({ where: { expiresAt: { lt: draftBefore } } }),
    prisma.aiMixDraft.deleteMany({ where: { expiresAt: { lt: draftBefore } } }),
    prisma.workerHeartbeat.deleteMany({ where: { lastSeenAt: { lt: draftBefore } } }),
    prisma.webhookEvent.deleteMany({ where: { status: "PROCESSED", processedAt: { lt: failedJobsBefore } } }),
    prisma.notificationEvent.deleteMany({ where: { readAt: { lt: historyBefore } } }),
    prisma.workspaceInvitation.deleteMany({ where: { status: { in: ["ACCEPTED", "REVOKED", "EXPIRED"] }, updatedAt: { lt: invitationBefore } } }),
    prisma.userMfaSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } })
  ]);
  return results.map((result) => result.count).reduce((sum, count) => sum + count, 0);
}
