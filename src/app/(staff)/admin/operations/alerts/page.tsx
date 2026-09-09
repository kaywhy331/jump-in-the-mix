import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OPERATIONS_CHECKS, operationsPolicy, type OperationsCode } from "@/lib/operations-policy";
import { acknowledgeOperationsCheckAction } from "@/lib/operations-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { Notice } from "@/components/Notice";
import { FormSubmitButton } from "@/components/FormSubmitButton";

export const metadata: Metadata = { title: "Admin · Operational alerts" };
export default async function OperationsAlertsPage({ searchParams }: { searchParams: Promise<{ error?: string; acknowledged?: string }> }) {
  const { user, permissions } = await requirePlatformAdmin("operations.read");
  const params = await searchParams, preferences = await displayPreferencesForUser(user.id);
  const [monitor, checks, notices] = await Promise.all([
    prisma.operationsMonitor.findUnique({ where: { id: "primary" }, select: { observedAt: true, lastError: true } }),
    prisma.operationsCheck.findMany({ orderBy: { code: "asc" }, take: 30 }),
    prisma.operationsNotice.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, code: true, kind: true, state: true, status: true, attempts: true, observedAt: true, acceptedAt: true } })
  ]);
  const stale = !monitor?.observedAt || Boolean(monitor.lastError) || Date.now() - monitor.observedAt.getTime() > operationsPolicy().monitorStaleSeconds * 1000;
  return <div className="page" style={{ overflowWrap: "anywhere" }}>
    <header className="page-header"><div><h1>Operational alerts</h1><p>Review capacity, background work and recovery evidence.</p></div><Link className="button" href="/admin/operations">Background operations</Link></header>
    {params.error && <Notice type="error">{String(params.error).slice(0, 400)}</Notice>}
    {params.acknowledged && <Notice>The alert was acknowledged. Its problem stays open until a later check shows recovery.</Notice>}
    {stale ? <Notice type="error">Independent monitoring is missing, stale or incomplete. The saved checks below do not establish current health. Check the monitor process and its private state storage.</Notice> : <Notice type="info">Independent checks last completed {formatDateTime(monitor!.observedAt!, preferences)}.</Notice>}
    <section className="card form-stack"><h2>How alerts work</h2><p>Unknown means evidence or configuration is missing. Acknowledgment stops reminders for the current incident; a higher severity or a new incident needs another review. Recovery is recorded only after a successful check.</p><p>Notifications contain aggregate counts and statuses. Webhook acceptance does not prove an administrator read the alert. Delivery retries are bounded; review failed notifications below.</p></section>
    {checks.filter(row => Object.hasOwn(OPERATIONS_CHECKS, row.code)).map(row => {
      const definition = OPERATIONS_CHECKS[row.code as OperationsCode];
      return <section className="card form-stack" key={row.code}>
        <h2>{definition.title}</h2><p><strong>{row.state}</strong> · Incident {row.episode} · Observed {formatDateTime(row.observedAt, preferences)}</p><p>{definition.help}</p>
        <dl>{Object.entries(row.evidence as Record<string, number | null>).map(([key, value]) => <div key={key}><dt>{key.replaceAll(/([A-Z])/g, " $1").toLowerCase()}</dt><dd>{value === null ? "Not available" : Number(value.toFixed(2)).toLocaleString("en-US")}</dd></div>)}</dl>
        {row.acknowledgedAt && <p>Acknowledged {formatDateTime(row.acknowledgedAt, preferences)}. The underlying check remains {row.state.toLowerCase()}.</p>}
        {row.state !== "OK" && !row.acknowledgedAt && permissions.includes("operations.manage") && <form action={acknowledgeOperationsCheckAction} className="form-stack"><input type="hidden" name="code" value={row.code} /><input type="hidden" name="revision" value={row.revision} /><label className="field"><span>Reason for acknowledgment</span><input name="reason" minLength={10} maxLength={500} required /></label><FormSubmitButton label="Acknowledge alert" pendingLabel="Recording acknowledgment…" /></form>}
      </section>;
    })}
    {!checks.length && <section className="card"><p>No independent observations have been recorded. Configure the monitor before launch.</p></section>}
    <section className="card form-stack"><h2>Recent operational notifications</h2>{notices.map(notice => <article key={notice.id}><h3>{Object.hasOwn(OPERATIONS_CHECKS, notice.code) ? OPERATIONS_CHECKS[notice.code as OperationsCode].title : "Operational check"}</h3><p>{notice.kind} · {notice.state} · {notice.status} · {notice.attempts} attempts</p><p>Observed {formatDateTime(notice.observedAt, preferences)}{notice.acceptedAt ? ` · Endpoint accepted ${formatDateTime(notice.acceptedAt, preferences)}` : " · Endpoint acceptance not recorded"}</p><p>Event ID: {notice.id}</p></article>)}{!notices.length && <p>No operational notifications recorded.</p>}</section>
  </div>;
}
