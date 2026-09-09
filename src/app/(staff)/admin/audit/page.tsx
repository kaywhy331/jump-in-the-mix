import { redactedAuditData } from "@/lib/audit-redaction";
import type { AuditActorType, Prisma } from "@/generated/prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Audit" };

type SearchParams = {
  q?: string;
  actor?: AuditActorType | "ALL";
  source?: string;
};

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(redactedAuditData(value), null, 2);
  } catch {
    return "Unable to display structured data.";
  }
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user } = await requirePlatformAdmin("audit.read");
  const displayPreferences = await displayPreferencesForUser(user.id);
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const actor = params.actor ?? "ALL";
  const source = params.source?.trim() ?? "";
  const where: Prisma.AuditLogWhereInput = {
    ...(actor !== "ALL" ? { actorType: actor } : {}),
    ...(source ? { source } : {}),
    ...(query ? {
      OR: [
        { action: { contains: query, mode: "insensitive" } },
        { entityType: { contains: query, mode: "insensitive" } },
        { entityId: { contains: query, mode: "insensitive" } },
        { source: { contains: query, mode: "insensitive" } },
        { workspace: { name: { contains: query, mode: "insensitive" } } },
        { actorUser: { email: { contains: query, mode: "insensitive" } } },
        { actorUser: { name: { contains: query, mode: "insensitive" } } }
      ]
    } : {})
  };

  const platformEvents = await prisma.platformAuditEvent.findMany({ where: query ? { OR: [{ action: { contains: query, mode: "insensitive" } }, { entityId: { contains: query, mode: "insensitive" } }] } : undefined, orderBy: { createdAt: "desc" }, take: 100 });
  const [logs, sourceRows] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { workspace: { select: { name: true } }, actorUser: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    prisma.auditLog.findMany({ distinct: ["source"], select: { source: true }, orderBy: { source: "asc" } })
  ]);

  return (
    <div className="page admin-control-page">
      <header className="page-header"><div><h1>Admin · Audit</h1><p>Review security-sensitive customer, administrator, and system actions.</p></div></header>

      <form className="filter-bar admin-audit-filters" method="get">
        <input name="q" defaultValue={query} placeholder="Search action, workspace, user, entity, or source" aria-label="Search audit log" />
        <select name="actor" defaultValue={actor} aria-label="Filter audit actor"><option value="ALL">All actors</option><option value="USER">User</option><option value="ADMIN">Admin</option><option value="SYSTEM">System</option></select>
        <select name="source" defaultValue={source} aria-label="Filter audit source"><option value="">All sources</option>{sourceRows.map((row) => <option key={row.source}>{row.source}</option>)}</select>
        <button className="button" type="submit">Filter</button>
        {(query || actor !== "ALL" || source) && <Link className="button" href="/admin/audit">Clear</Link>}
      </form>

      <section className="card admin-safety-card"><strong>Append-only operational view</strong><p>This page does not expose provider secrets or permit record mutation. Use the workspace, actor, source, and entity context to investigate an event.</p></section>

      <section className="card form-stack"><h2>Platform events</h2><p>Staff changes, denied permissions, MFA, and operations. The search applies to action and record ID; actor/source filters below apply to workspace events.</p>{platformEvents.map(event => <article key={event.id}><strong>{event.action} · {event.outcome}</strong><p>{event.entityType} · {event.entityId} · {formatDateTime(event.createdAt, displayPreferences)} · Actor {event.actorUserId ?? "system"}</p>{event.reason && <p>{event.reason}</p>}{(event.beforeData || event.afterData) && <details><summary>Changes</summary><pre>{jsonText({ before: event.beforeData, after: event.afterData })}</pre></details>}</article>)}</section>
      <div className="admin-audit-list">
        {logs.map((log) => (
          <article className="card admin-audit-card" key={log.id}>
            <div className="admin-audit-heading">
              <div><strong>{log.action}</strong><span>{log.entityType}{log.entityId ? ` · ${log.entityId}` : ""}</span></div>
              <span className="status-pill">{log.actorType}</span>
            </div>
            <div className="admin-audit-meta">
              <span>{log.workspace.name}</span>
              <span>{log.actorUser ? `${log.actorUser.name} · ${log.actorUser.email}` : "No user actor"}</span>
              <span>{log.source}</span>
              <time dateTime={log.createdAt.toISOString()}>{formatDateTime(log.createdAt, displayPreferences)}</time>
            </div>
            {(log.beforeData || log.afterData || log.metadata) && (
              <details className="admin-audit-details">
                <summary>Structured event details</summary>
                <div className="admin-audit-json-grid">
                  {log.beforeData && <div><h3>Before</h3><pre>{jsonText(log.beforeData)}</pre></div>}
                  {log.afterData && <div><h3>After</h3><pre>{jsonText(log.afterData)}</pre></div>}
                  {log.metadata && <div><h3>Metadata</h3><pre>{jsonText(log.metadata)}</pre></div>}
                </div>
              </details>
            )}
          </article>
        ))}
        {!logs.length && <div className="empty-state"><h2>No audit records matched</h2><p>Try broader search terms or clear one of the filters.</p></div>}
      </div>
    </div>
  );
}
