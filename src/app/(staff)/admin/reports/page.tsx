import { AdminReportTabs, reportView } from "@/components/AdminReportTabs";
import { adminQuery } from "@/lib/admin-navigation";
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
export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ from?: string | string[]; through?: string | string[]; days?: string | string[]; view?: string }> }) {
  const { user } = await requirePlatformAdmin("reports.read");
  const query = await searchParams, now = new Date();
  const view = reportView(query.view);
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
    <header className="page-header"><h1>Reports</h1><nav className="page-actions" aria-label="Report tools"><Link href={adminQuery("/admin/reports/history", { from: range.fromDay, through: range.throughDay })} prefetch={false}>Saved daily reports</Link><Link href={adminQuery("/admin/reports/exports", { from: range.fromDay, through: range.throughDay })} prefetch={false}>Your exports</Link></nav></header>
    <section className="admin-report-toolbar">
      <form data-live-filter="false" key={`${range.fromDay}:${range.throughDay}`} method="get" action="/admin/reports" className={styles.filters}>
        <input name="view" type="hidden" value={view} /><label className="field"><span>From (UTC)</span><input name="from" type="date" defaultValue={range.fromDay} max={now.toISOString().slice(0, 10)} required /></label>
        <label className="field"><span>Through (UTC)</span><input name="through" type="date" defaultValue={range.throughDay} max={now.toISOString().slice(0, 10)} required /></label>
        <button className="button primary" type="submit">Update report</button>
      </form>
      <nav className="page-actions" aria-label="Report date presets">{[7, 30, 90].map(days => <Link key={days} href={adminQuery("/admin/reports", { days, view })} prefetch={false}>{days} days</Link>)}</nav>
      {report && <details className="admin-report-export"><summary>Export CSV</summary><form action={requestReportExportAction} className="form-stack"><p>Aggregate data. Download within 24 hours in this sign-in.</p>
        <input type="hidden" name="from" value={range.fromDay} /><input type="hidden" name="through" value={range.throughDay} /><input type="hidden" name="requestKey" value={randomUUID()} />
        <FormSubmitButton label="Prepare CSV export" pendingLabel="Requesting export…" />
      </form></details>}
    </section>
    {error && <Notice type="error">{error}</Notice>}
    {report && <><p className="admin-secondary-note">Observed {range.asOf.toISOString().slice(0, 16).replace("T", " ")} UTC · Today is partial · Max 366 days, end date included</p><AdminReportTabs path="/admin/reports" view={view} params={{ from: range.fromDay, through: range.throughDay }} /><AdminReportView report={report} limits={reportEmailLimits()} view={view} /></>}
  </div>;
}
