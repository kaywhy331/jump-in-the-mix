import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Notice } from "@/components/Notice";

export const metadata = { title: "Admin · Report exports" };
export default async function ReportExportsPage({ searchParams }: { searchParams: Promise<{ error?: string; queued?: string }> }) {
  const { user, session } = await requirePlatformAdmin("reports.read");
  const query = await searchParams;
  const reports = await prisma.reportExport.findMany({ where: { actorUserId: user.id, actorSessionId: session.id, expiresAt: { gt: new Date() } },
    select: { id: true, fromDay: true, throughDay: true, status: true, generatedAt: true, expiresAt: true, byteCount: true, job: { select: { failedAt: true } } }, orderBy: { createdAt: "desc" }, take: 20 });
  return <div className="page"><header className="page-header"><div><h1>Report exports</h1><p>Your downloads for this sign-in. Signing out or losing staff access makes them unavailable.</p></div></header>
    <nav className="page-actions" aria-label="Report navigation"><Link href="/admin/reports">Reports</Link><a href="/admin/reports/exports">Refresh status</a><Link href="/admin/reports/history">Saved daily reports</Link></nav>
    {query.error && <Notice type="error">{String(query.error).slice(0, 400)}</Notice>}{query.queued && <Notice>The export is queued. Refresh status when it is ready.</Notice>}
    <section className="card form-stack"><h2>Available requests</h2><p>Exports are prepared in the background, expire 24 hours after requesting, and contain aggregate data only. Up to five new exports per administrator per 24 hours; two may be pending at once. The full export includes library and wave dimensions beyond the screen’s preview, within a 512 KiB file limit.</p>
      {reports.length ? reports.map(row => <article className="card form-stack" key={row.id}><h3>{row.fromDay.toISOString().slice(0, 10)} through {row.throughDay.toISOString().slice(0, 10)} UTC</h3>
        <p>Status: {row.job?.failedAt && ["QUEUED", "RUNNING"].includes(row.status) ? "FAILED" : row.status}. Expires {row.expiresAt.toISOString().slice(0, 16).replace("T", " ")} UTC.</p>
        {row.status === "READY" ? <><p>Observed at {row.generatedAt?.toISOString().slice(0, 19).replace("T", " ")} UTC · {row.byteCount} bytes.</p><a className="button" href={`/api/admin/reports/exports/${row.id}`}>Download CSV</a></> : row.status === "FAILED" || row.job?.failedAt ? <p>Preparation failed. Request a shorter date range, or ask an operator to inspect the failed report job.</p> : row.status === "CANCELLED" ? <p>This request expired or its staff session lost access. Request a new export after verifying your sign-in.</p> : <p>Customer jobs run first. Refresh status after the worker processes this request.</p>}
      </article>) : <p>No unexpired exports for this sign-in.</p>}
    </section>
  </div>;
}
