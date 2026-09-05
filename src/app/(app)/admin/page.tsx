import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { AdminNav } from "@/components/AdminNav";
import { requirePlatformAdmin } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Overview" };

export default async function AdminPage() {
  const { user } = await requirePlatformAdmin();
  const displayPreferences = await displayPreferencesForUser(user.id);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    totalUsers,
    totalBusinesses,
    newUsers,
    activeContacts,
    activePlans,
    pendingFollowUps,
    completedFollowUps,
    ticketsWaiting,
    readyMadePlans,
    failedJobs,
    recentAudits
  ] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.contact.count({ where: { archivedAt: null } }),
    prisma.mix.count({ where: { status: "ACTIVE" } }),
    prisma.jump.count({ where: { status: "PENDING" } }),
    prisma.jump.count({ where: { status: "DONE", completedAt: { gte: weekAgo } } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "WAITING_ON_SUPPORT"] } } }),
    prisma.sharedMix.count({ where: { status: "APPROVED" } }),
    prisma.job.count({ where: { failedAt: { not: null } } }),
    prisma.auditLog.findMany({
      include: { workspace: { select: { name: true } }, actorUser: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  return (
    <div className="page admin-control-page">
      <header className="page-header">
        <div><h1>Admin · Overview</h1><p>Customer activity, support, curated content, and background processing in one place.</p></div>
      </header>
      <AdminNav current="/admin" />

      <section className="admin-metric-grid admin-overview-metrics">
        <Link className="card admin-metric-card" href="/admin/users"><span>Users</span><strong>{totalUsers}</strong><small>{newUsers} joined in the last 7 days.</small></Link>
        <Link className="card admin-metric-card" href="/admin/users"><span>Businesses</span><strong>{totalBusinesses}</strong><small>Active customer workspaces.</small></Link>
        <div className="card admin-metric-card"><span>Active contacts</span><strong>{activeContacts}</strong><small>Across all non-archived customer records.</small></div>
        <div className="card admin-metric-card"><span>Active plans</span><strong>{activePlans}</strong><small>Currently scheduling customer follow-ups.</small></div>
        <div className="card admin-metric-card"><span>Pending follow-ups</span><strong>{pendingFollowUps}</strong><small>Waiting for action.</small></div>
        <div className="card admin-metric-card healthy"><span>Completed follow-ups</span><strong>{completedFollowUps}</strong><small>Finished in the last 7 days.</small></div>
        <Link className={`card admin-metric-card ${ticketsWaiting ? "attention" : "healthy"}`} href="/admin/support"><span>Support queue</span><strong>{ticketsWaiting}</strong><small>Open or waiting on support.</small></Link>
        <Link className="card admin-metric-card" href="/admin/templates"><span>Ready-made plans</span><strong>{readyMadePlans}</strong><small>Published options in the customer library.</small></Link>
        <Link className={`card admin-metric-card ${failedJobs ? "critical" : "healthy"}`} href="/admin/operations"><span>Failed jobs</span><strong>{failedJobs}</strong><small>Background work that needs attention.</small></Link>
      </section>

      <section className="card admin-command-center">
        <div className="card-header"><div><h2>Control center</h2><p>Go directly to the area responsible for a customer or platform issue.</p></div></div>
        <div className="settings-hub-grid admin-command-grid">
          <Link className="settings-hub-card" href="/admin/users"><span className="settings-hub-icon">U</span><span><strong>Users and support views</strong><small>Search accounts and start audited view-only sessions.</small></span></Link>
          <Link className="settings-hub-card" href="/admin/support"><span className="settings-hub-icon">?</span><span><strong>Support</strong><small>Reply, triage, resolve, and reopen customer conversations.</small></span></Link>
          <Link className="settings-hub-card" href="/admin/templates"><span className="settings-hub-icon">P</span><span><strong>Ready-made plans</strong><small>Author and maintain the curated customer library.</small></span></Link>
          <Link className="settings-hub-card" href="/admin/operations"><span className="settings-hub-icon">O</span><span><strong>Operations</strong><small>Inspect jobs and worker health.</small></span></Link>
          <Link className="settings-hub-card" href="/admin/audit"><span className="settings-hub-icon">A</span><span><strong>Audit log</strong><small>Trace customer, administrator, and system actions.</small></span></Link>
          <Link className="settings-hub-card" href="/admin/settings"><span className="settings-hub-icon"><AppIcon name="settings" /></span><span><strong>System settings</strong><small>Manage reviewed plan-library options.</small></span></Link>
        </div>
      </section>

      <section className="card admin-operation-section">
        <div className="card-header"><div><h2>Recent audited activity</h2><p>The latest security and product events across businesses.</p></div><Link className="button" href="/admin/audit">Open full audit</Link></div>
        <div className="admin-operation-list">
          {recentAudits.map((log) => (
            <article className="admin-operation-row" key={log.id}>
              <div><strong>{log.action}</strong><span>{log.workspace.name} · {log.entityType}{log.entityId ? ` · ${log.entityId}` : ""}</span><small>{log.actorUser ? `${log.actorUser.name} · ${log.actorUser.email}` : log.actorType} · {log.source} · {formatDateTime(log.createdAt, displayPreferences)}</small></div>
              <span className="status-pill">{log.actorType}</span>
            </article>
          ))}
          {!recentAudits.length && <p className="muted-copy">No audited activity has been recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}
