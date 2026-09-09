import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { lockStaff } from "@/lib/staff-access";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { parseReportRange, ReportError, REPORT_DAY_MS } from "@/lib/admin-report-range";
import { readAdminReport } from "@/lib/admin-report-data";
import { reportCsv } from "@/lib/report-csv";
import { REPORT_EXPORT_BYTES, REPORT_EXPORT_TASK } from "@/lib/report-storage-policy";
import { decryptIntegrationCredentials, encryptIntegrationCredentials } from "@/lib/integration-crypto";

export type ReportActor = { actorUserId: string; actorSessionId: string };
export type ReportJobLease = { jobId: string; leaseId: string };
export async function reportActorAuthorized(tx: Prisma.TransactionClient, actor: ReportActor, now = new Date()) {
  const user = await tx.user.findUnique({ where: { id: actor.actorUserId }, select: { emailVerifiedAt: true, suspendedAt: true, staffMembership: true } });
  if (!user?.emailVerifiedAt || user.suspendedAt || !hasAdminPermission(user.staffMembership, "reports.read")) return false;
  if (!await tx.session.findFirst({ where: { id: actor.actorSessionId, userId: actor.actorUserId, expiresAt: { gt: now } } })) return false;
  if (env.requireAdminMfa && (!await tx.adminMfaCredential.findFirst({ where: { userId: actor.actorUserId, enabledAt: { not: null } } })
    || !await tx.adminMfaSession.findFirst({ where: { userId: actor.actorUserId, sessionId: actor.actorSessionId, expiresAt: { gt: now } } }))) return false;
  return true;
}
export async function ownsReportLease(tx: Prisma.TransactionClient, lease: ReportJobLease, task: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Job" WHERE id=${lease.jobId} AND "lockedBy"=${lease.leaseId} AND task=${task}
    AND "lockedAt">(${new Date(Date.now() - 10 * 60_000).toISOString()}::timestamptz AT TIME ZONE 'UTC') AND "completedAt" IS NULL AND "failedAt" IS NULL FOR UPDATE`;
  return rows.length === 1;
}
export async function requestReportExport(actor: ReportActor, input: { from: unknown; through: unknown; requestKey: unknown }) {
  const range = parseReportRange(input);
  if (typeof input.requestKey !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestKey)) throw new ReportError("Reload Reports before requesting an export.");
  const requestKey = input.requestKey;
  return prisma.$transaction(async tx => {
    await lockStaff(tx);
    const now = new Date();
    if (!await reportActorAuthorized(tx, actor, now)) throw new ReportError("Your current staff session cannot request reports. Sign in and verify MFA again.");
    const existing = await tx.reportExport.findUnique({ where: { actorSessionId_requestKey: { actorSessionId: actor.actorSessionId, requestKey } }, select: { id: true, actorUserId: true, fromDay: true, throughDay: true } });
    if (existing) {
      if (existing.actorUserId !== actor.actorUserId || existing.fromDay.getTime() !== range.from.getTime() || existing.throughDay.toISOString().slice(0, 10) !== range.throughDay) throw new ReportError("This request changed. Reload Reports before exporting.");
      return existing.id;
    }
    const active = { expiresAt: { gt: now }, status: { in: ["QUEUED", "RUNNING"] } };
    const since = new Date(now.getTime() - REPORT_DAY_MS);
    if (await tx.reportExport.count({ where: { ...active, actorUserId: actor.actorUserId } }) >= 2 || await tx.reportExport.count({ where: active }) >= 10) throw new ReportError("Report preparation is busy. Wait for an existing export to finish.");
    // Audit receipts survive sign-out/session cleanup, so rotating sessions cannot reset this allowance.
    if (await tx.platformAuditEvent.count({ where: { action: "report.export.request", actorUserId: actor.actorUserId, createdAt: { gt: since } } }) >= 5 || await tx.platformAuditEvent.count({ where: { action: "report.export.request", createdAt: { gt: since } } }) >= 50) throw new ReportError("The daily report export allowance is used. Please try again tomorrow.");
    const row = await tx.reportExport.create({ data: { ...actor, requestKey, fromDay: range.from, throughDay: new Date(`${range.throughDay}T00:00:00Z`), expiresAt: new Date(now.getTime() + REPORT_DAY_MS) } });
    const job = await tx.job.create({ data: { task: REPORT_EXPORT_TASK, payload: { exportId: row.id }, maxAttempts: 3 } });
    await tx.reportExport.update({ where: { id: row.id }, data: { jobId: job.id } });
    await tx.platformAuditEvent.create({ data: { actorUserId: actor.actorUserId, action: "report.export.request", entityType: "ReportExport", entityId: row.id, afterData: { from: range.fromDay, through: range.throughDay } } });
    return row.id;
  });
}

export async function runReportExport(id: string, lease: ReportJobLease) {
  const row = await prisma.$transaction(async tx => {
    await lockStaff(tx);
    if (!await ownsReportLease(tx, lease, REPORT_EXPORT_TASK)) throw new Error("Report job lease is unavailable.");
    const current = await tx.reportExport.findFirst({ where: { id, jobId: lease.jobId } });
    if (!current || current.status === "READY" || current.status === "CANCELLED") return null;
    if (current.expiresAt <= new Date() || !await reportActorAuthorized(tx, current)) {
      await tx.reportExport.update({ where: { id }, data: { status: "CANCELLED", contentCiphertext: null } });
      await tx.platformAuditEvent.create({ data: { actorUserId: current.actorUserId, action: "report.export.cancel", entityType: "ReportExport", entityId: id, outcome: "DENIED" } });
      return null;
    }
    await tx.reportExport.update({ where: { id }, data: { status: "RUNNING" } }); return current;
  });
  if (!row) return;
  try {
    const range = parseReportRange({ from: row.fromDay.toISOString().slice(0, 10), through: row.throughDay.toISOString().slice(0, 10) });
    const csv = reportCsv(await readAdminReport(range, true), range);
    const contentCiphertext = encryptIntegrationCredentials({ exportId: id, actorSessionId: row.actorSessionId, format: 1, csv });
    await prisma.$transaction(async tx => {
      await lockStaff(tx);
      if (!await ownsReportLease(tx, lease, REPORT_EXPORT_TASK)) throw new Error("Report job lease was lost.");
      const current = await tx.reportExport.findFirst({ where: { id, jobId: lease.jobId, status: "RUNNING" } });
      if (!current) return;
      if (current.expiresAt <= new Date() || !await reportActorAuthorized(tx, current)) {
        await tx.reportExport.update({ where: { id }, data: { status: "CANCELLED", contentCiphertext: null } });
        await tx.platformAuditEvent.create({ data: { actorUserId: row.actorUserId, action: "report.export.cancel", entityType: "ReportExport", entityId: id, outcome: "DENIED" } });
        return;
      }
      const byteCount = Buffer.byteLength(csv, "utf8");
      await tx.reportExport.update({ where: { id }, data: { status: "READY", contentCiphertext, generatedAt: range.asOf, byteCount } });
      await tx.platformAuditEvent.create({ data: { actorUserId: row.actorUserId, action: "report.export.ready", entityType: "ReportExport", entityId: id, afterData: { byteCount } } });
    });
  } catch { throw new Error("Aggregate export could not be prepared. Retry or use a shorter range."); }
}

export async function downloadReportExport(actor: ReportActor, id: string) {
  return prisma.$transaction(async tx => {
    await lockStaff(tx);
    if (!await reportActorAuthorized(tx, actor)) throw new ReportError("Your current staff session cannot download this report.");
    const row = await tx.reportExport.findFirst({ where: { id, ...actor, status: "READY", expiresAt: { gt: new Date() } } });
    if (!row?.contentCiphertext) throw new ReportError("This report is unavailable, expired, or belongs to another sign-in.");
    const content = decryptIntegrationCredentials<{ format: number; exportId: string; actorSessionId: string; csv: string }>(row.contentCiphertext);
    if (content.format !== 1 || content.exportId !== row.id || content.actorSessionId !== actor.actorSessionId || typeof content.csv !== "string" || Buffer.byteLength(content.csv, "utf8") > REPORT_EXPORT_BYTES || Buffer.byteLength(content.csv, "utf8") !== row.byteCount) throw new ReportError("This report could not be opened. Request a new export.");
    await tx.platformAuditEvent.create({ data: { actorUserId: actor.actorUserId, action: "report.export.download", entityType: "ReportExport", entityId: row.id, afterData: { byteCount: row.byteCount } } });
    return { csv: content.csv, filename: `jump-report-${row.fromDay.toISOString().slice(0, 10)}-${row.throughDay.toISOString().slice(0, 10)}.csv` };
  });
}
