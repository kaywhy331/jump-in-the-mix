import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import { readEmailBudget } from "@/lib/email-budget";
import { operationsPolicy, type OperationsObservation, type OperationsState } from "@/lib/operations-policy";

export async function collectOperationsSignals(input: { webReady: boolean | null; backupAgeHours: number | null; restoreAgeDays: number | null; notificationsConfigured: boolean }, now = new Date(), db: PrismaClient = prisma): Promise<OperationsObservation[]> {
  const policy = operationsPolicy();
  const overdueBefore = new Date(now.getTime() - policy.jobOverdueSeconds * 1000);
  const data = await db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '10000ms'`;
    const [worker, failed, overdue, review, overdueInvitations, windows, storage, mfa, support, supportReview, supportOverdue] = await Promise.all([
      tx.workerHeartbeat.findFirst({ where: { status: "RUNNING" }, orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }),
      tx.job.count({ where: { failedAt: { not: null }, completedAt: null } }),
      tx.job.count({ where: { failedAt: null, completedAt: null, runAt: { lte: overdueBefore }, OR: [{ lockedAt: null }, { lockedAt: { lte: new Date(now.getTime() - 10 * 60_000) } }] } }),
      tx.waitlistDelivery.count({ where: { status: "REVIEW" } }),
      tx.waitlistDelivery.count({ where: { OR: [{ status: "QUEUED", nextAttemptAt: { lte: overdueBefore } }, { status: "SENDING", lockedAt: { lte: new Date(now.getTime() - 5 * 60_000) } }] } }),
      readEmailBudget(tx, now), tx.$queryRaw<Array<{ bytes: bigint }>>`SELECT pg_database_size(current_database()) AS bytes`,
      tx.authRateLimit.count({ where: { scope: { in: ["auth.admin-mfa.verify", "auth.admin-mfa.enable"] }, blockedUntil: { gt: now } } }),
      tx.platformAuditEvent.count({ where: { action: "support.view.start", createdAt: { gte: new Date(now.getTime() - 3600_000), lte: now } } }),
      tx.supportTicketMessage.count({ where: { authorType: "ADMIN", emailStatus: "FAILED" } }),
      tx.supportEmailDelivery.count({ where: { OR: [{ status: "QUEUED", availableAt: { lte: overdueBefore } }, { status: "SENDING", leaseUntil: { lte: now } }] } })
    ]);
    return { worker, failed, overdue, review, overdueInvitations, windows, databaseBytes: Number(storage[0].bytes), mfa, support, supportReview, supportOverdue };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
  const [day, month] = data.windows;
  const capacity = (used: number, limit: number): OperationsState => limit <= 0 ? "UNKNOWN" : used >= limit ? "CRITICAL" : used >= limit * .8 ? "WARNING" : "OK";
  const ratio = Math.max(...[[day.used, day.total], [day.otherUsed, day.other], [month.used, month.total], [month.otherUsed, month.other]].map(([used, limit]) => limit > 0 ? used / limit : 1));
  const workerAge = data.worker ? Math.max(0, Math.floor((now.getTime() - data.worker.lastSeenAt.getTime()) / 1000)) : null;
  const ageState = (age: number | null, limit: number): OperationsState => age === null ? "UNKNOWN" : age > limit ? "CRITICAL" : age >= limit * .8 ? "WARNING" : "OK";
  return [
    { code: "web", state: input.webReady === null ? "UNKNOWN" : input.webReady ? "OK" : "CRITICAL", evidence: { ready: input.webReady === null ? null : Number(input.webReady) } },
    { code: "worker", state: workerAge === null ? "CRITICAL" : workerAge > policy.workerStaleSeconds ? "CRITICAL" : "OK", evidence: { ageSeconds: workerAge, limitSeconds: policy.workerStaleSeconds } },
    { code: "jobs", state: data.failed || data.overdue ? "WARNING" : "OK", evidence: { failed: data.failed, overdue: data.overdue, overdueSeconds: policy.jobOverdueSeconds } },
    { code: "invitations", state: data.review || data.overdueInvitations ? "WARNING" : "OK", evidence: { review: data.review, overdue: data.overdueInvitations, overdueSeconds: policy.jobOverdueSeconds } },
    { code: "email", state: ratio >= 1 ? "CRITICAL" : ratio >= .8 || data.supportReview || data.supportOverdue ? "WARNING" : "OK", evidence: { dayUsed: day.used, dayLimit: day.total, dayOtherUsed: day.otherUsed, dayOtherLimit: day.other, monthUsed: month.used, monthLimit: month.total, monthOtherUsed: month.otherUsed, monthOtherLimit: month.other, supportReview: data.supportReview, supportOverdue: data.supportOverdue } },
    { code: "database", state: capacity(data.databaseBytes, policy.databaseLimitBytes), evidence: { bytes: data.databaseBytes, limitBytes: policy.databaseLimitBytes || null } },
    { code: "backup", state: ageState(input.backupAgeHours, policy.backupMaxAgeHours), evidence: { ageHours: input.backupAgeHours, limitHours: policy.backupMaxAgeHours } },
    { code: "restore", state: ageState(input.restoreAgeDays, policy.restoreMaxAgeDays), evidence: { ageDays: input.restoreAgeDays, limitDays: policy.restoreMaxAgeDays } },
    { code: "mfa", state: data.mfa ? "WARNING" : "OK", evidence: { blocked: data.mfa } },
    { code: "support", state: data.support >= policy.supportViewThreshold ? "WARNING" : "OK", evidence: { openedLastHour: data.support, limit: policy.supportViewThreshold } },
    { code: "notifications", state: input.notificationsConfigured ? "OK" : "UNKNOWN", evidence: { configured: Number(input.notificationsConfigured) } }
  ];
}
