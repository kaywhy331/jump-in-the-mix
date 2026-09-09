import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportDefinitionKey } from "@/lib/report-storage-policy";
import { reportEmailLimits, type ReportData } from "@/lib/admin-report-data";
import { AdminReportView } from "@/components/AdminReportView";

export const metadata = { title: "Admin · Saved daily report" };
export default async function SavedReportPage({ params }: { params: Promise<{ snapshotId: string }> }) {
  await requirePlatformAdmin("reports.read");
  const { snapshotId } = await params;
  if (snapshotId.length > 100) notFound();
  const row = await prisma.reportDailySnapshot.findFirst({ where: { id: snapshotId, definitionKey: reportDefinitionKey(), status: "READY" }, select: { day: true, payload: true, observedAt: true } });
  if (!row?.payload || !row.observedAt) notFound();
  const report = row.payload as unknown as ReportData;
  return <div className="page"><header className="page-header"><div><h1>Saved daily report · {row.day.toISOString().slice(0, 10)}</h1><p>Observed at {row.observedAt.toISOString().slice(0, 19).replace("T", " ")} UTC. These values were saved at that time.</p></div></header>
    <p><Link href="/admin/reports/history">Back to saved reports</Link> · <Link href={`/admin/reports?from=${row.day.toISOString().slice(0, 10)}&through=${row.day.toISOString().slice(0, 10)}`} prefetch={false}>Recalculate this day live</Link></p>
    <p>Recent days and maturing cohorts may be recalculated by the daily worker. The screen previews up to 30 waves and 20 library versions from the saved report. Email ceilings shown below are the current configuration; saved usage belongs to the observation time.</p>
    <AdminReportView report={{ ...report, waves: report.waves.slice(0, 30), library: report.library.slice(0, 20) }} limits={reportEmailLimits()} saved />
  </div>;
}
