import { redactedAuditData } from "@/lib/audit-redaction";
import type { AuditActorType, Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { adminPage, adminQuery } from "@/lib/admin-navigation";
import { AdminPagination } from "@/components/AdminPagination";
import { adminAuditEntityHref, auditChangeSummary } from "@/lib/admin-audit-presentation";
export const metadata = { title: "Admin · Audit" };
type SearchParams = { q?: string; actor?: string; source?: string; scope?: string; page?: string; from?: string; through?: string };
function jsonText(value: unknown) { try { return JSON.stringify(redactedAuditData(value), null, 2); } catch { return "Unable to display structured data."; } }
function date(value?: string) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined; const parsed = new Date(`${value}T00:00:00Z`); return Number.isFinite(+parsed) && parsed.toISOString().slice(0,10) === value ? parsed : undefined; }
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user, permissions } = await requirePlatformAdmin("audit.read");
  const display = await displayPreferencesForUser(user.id), params = await searchParams;
  const q = params.q?.trim().slice(0, 254) ?? "", scope = params.scope === "workspace" ? "workspace" : "platform";
  const actor = ["USER", "ADMIN", "SYSTEM"].includes(params.actor ?? "") ? params.actor as AuditActorType : "ALL";
  const source = params.source?.slice(0,120) ?? "";
  const from = date(params.from), through = date(params.through);
  const invalidDates = Boolean(params.from && !from || params.through && !through || from && through && from > through);
  const createdAt = invalidDates ? { lt: new Date(0) } : { ...(from ? { gte: from } : {}), ...(through ? { lt: new Date(+through + 86400_000) } : {}) };
  const people = q ? await prisma.user.findMany({ where: { OR: [{ id: q }, { name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }, select: { id: true } }) : [];
  const platformWhere: Prisma.PlatformAuditEventWhereInput = { createdAt, ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { entityType: { contains: q, mode: "insensitive" } }, { entityId: { contains: q, mode: "insensitive" } }, { actorUserId: { in: people.map(person => person.id) } }] } : {}) };
  const workspaceWhere: Prisma.AuditLogWhereInput = { createdAt, ...(actor !== "ALL" ? { actorType: actor } : {}), ...(source ? { source } : {}), ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { entityType: { contains: q, mode: "insensitive" } }, { entityId: { contains: q, mode: "insensitive" } }, { source: { contains: q, mode: "insensitive" } }, { workspace: { name: { contains: q, mode: "insensitive" } } }, { actorUserId: { in: people.map(person => person.id) } }] } : {}) };
  const total = scope === "platform" ? await prisma.platformAuditEvent.count({ where: platformWhere }) : await prisma.auditLog.count({ where: workspaceWhere });
  const page = Math.min(adminPage(params.page), Math.max(1, Math.ceil(total / 50)));
  const [platform, workspace, sources] = await Promise.all([
    scope === "platform" ? prisma.platformAuditEvent.findMany({ where: platformWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, skip: (page - 1) * 50 }) : [],
    scope === "workspace" ? prisma.auditLog.findMany({ where: workspaceWhere, include: { workspace: { select: { name: true } }, actorUser: { select: { name: true, email: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, skip: (page - 1) * 50 }) : [],
    scope === "workspace" ? prisma.auditLog.findMany({ distinct: ["source"], select: { source: true }, orderBy: { source: "asc" } }) : []
  ]);
  const actors = await prisma.user.findMany({ where: { id: { in: platform.flatMap(row => row.actorUserId ? [row.actorUserId] : []) } }, select: { id: true, name: true, email: true } });
  const names = new Map(actors.map(person => [person.id, `${person.name} · ${person.email}`]));
  const href = (page: number) => adminQuery("/admin/audit", { scope, q, actor: scope === "workspace" ? actor : undefined, source: scope === "workspace" ? source : undefined, from: params.from, through: params.through, page });
  const records = [...platform.map(row => ({ ...row, actor: row.actorUserId ? names.get(row.actorUserId) ?? "Former staff member" : "System", context: row.outcome, metadata: null })), ...workspace.map(row => ({ ...row, actor: row.actorUser ? `${row.actorUser.name} · ${row.actorUser.email}` : row.actorType.toLowerCase(), context: `${row.workspace.name} · ${row.source}`, reason: null }))];
  return <div className="page admin-control-page"><header className="page-header"><div><h1>Admin · Audit</h1><p>Find a recorded change, its actor and related record. Sensitive structured fields remain redacted.</p></div></header>
    <nav className="admin-content-tabs" aria-label="Audit scope">{["platform", "workspace"].map(value => <Link key={value} href={adminQuery("/admin/audit", { scope: value, q, from: params.from, through: params.through })} aria-current={scope === value ? "page" : undefined}>{value === "platform" ? "Platform events" : "Workspace events"}</Link>)}</nav>
    <form className="filter-bar admin-audit-filters" method="get"><input type="hidden" name="scope" value={scope} /><input name="q" defaultValue={q} placeholder={scope === "platform" ? "Action, entity, actor name or email" : "Action, workspace, actor, entity or source"} aria-label="Search audit log" />
      {scope === "workspace" && <><select name="actor" defaultValue={actor} aria-label="Workspace actor type"><option value="ALL">All actor types</option><option value="USER">User</option><option value="ADMIN">Admin</option><option value="SYSTEM">System</option></select><select name="source" defaultValue={source} aria-label="Workspace event source"><option value="">All sources</option>{sources.map(row => <option key={row.source}>{row.source}</option>)}</select></>}
      <label className="field"><span>From (UTC)</span><input type="date" name="from" defaultValue={params.from ?? ""} /></label><label className="field"><span>Through (UTC)</span><input type="date" name="through" defaultValue={params.through ?? ""} /></label><button className="button" type="submit">Filter</button><Link className="button" href={adminQuery("/admin/audit", { scope })}>Clear</Link>
    </form>
    {invalidDates && <p className="notice error" role="alert">Choose valid dates, with the end on or after the start.</p>}
    <p className="admin-result-summary" role="status">{total} matching {scope} events. All visible filters apply to this series.</p>
    <div className="admin-audit-list">{records.map(row => { const entityHref = adminAuditEntityHref(row.entityType, row.entityId, permissions); const summary = auditChangeSummary(row.beforeData, row.afterData); return <article className="card admin-audit-card" key={row.id}><div className="admin-audit-heading"><strong>{row.action}</strong><time dateTime={row.createdAt.toISOString()}>{formatDateTime(row.createdAt, display)}</time></div><div className="admin-audit-meta"><span>{row.actor}</span><span>{row.context}</span>{entityHref ? <Link href={entityHref}>Open {row.entityType.replaceAll(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}</Link> : <span>{row.entityType}</span>}</div>{row.reason && <p>{row.reason}</p>}{summary && <p>{summary}</p>}<details className="admin-audit-details"><summary>Record details</summary><p>Event {row.id} · {row.entityType} {row.entityId}</p><pre className="admin-audit-data">{jsonText({ before: row.beforeData, after: row.afterData, metadata: row.metadata })}</pre></details></article>; })}</div>
    {!total && !invalidDates && <div className="empty-state"><h2>No {scope} events matched</h2><p>Broaden the search, dates or filters for this series.</p></div>}<AdminPagination page={page} total={total} pageSize={50} href={href} />
  </div>;
}
