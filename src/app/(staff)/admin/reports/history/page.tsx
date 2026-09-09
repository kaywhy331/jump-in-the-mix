import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportDefinitionKey } from "@/lib/report-storage-policy";
import { parseReportRange, ReportError } from "@/lib/admin-report-range";
import { Notice } from "@/components/Notice";
import styles from "@/components/AdminReports.module.css";

export const metadata = { title: "Admin · Saved daily reports" };
export default async function ReportHistoryPage({ searchParams }: { searchParams: Promise<{ from?: string; through?: string; days?: string; page?: string }> }) {
  await requirePlatformAdmin("reports.read");
  const query = await searchParams;
  let range, definitionKey;
  try { range = parseReportRange(query); definitionKey = reportDefinitionKey(); }
  catch (error) { return <div className="page"><h1>Saved daily reports</h1><Notice type="error">{error instanceof ReportError ? error.message : "Daily reports are unavailable."}</Notice><Link href="/admin/reports/history">Reset dates</Link></div>; }
  const page = Math.max(1, Math.min(14, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1));
  const [rows, storage] = await Promise.all([prisma.$queryRaw<Array<{ id: string; day: Date; observedAt: Date | null; status: string; accounts: number | null; active: number | null; completed: number | null; emailAttempts: number | null; databaseBytes: number | null }>>(Prisma.sql`
    SELECT id,day,"observedAt",status,(payload->'daily'->0->>'accounts')::int AS accounts,(payload->'daily'->0->>'active')::int AS active,
      (payload->'daily'->0->>'completed')::int AS completed,(payload->'daily'->0->>'emailAttempts')::int AS "emailAttempts",
      (payload->'operations'->>'databaseBytes')::bigint::float8 AS "databaseBytes"
    FROM "ReportDailySnapshot" WHERE "definitionKey"=${definitionKey} AND day>=${range.fromDay}::date AND day<=${range.throughDay}::date
    ORDER BY day DESC LIMIT 31 OFFSET ${(page - 1) * 30}`),
    prisma.reportStorageObservation.findMany({ where: { day: { gte: range.from, lt: range.until } }, orderBy: { day: "desc" }, take: 31, skip: (page - 1) * 30 })]);
  const params = `from=${range.fromDay}&through=${range.throughDay}`;
  return <div className="page"><header className="page-header"><div><h1>Saved daily reports</h1><p>Daily totals and storage observations kept by the worker.</p></div></header>
    <nav className="page-actions" aria-label="Report navigation"><Link href="/admin/reports">Live reports</Link><Link href="/admin/reports/exports">Your exports</Link><a href={`/admin/reports/history?${params}&page=${page}`}>Refresh status</a></nav>
    <section className="card form-stack"><h2>History dates</h2><form method="get" className={styles.filters}>
      <label className="field"><span>From (UTC)</span><input type="date" name="from" defaultValue={range.fromDay} required /></label><label className="field"><span>Through (UTC)</span><input type="date" name="through" defaultValue={range.throughDay} required /></label><button className="button" type="submit">Update history</button>
    </form><p>History is retained for 400 days; each view covers up to 366 days. The latest seven activity days are recalculated daily. Existing cohorts are refreshed again after their complete D7 and D30 windows. Observation time shows when the counts and whole-database size were measured.</p>
    <p>Activity reports use the current metric definition and configured test exclusions. Missing days are not zero-activity days. The separate database-size series keeps the first actual measurement each UTC day, includes all data, and survives recalculation of activity reports.</p></section>
    <section className="card form-stack"><h2>Database size history</h2><p>Measured dates within the selected range. These observations are retained independently of activity cohorts.</p>
      {storage.length ? <div className={styles.scroll} role="region" aria-label="Database size observations" tabIndex={0}><table className={styles.table}><caption>First storage measurement per UTC day</caption><thead><tr><th scope="col">Day</th><th scope="col">Measured at (UTC)</th><th scope="col">Database MiB</th></tr></thead><tbody>{storage.slice(0, 30).map(row => <tr key={row.day.toISOString()}><th scope="row">{row.day.toISOString().slice(0, 10)}</th><td>{row.observedAt.toISOString().slice(0, 19).replace("T", " ")}</td><td>{Math.round(Number(row.databaseBytes) / 1024 / 1024 * 10) / 10}</td></tr>)}</tbody></table></div> : <p>No storage measurements were recorded in this date range.</p>}
    </section>
    {rows.length ? <section className="card"><h2>Daily activity reports</h2><div className={styles.scroll} role="region" aria-label="Saved daily observations" tabIndex={0}><table className={styles.table}><caption>UTC activity dates and observed values</caption><thead><tr>{["Activity day", "Status", "Observed at (UTC)", "New accounts", "Active members", "Completed", "Email attempts", "Database MiB"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.slice(0, 30).map(row => <tr key={row.id}>
      <th scope="row">{row.status === "READY" ? <Link href={`/admin/reports/history/${row.id}`} prefetch={false}>{row.day.toISOString().slice(0, 10)}</Link> : row.day.toISOString().slice(0, 10)}</th><td>{row.status}</td><td>{row.observedAt?.toISOString().slice(0, 19).replace("T", " ") ?? "—"}</td><td>{row.accounts ?? "—"}</td><td>{row.active ?? "—"}</td><td>{row.completed ?? "—"}</td><td>{row.emailAttempts ?? "—"}</td><td>{row.databaseBytes === null ? "—" : Math.round(row.databaseBytes / 1024 / 1024 * 10) / 10}</td>
    </tr>)}</tbody></table></div></section> : <Notice type="info">No saved daily reports in this range. They appear after the worker prepares them.</Notice>}
    <nav className="page-actions" aria-label="History pages">{page > 1 && <Link href={`?${params}&page=${page - 1}`}>Newer observations</Link>}{(rows.length > 30 || storage.length > 30) && <Link href={`?${params}&page=${page + 1}`}>Older observations</Link>}</nav>
  </div>;
}
