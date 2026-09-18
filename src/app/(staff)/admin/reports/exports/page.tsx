import { AdminRefresh } from "@/components/AdminRefresh";
import { adminQuery } from "@/lib/admin-navigation";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Notice } from "@/components/Notice";

export const metadata = { title: "Admin · Report exports" };
export default async function ReportExportsPage({ searchParams }: { searchParams: Promise<{ error?: string; queued?: string; from?: string; through?: string }> }) {
  const { user, session, permissions } = await requirePlatformAdmin("reports.read");
  const query = await searchParams;
  const reports = await prisma.reportExport.findMany({ where: { actorUserId: user.id, actorSessionId: session.id, expiresAt: { gt: new Date() } },
    select: { id: true, fromDay: true, throughDay: true, status: true, generatedAt: true, expiresAt: true, byteCount: true, job: { select: { id: true, failedAt: true } } }, orderBy: { createdAt: "desc" }, take: 20 });
  const pending = reports.some(row => ["QUEUED", "RUNNING"].includes(row.status) && !row.job?.failedAt);
  const returnTo = adminQuery("/admin/reports", { from: query.from, through: query.through });
  return <div className="page"><header className="page-header"><div><h1>Report exports</h1><p>Downloads for this sign-in only. Expire after 24 hours.</p></div></header>
    <nav className="page-actions" aria-label="Report navigation"><Link href={returnTo}>Back to report range</Link><Link href="/admin/reports/history">Saved daily reports</Link></nav>
    <AdminRefresh poll={pending} observedAt={new Date().toISOString()} />
    {query.error && <Notice type="error">{String(query.error).slice(0, 400)}</Notice>}{query.queued && <Notice>The export is queued. This page checks progress while visible.</Notice>}
    <section className="card form-stack"><h2>Requests · {reports.length} of latest 20</h2><details><summary>Export limits</summary><p>Aggregate data only. Five requests per 24 hours; two pending at once. Exports include library and wave details, up to 512 KiB. Downloads expire on sign-out or loss of staff access.</p></details>
      <div className="admin-export-list" role="region" aria-label="Export requests" tabIndex={0}>{reports.length ? reports.map(row => <article className="admin-export-row" key={row.id}><h3>{row.fromDay.toISOString().slice(0, 10)} through {row.throughDay.toISOString().slice(0, 10)} UTC</h3>
        <p role="status">Status: {row.job?.failedAt && ["QUEUED", "RUNNING"].includes(row.status) ? "FAILED" : row.status}. Expires {row.expiresAt.toISOString().slice(0, 16).replace("T", " ")} UTC · about {Math.max(0, Math.ceil((row.expiresAt.getTime() - Date.now()) / 60000))} minutes remaining. Only this current sign-in can download it.</p>
        {row.status === "READY" ? <><p>Observed at {row.generatedAt?.toISOString().slice(0, 19).replace("T", " ")} UTC · {row.byteCount} bytes.</p><a className="button" href={`/api/admin/reports/exports/${row.id}`}>Download CSV</a></> : row.status === "FAILED" || row.job?.failedAt ? <div><p>Preparation failed.</p><Link href={adminQuery("/admin/reports", { from: row.fromDay.toISOString().slice(0,10), through: row.throughDay.toISOString().slice(0,10) })}>Review this range or choose fewer days</Link>{permissions.includes("operations.read") && row.job && <p><Link href={adminQuery("/admin/operations", { view: "jobs", status: "failed", jobId: row.job.id })}>Inspect this failed export job</Link></p>}</div> : row.status === "CANCELLED" ? <p>This request expired or its staff session lost access. Request a new export after verifying your sign-in.</p> : <p>Preparing in the background.</p>}
      </article>) : <p>No unexpired exports for this sign-in.</p>}</div>
    </section>
  </div>;
}
