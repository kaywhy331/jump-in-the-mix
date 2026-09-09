import type { OperationsObservation } from "../../src/lib/operations-policy";
import { prisma } from "../../src/lib/prisma";
import { createEmailReviewFixture } from "./email-review-fixture";
export function healthyOperationsObservations(): OperationsObservation[] {
  return [
    { code: "web", state: "OK", evidence: { ready: 1 } },
    { code: "worker", state: "OK", evidence: { ageSeconds: 1, limitSeconds: 90 } },
    { code: "jobs", state: "OK", evidence: { failed: 0, overdue: 0, overdueSeconds: 900 } },
    { code: "invitations", state: "OK", evidence: { review: 0, overdue: 0, overdueSeconds: 900 } },
    { code: "email", state: "OK", evidence: { dayUsed: 0, dayLimit: 90, dayOtherUsed: 0, dayOtherLimit: 70, monthUsed: 0, monthLimit: 2700, monthOtherUsed: 0, monthOtherLimit: 2400, supportReview: 0, supportOverdue: 0 } },
    { code: "database", state: "OK", evidence: { bytes: 1000, limitBytes: 10000 } },
    { code: "backup", state: "OK", evidence: { ageHours: 1, limitHours: 36 } },
    { code: "restore", state: "OK", evidence: { ageDays: 1, limitDays: 30 } },
    { code: "mfa", state: "OK", evidence: { blocked: 0 } },
    { code: "support", state: "OK", evidence: { openedLastHour: 0, limit: 10 } },
    { code: "notifications", state: "OK", evidence: { configured: 1 } }
  ];
}
export async function createOperationsFixture() {
  if (await prisma.operationsMonitor.count() || await prisma.operationsCheck.count()) throw new Error("Operations fixtures require empty monitor state in an isolated database.");
  const f = await createEmailReviewFixture();
  return { ...f, async cleanup() {
    await prisma.operationsNotice.deleteMany(); await prisma.operationsCheck.deleteMany(); await prisma.operationsMonitor.deleteMany();
    await prisma.platformAuditEvent.deleteMany({ where: { entityType: "OperationsCheck" } });
    await prisma.workerHeartbeat.deleteMany({ where: { workerId: f.user.id } });
    await prisma.authRateLimit.deleteMany({ where: { key: { startsWith: f.user.id } } });
    await prisma.job.deleteMany({ where: { id: { startsWith: f.user.id } } });
    await f.cleanup();
  } };
}
