import Link from "next/link";
import { randomUUID } from "node:crypto";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { requestReportExportAction } from "@/lib/report-actions";
import { Notice } from "@/components/Notice";
import { AdminReportView } from "@/components/AdminReportView";
import styles from "@/components/AdminReports.module.css";
import { requirePlatformAdmin } from "@/lib/auth";
import { readAdminReport, reportEmailLimits, type ReportData } from "@/lib/admin-report-data";
import { parseReportRange, ReportError } from "@/lib/admin-report-range";
import { consumeRateLimit } from "@/lib/rate-limit";

export const metadata = { title: "Admin · Reports" };
export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ from?: string | string[]; through?: string | string[]; days?: string | string[] }> }) {
  const { user } = await requirePlatformAdmin("reports.read");
  const query = await searchParams, now = new Date();
  let range = parseReportRange({}, now), report: ReportData | undefined, error: string | undefined;
  try {
    range = parseReportRange(query, now);
    if (!(await consumeRateLimit({ scope: "admin.reports", identifiers: [user.id], limit: 30, windowMs: 5 * 60_000 })).allowed) throw new ReportError("Too many report refreshes. Please try again in five minutes.");
    report = await readAdminReport(range);
  } catch (cause) {
    error = cause instanceof ReportError ? cause.message : "The report could not be loaded. Please retry with a shorter date range or ask the application operator to check the database.";
    if (!(cause instanceof ReportError)) console.error("Aggregate administration report query failed.");
  }
  return <div className={`page ${styles.page}`}>
    <header className="page-header"><div><h1>Reports</h1><p>See who joins, who follows through, and what needs attention.</p></div></header>
    <section className="card form-stack"><h2>Report dates</h2>
      <form key={`${range.fromDay}:${range.throughDay}`} method="get" action="/admin/reports" className={styles.filters}>
        <label className="field"><span>From (UTC)</span><input name="from" type="date" defaultValue={range.fromDay} max={now.toISOString().slice(0, 10)} required /></label>
        <label className="field"><span>Through (UTC)</span><input name="through" type="date" defaultValue={range.throughDay} max={now.toISOString().slice(0, 10)} required /></label>
        <button className="button primary" type="submit">Update report</button>
      </form>
      <nav className="page-actions" aria-label="Report date presets">{[7, 30, 90].map(days => <Link key={days} href={`/admin/reports?days=${days}`} prefetch={false}>Last {days} days</Link>)}</nav>
      <p>Choose up to 366 days. End date is included. Today’s totals are partial.</p>
    </section>
    {error && <Notice type="error">{error}</Notice>}
    <nav className="page-actions" aria-label="Report tools"><Link href="/admin/reports/exports" prefetch={false}>Your exports</Link><Link href="/admin/reports/history" prefetch={false}>Saved daily reports</Link></nav>
    {report && <><p>Range: {range.fromDay} through {range.throughDay} UTC. Observed at {range.asOf.toISOString().slice(0, 19).replace("T", " ")} UTC.</p>
      <form action={requestReportExportAction} className="card form-stack"><h2>Export this date range</h2><p>Prepare an aggregate CSV in the background. It uses the data available when prepared and stays available for up to 24 hours in this sign-in.</p>
        <input type="hidden" name="from" value={range.fromDay} /><input type="hidden" name="through" value={range.throughDay} /><input type="hidden" name="requestKey" value={randomUUID()} />
        <FormSubmitButton label="Prepare CSV export" pendingLabel="Requesting export…" />
      </form><AdminReportView report={report} limits={reportEmailLimits()} /></>}
  </div>;
}
