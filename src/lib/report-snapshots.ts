import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parseReportRange, REPORT_DAY_MS } from "@/lib/admin-report-range";
import { readAdminReport } from "@/lib/admin-report-data";
import { ownsReportLease, type ReportJobLease } from "@/lib/report-exports";
import { reportDefinitionKey, REPORT_SNAPSHOT_BYTES, REPORT_SNAPSHOT_TASK } from "@/lib/report-storage-policy";

// The latest seven days absorb late events; two older cohorts are refreshed
// once their full D7/D30 windows have elapsed. Each pass enqueues at most nine.
export async function queueDailyReports(now = new Date()) {
  const definitionKey = reportDefinitionKey();
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(814733, 5)`;
    const schedule = await tx.reportSchedule.findUnique({ where: { id: "daily" } });
    if (schedule?.definitionKey === definitionKey && schedule.nextRunAt > now) return 0;
    let queued = 0;
    for (const age of [1, 2, 3, 4, 5, 6, 7, 9, 32]) {
      const day = new Date(today.getTime() - age * REPORT_DAY_MS);
      const current = await tx.reportDailySnapshot.findUnique({ where: { day_definitionKey: { day, definitionKey } }, include: { job: true } });
      // Older refreshes require an existing cohort; installation does not invent old history.
      if (age > 7 && !current) continue;
      if (current?.observedAt && current.observedAt >= today || current?.job && !current.job.completedAt && !current.job.failedAt) continue;
      const snapshot = current ?? await tx.reportDailySnapshot.create({ data: { day, definitionKey } });
      const job = await tx.job.create({ data: { task: REPORT_SNAPSHOT_TASK, payload: { snapshotId: snapshot.id }, maxAttempts: 3 } });
      await tx.reportDailySnapshot.update({ where: { id: snapshot.id }, data: { jobId: job.id, status: "QUEUED" } }); queued++;
    }
    await tx.reportSchedule.upsert({ where: { id: "daily" }, create: { definitionKey, nextRunAt: new Date(today.getTime() + REPORT_DAY_MS + 10 * 60_000) }, update: { definitionKey, nextRunAt: new Date(today.getTime() + REPORT_DAY_MS + 10 * 60_000) } });
    return queued;
  });
}

export async function runReportSnapshot(id: string, lease: ReportJobLease) {
  const row = await prisma.$transaction(async tx => {
    if (!await ownsReportLease(tx, lease, REPORT_SNAPSHOT_TASK)) throw new Error("Daily report job lease is unavailable.");
    const current = await tx.reportDailySnapshot.findFirst({ where: { id, jobId: lease.jobId } });
    if (!current || current.status === "READY") return null;
    if (current.definitionKey !== reportDefinitionKey()) {
      await tx.reportDailySnapshot.update({ where: { id }, data: { status: "FAILED" } }); return null;
    }
    await tx.reportDailySnapshot.update({ where: { id }, data: { status: "RUNNING" } }); return current;
  });
  if (!row) return;
  try {
    const day = row.day.toISOString().slice(0, 10), range = parseReportRange({ from: day, through: day });
    const report = await readAdminReport(range, true);
    if (Buffer.byteLength(JSON.stringify(report), "utf8") > REPORT_SNAPSHOT_BYTES) throw new Error("Daily report is too large.");
    await prisma.$transaction(async tx => {
      if (!await ownsReportLease(tx, lease, REPORT_SNAPSHOT_TASK)) throw new Error("Daily report job lease was lost.");
      if (row.definitionKey !== reportDefinitionKey()) throw new Error("Report definition changed.");
      await tx.reportDailySnapshot.updateMany({ where: { id, jobId: lease.jobId, status: "RUNNING" }, data: { status: "READY", payload: report as unknown as Prisma.InputJsonValue, observedAt: range.asOf } });
      // Keep the first real size observation per UTC day. Recalculating activity
      // cohorts must not rewrite this independent storage-growth series.
      await tx.reportStorageObservation.createMany({ data: [{ day: new Date(`${range.asOf.toISOString().slice(0, 10)}T00:00:00Z`), observedAt: range.asOf, databaseBytes: BigInt(report.operations.databaseBytes) }], skipDuplicates: true });
    });
  } catch { throw new Error("Daily report could not be prepared; the worker will retry."); }
}

export async function markReportJobFailed(jobId: string) {
  // The worker calls this only after recording its own terminal failure. A
  // concurrent operator retry clears failedAt and cannot be overwritten here.
  await prisma.$transaction([
    prisma.reportExport.updateMany({ where: { jobId, status: { in: ["QUEUED", "RUNNING"] }, job: { failedAt: { not: null } } }, data: { status: "FAILED", contentCiphertext: null } }),
    prisma.reportDailySnapshot.updateMany({ where: { jobId, status: { in: ["QUEUED", "RUNNING"] }, job: { failedAt: { not: null } } }, data: { status: "FAILED" } })
  ]);
}
