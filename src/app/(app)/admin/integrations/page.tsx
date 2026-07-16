import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { readGoogleConnectionMetadata } from "@/lib/google-contacts";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Integrations" };

type SearchParams = {
  q?: string;
  status?: string;
};

function statusClass(value: string): string {
  if (value === "ACTIVE") return "status-pill done";
  if (value === "ERROR" || value === "REVOKED") return "status-pill skipped";
  return "status-pill pending";
}

export default async function AdminIntegrationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params] = await Promise.all([searchParams, requirePlatformAdmin()]);
  const query = params.q?.trim() ?? "";
  const status = params.status?.trim().toUpperCase() ?? "";
  const allowedStatuses = ["PENDING", "ACTIVE", "ERROR", "REVOKED"];
  const connections = await prisma.integrationConnection.findMany({
    where: {
      provider: "GOOGLE_CONTACTS",
      ...(allowedStatuses.includes(status) ? { status: status as "PENDING" | "ACTIVE" | "ERROR" | "REVOKED" } : {}),
      ...(query ? {
        OR: [
          { workspace: { name: { contains: query, mode: "insensitive" } } },
          { workspace: { owner: { email: { contains: query, mode: "insensitive" } } } },
          { workspace: { owner: { name: { contains: query, mode: "insensitive" } } } }
        ]
      } : {})
    },
    include: {
      workspace: {
        include: { owner: true, _count: { select: { contacts: true } } }
      },
      syncRuns: { orderBy: { startedAt: "desc" }, take: 5 }
    },
    orderBy: [{ lastSyncAt: "desc" }, { createdAt: "desc" }],
    take: 100
  });

  const totals = {
    active: connections.filter((item) => item.status === "ACTIVE").length,
    error: connections.filter((item) => item.status === "ERROR").length,
    revoked: connections.filter((item) => item.status === "REVOKED").length,
    running: connections.flatMap((item) => item.syncRuns).filter((run) => ["QUEUED", "RUNNING"].includes(run.status)).length
  };

  return (
    <div className="page admin-users-page">
      <header className="page-header">
        <div><h1>Admin · Integrations</h1><p>Review sanitized Google connection state, sync history, errors, and scheduled work without exposing provider credentials.</p></div>
        <div className="page-actions"><Link className="button" href="/admin/users">Users</Link></div>
      </header>

      <div className="admin-metric-grid">
        <div className="card admin-metric-card"><strong>{totals.active}</strong><span>Active Google connections</span></div>
        <div className="card admin-metric-card"><strong>{totals.running}</strong><span>Queued or running</span></div>
        <div className="card admin-metric-card"><strong>{totals.error}</strong><span>Need attention</span></div>
        <div className="card admin-metric-card"><strong>{totals.revoked}</strong><span>Revoked</span></div>
      </div>

      <form className="filter-bar admin-user-search" method="get">
        <input name="q" defaultValue={query} placeholder="Search owner or workspace" aria-label="Search Google integrations" />
        <select name="status" defaultValue={allowedStatuses.includes(status) ? status : ""} aria-label="Filter Google connection status"><option value="">All statuses</option>{allowedStatuses.map((item) => <option key={item} value={item}>{item.toLowerCase()}</option>)}</select>
        <button className="button" type="submit">Filter</button>
        {(query || status) && <Link className="button" href="/admin/integrations">Clear</Link>}
      </form>

      <div className="admin-user-list">
        {connections.map((connection) => {
          const metadata = readGoogleConnectionMetadata(connection.metadata);
          return (
            <article className="card admin-user-card" key={connection.id}>
              <div className="admin-user-heading">
                <div><h2>{connection.workspace.name}</h2><p>{connection.workspace.owner.name} · {connection.workspace.owner.email}</p></div>
                <span className={statusClass(connection.status)}>{connection.status.toLowerCase()}</span>
              </div>
              <div className="admin-workspace-list">
                <section className="admin-workspace-row">
                  <div>
                    <strong>{metadata.accountName || metadata.accountEmail || "Google account"}</strong>
                    <span>{metadata.accountEmail || "Google email unavailable"} · {connection.workspace.planTier.toLowerCase()} · {connection.workspace._count.contacts} Contacts</span>
                    <small>Last sync {connection.lastSyncAt ? formatDateTime(connection.lastSyncAt) : "not yet"} · Next {connection.nextSyncAt ? formatDateTime(connection.nextSyncAt) : "not scheduled"}</small>
                  </div>
                </section>
                {connection.lastError && <div className="notice error">{connection.lastError}</div>}
                <div className="google-run-list">
                  {connection.syncRuns.length ? connection.syncRuns.map((run) => (
                    <article className="google-run-row" key={run.id}>
                      <span className={statusClass(run.status === "COMPLETED" ? "ACTIVE" : run.status === "FAILED" ? "ERROR" : "PENDING")}>{run.status.replaceAll("_", " ").toLowerCase()}</span>
                      <div><strong>{run.mode.toLowerCase()} · {formatDateTime(run.startedAt)}</strong><p>{run.createdCount} created · {run.updatedCount} updated · {run.skippedCount} skipped · {run.errorCount} failed</p>{run.errorSummary && <small>{run.errorSummary}</small>}</div>
                    </article>
                  )) : <p className="muted-copy">No sync history.</p>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!connections.length && <div className="empty-state"><h2>No Google connections found</h2><p>Try another owner, workspace, or status.</p></div>}
    </div>
  );
}
