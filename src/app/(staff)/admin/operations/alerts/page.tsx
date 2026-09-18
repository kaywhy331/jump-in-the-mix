import { AdminRefresh } from "@/components/AdminRefresh";
import { AdminDraftForm } from "@/components/AdminDraftForm";
import { activeAdminArea, adminQuery } from "@/lib/admin-navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OPERATIONS_CHECKS, operationsPolicy, severityRank, type OperationsCode } from "@/lib/operations-policy";
import { acknowledgeOperationsCheckAction } from "@/lib/operations-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { Notice } from "@/components/Notice";
import { FormSubmitButton } from "@/components/FormSubmitButton";

export const metadata: Metadata = { title: "Admin · Operational alerts" };
export default async function OperationsAlertsPage({ searchParams }: { searchParams: Promise<{ error?: string; acknowledged?: string; page?: string; view?: string }> }) {
  const { user, permissions } = await requirePlatformAdmin("operations.read");
  const params = await searchParams, preferences = await displayPreferencesForUser(user.id);
  const noticeCount = await prisma.operationsNotice.count();
  const noticePages = Math.max(1, Math.ceil(noticeCount / 30));
  const noticePage = Math.min(noticePages, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const [monitor, checks, notices] = await Promise.all([
    prisma.operationsMonitor.findUnique({ where: { id: "primary" }, select: { observedAt: true, lastError: true } }),
    prisma.operationsCheck.findMany({ orderBy: { code: "asc" }, take: 30 }),
    prisma.operationsNotice.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, skip: (noticePage - 1) * 30, select: { id: true, code: true, kind: true, state: true, status: true, attempts: true, observedAt: true, acceptedAt: true } })
  ]);
  const view = params.view === "acknowledged" || params.view === "all" ? params.view : "open";
  const visible = checks.filter(row => Object.hasOwn(OPERATIONS_CHECKS, row.code) && (view === "all" || row.state !== "OK" && (view === "acknowledged" ? Boolean(row.acknowledgedAt) : true))).sort((a, b) => severityRank(b.state) - severityRank(a.state) || Number(Boolean(a.acknowledgedAt)) - Number(Boolean(b.acknowledgedAt)) || a.code.localeCompare(b.code));
  const stale = !monitor?.observedAt || Boolean(monitor.lastError) || Date.now() - monitor.observedAt.getTime() > operationsPolicy().monitorStaleSeconds * 1000;
  return <div className="page" style={{ overflowWrap: "anywhere" }}>
    <header className="page-header"><div><h1>Operational alerts</h1></div><Link className="button" href="/admin/operations">Background operations</Link></header>
    {params.error && <Notice type="error">{String(params.error).slice(0, 400)}</Notice>}
    {params.acknowledged && <Notice>Alert acknowledged. It stays open until recovery is verified.</Notice>}
    {stale ? <Notice type="error">Monitoring is stale or incomplete. Check the monitor; saved results may be outdated.</Notice> : <Notice type="info">Independent checks last completed {formatDateTime(monitor!.observedAt!, preferences)}.</Notice>}
    <AdminRefresh observedAt={new Date().toISOString()} /><nav className="admin-content-tabs" aria-label="Alert views">{[["open", "Unresolved, including acknowledged"], ["acknowledged", "Acknowledged"], ["all", "All checks"]].map(([key,label]) => <Link key={key} href={adminQuery("/admin/operations/alerts", { view: key })} aria-current={view === key ? "page" : undefined}>{label}</Link>)}</nav>
    <details className="card form-stack"><summary>How alerts work</summary><p>Unknown means evidence or configuration is missing. Acknowledgment stops reminders for the current incident; a higher severity or a new incident needs another review. Recovery is recorded only after a successful check.</p><p>Notifications contain aggregate counts and statuses. Webhook acceptance does not prove an administrator read the alert. Delivery retries are bounded; review failed notifications below.</p></details>
    {visible.map(row => {
      const definition = OPERATIONS_CHECKS[row.code as OperationsCode];
      return <section className="card form-stack" key={row.code}>
        <h2>{definition.title}</h2><p><strong>{row.state}</strong> · Incident {row.episode} · Observed {formatDateTime(row.observedAt, preferences)}</p><p>{row.state === "OK" ? "This check is within its configured limits." : row.state === "UNKNOWN" ? "Current impact is unconfirmed because evidence is missing." : definition.impact}</p><p><strong>Next step:</strong> {definition.help}</p>
        {activeAdminArea(definition.href, permissions) && <Link className="button" href={definition.href}>Open related workflow</Link>}<details><summary>Evidence and observation</summary><dl>{Object.entries(row.evidence as Record<string, number | null>).map(([key, value]) => <div key={key}><dt>{key.replaceAll(/([A-Z])/g, " $1").toLowerCase()}</dt><dd>{value === null ? "Not available" : Number(value.toFixed(2)).toLocaleString("en-US")}</dd></div>)}</dl></details>
        {row.acknowledgedAt && <p>Acknowledged {formatDateTime(row.acknowledgedAt, preferences)}. The underlying check remains {row.state.toLowerCase()}.</p>}
        {row.state !== "OK" && !row.acknowledgedAt && permissions.includes("operations.manage") && <AdminDraftForm draftKey={`alert:${row.code}:${row.episode}`} fields={["reason"]} revision={row.revision} saved={params.acknowledged ? String(row.revision) : undefined} action={acknowledgeOperationsCheckAction}><input type="hidden" name="code" value={row.code} /><input name="returnTo" type="hidden" value={adminQuery("/admin/operations/alerts", { view })} /><label className="field"><span>Reason for acknowledgment</span><input name="reason" minLength={10} maxLength={500} required /></label><FormSubmitButton label="Acknowledge alert" pendingLabel="Recording acknowledgment…" /></AdminDraftForm>}
      </section>;
    })}
    {checks.length > 0 && !visible.length && <p role="status">No checks match this view. Acknowledged alerts remain open until recovery is observed.</p>}
    {!checks.length && <section className="card"><p>No independent observations have been recorded. Configure the monitor before launch.</p></section>}
    <details className="card form-stack" open={noticePage > 1}><summary>Operational notifications · {noticeCount} retained</summary><nav className="page-actions" aria-label="Notification history pages">{noticePage > 1 && <Link href={`/admin/operations/alerts?view=${view}&page=${noticePage - 1}`}>Older page back</Link>}<span>Page {noticePage} of {noticePages}</span>{noticePage < noticePages && <Link href={`/admin/operations/alerts?view=${view}&page=${noticePage + 1}`}>Older notifications</Link>}</nav>{notices.map(notice => <article key={notice.id}><h3>{Object.hasOwn(OPERATIONS_CHECKS, notice.code) ? OPERATIONS_CHECKS[notice.code as OperationsCode].title : "Operational check"}</h3><p>{notice.kind} · {notice.state} · {notice.status} · {notice.attempts} attempts</p><p>Observed {formatDateTime(notice.observedAt, preferences)}{notice.acceptedAt ? ` · Endpoint accepted ${formatDateTime(notice.acceptedAt, preferences)}` : " · Endpoint acceptance not recorded"}</p><p>Event ID: {notice.id}</p></article>)}{!notices.length && <p>No operational notifications recorded.</p>}</details>
  </div>;
}
