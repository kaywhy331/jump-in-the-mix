import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { lockStaff } from "@/lib/staff-access";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { REPORT_EXPORT_TASK, REPORT_SNAPSHOT_TASK } from "@/lib/report-storage-policy";

export class JobRetryError extends Error {}
export async function retryFailedJob(input: { actorUserId: string; actorSessionId: string; jobId: string; expectedFailedAt: string }) {
  const failedAt = new Date(input.expectedFailedAt);
  if (!input.jobId || input.jobId.length > 100 || !Number.isFinite(failedAt.getTime()) || failedAt.toISOString() !== input.expectedFailedAt) throw new JobRetryError("Reload Operations and choose a listed failure.");
  return prisma.$transaction(async tx => {
    await lockStaff(tx);
    const now = new Date();
    const user = await tx.user.findUnique({ where: { id: input.actorUserId }, select: { emailVerifiedAt: true, suspendedAt: true, staffMembership: true } });
    const session = await tx.session.findFirst({ where: { id: input.actorSessionId, userId: input.actorUserId, expiresAt: { gt: now } } });
    if (!session || !user?.emailVerifiedAt || user.suspendedAt || !hasAdminPermission(user.staffMembership, "jobs.retry")) throw new JobRetryError("Your current staff session cannot retry jobs.");
    if (env.requireAdminMfa && (!await tx.adminMfaCredential.findFirst({ where: { userId: input.actorUserId, enabledAt: { not: null } } }) || !await tx.adminMfaSession.findFirst({ where: { userId: input.actorUserId, sessionId: session.id, expiresAt: { gt: now } } }))) throw new JobRetryError("Verify MFA before retrying this job.");
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Job" WHERE id=${input.jobId} AND "failedAt"=(${failedAt.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND "completedAt" IS NULL AND "lockedAt" IS NULL FOR UPDATE`;
    if (!rows.length) throw new JobRetryError("This job changed or is not a terminal failure. Reload Operations before retrying.");
    const job = await tx.job.findUniqueOrThrow({ where: { id: input.jobId }, select: { id: true, task: true, workspaceId: true, attempts: true, payload: true } });
    if (!["generate-jumps", "contact-import", REPORT_EXPORT_TASK, REPORT_SNAPSHOT_TASK].includes(job.task)) throw new JobRetryError("This task is no longer supported by the current worker.");
    if (job.task === "contact-import") {
      const batchId = job.payload && typeof job.payload === "object" && !Array.isArray(job.payload) ? job.payload.batchId : null;
      if (typeof batchId !== "string" || !job.workspaceId || !await tx.contactImportBatch.findFirst({ where: { id: batchId, workspaceId: job.workspaceId, canceledAt: null, status: { in: ["QUEUED", "RUNNING", "FAILED"] } }, select: { id: true } })) throw new JobRetryError("This import is closed or unavailable. Review its saved results and start a new import for any remaining rows.");
    }
    await tx.job.update({ where: { id: job.id }, data: { runAt: now, attempts: 0, lockedAt: null, lockedBy: null, completedAt: null, failedAt: null, lastError: null } });
    await tx.reportExport.updateMany({ where: { jobId: job.id, status: { in: ["FAILED", "QUEUED", "RUNNING"] } }, data: { status: "QUEUED" } });
    await tx.reportDailySnapshot.updateMany({ where: { jobId: job.id, status: { in: ["FAILED", "QUEUED", "RUNNING"] } }, data: { status: "QUEUED" } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "job.retry", entityType: "Job", entityId: job.id, afterData: { task: job.task, previousAttempts: job.attempts, failedAt: input.expectedFailedAt } } });
    if (job.workspaceId) await tx.auditLog.create({ data: { workspaceId: job.workspaceId, actorType: "ADMIN", actorUserId: input.actorUserId, action: "admin.job.retry", entityType: "Job", entityId: job.id, source: "admin.operations", metadata: { task: job.task, previousAttempts: job.attempts } } });
    return job;
  });
}
