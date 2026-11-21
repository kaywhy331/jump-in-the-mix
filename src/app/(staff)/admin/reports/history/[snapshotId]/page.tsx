import { AdminReportTabs, reportView } from "@/components/AdminReportTabs";
import { adminAreaName, safeAdminReturnTo } from "@/lib/admin-navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportDefinitionKey } from "@/lib/report-storage-policy";
import { reportEmailLimits, type ReportData } from "@/lib/admin-report-data";
import { AdminReportView } from "@/components/AdminReportView";

/** The saved report's one name: its H1 and its document title (JITM-10 §2.22). */
const pageName = (day: Date) => `Saved daily report · ${day.toISOString().slice(0, 10)}`;
/** The saved report, read once per request behind the page's permission: the title and the page share it. Null unless it is complete. */
const readSnapshot = cache(async (snapshotId: string) => {
  await requirePlatformAdmin("reports.read");
  if (snapshotId.length > 100) return null;
  const row = await prisma.reportDailySnapshot.findFirst({ where: { id: snapshotId, definitionKey: reportDefinitionKey(), status: "READY" }, select: { day: true, payload: true, observedAt: true } });
  return row?.payload && row.observedAt ? { ...row, observedAt: row.observedAt } : null;
});
/** A missing report opens the staff not-found, and takes its title (JITM-10 §2.22). */
export async function generateMetadata({ params }: { params: Promise<{ snapshotId: string }> }): Promise<Metadata> {
  const row = await readSnapshot((await params).snapshotId);
  if (!row) notFound();
  return { title: pageName(row.day) };
}
export default async function SavedReportPage({ params, searchParams }: { params: Promise<{ snapshotId: string }>; searchParams: Promise<{ view?: string; returnTo?: string }> }) {
  const { snapshotId } = await params;
  const row = await readSnapshot(snapshotId);
  const query = await searchParams, view = reportView(query.view);
  const returnTo = safeAdminReturnTo(query.returnTo, "/admin/reports/history");
  if (!row) notFound();
  const report = row.payload as unknown as ReportData;
  return <div className="page"><header className="page-header"><div><h1>{pageName(row.day)}</h1><p>Observed at {row.observedAt.toISOString().slice(0, 19).replace("T", " ")} UTC. These values were saved at that time.</p></div></header>
    <p><Link href={returnTo}>Back to {adminAreaName("/admin/reports/history")}</Link> · <Link href={`/admin/reports?from=${row.day.toISOString().slice(0, 10)}&through=${row.day.toISOString().slice(0, 10)}`} prefetch={false}>Recalculate this day live</Link></p>
    <details className="admin-report-note"><summary>About this saved report</summary><p>Recent days and maturing cohorts may be recalculated by the daily worker. The screen previews up to 30 waves and 20 library versions from the saved report. Email ceilings shown below are the current configuration; saved usage belongs to the observation time.</p></details>
    <AdminReportTabs path={`/admin/reports/history/${snapshotId}`} view={view} params={{ returnTo }} />
    <AdminReportView report={{ ...report, waves: report.waves.slice(0, 30), library: report.library.slice(0, 20) }} limits={reportEmailLimits()} saved view={view} />
  </div>;
}
