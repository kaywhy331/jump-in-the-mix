import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { AdminNav } from "@/components/AdminNav";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Overview" };

function timestamp(value: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function AdminPage() {
  await requirePlatformAdmin();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    totalUsers,
    totalWorkspaces,
    newUsers,
    planDistribution,
    activeContacts,
    activeMixes,
    incompleteJumps,
    completedJumps,
    ticketsWaiting,
    pendingTemplates,
    failedJobs,
    failedWebhooks,
    integrationErrors,
    recentAudits
  ] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.workspace.groupBy({ by: ["planTier"], _count: { _all: true } }),
    prisma.contact.count({ where: { archivedAt: null } }),
    prisma.mix.count({ where: { status: "ACTIVE" } }),
    prisma.jump.count({ where: { status: "PENDING" } }),
    prisma.jump.count({ where: { status: "DONE", completedAt: { gte: weekAgo } } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "WAITING_ON_SUPPORT"] } } }),
    prisma.sharedMixMetadata.count({ where: { reviewState: "PENDING" } }),
    prisma.job.count({ where: { failedAt: { not: null } } }),
    prisma.webhookEvent.count({ where: { status: "FAILED" } }),
    prisma.integrationConnection.count({ where: { status: "ERROR" } }),
    prisma.auditLog.findMany({
      include: { workspace: { select: { name: true } }, actorUser: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);
  const planCount = new Map(planDistribution.map((row) => [row.planTier, row._count._all]));
  const operationalIssues = failedJobs + failedWebhooks + integrationErrors;

  return (
    <div className="page admin-control-page">
      <header className="page-header">
        <div><h1>Admin · Overview</h1><p>One operational view of customers, engagement, support, billing dependencies, and background processing.</p></div>
      </header>
      <AdminNav current="/admin" />

      <section className="admin-metric-grid admin-overview-metrics">
        <Link className="card admin-metric-card" href="/admin/users"><span>Users</span><strong>{totalUsers}</strong><small>{newUsers} joined in the last 7 days.</small></Link>
        <Link className="card admin-metric-card" href="/admin/billing"><span>Workspaces</span><strong>{totalWorkspaces}</strong><small>{planCount.get("FREE") ?? 0} Free · {planCount.get("PLUS") ?? 0} Plus · {planCount.get("PRO") ?? 0} Pro</small></Link>
        <div className="card admin-metric-card"><span>Active Contacts</span><strong>{activeContacts}</strong><small>Across all non-archived customer records.</small></div>
        <div className="card admin-metric-card"><span>Active Mixes</span><strong>{activeMixes}</strong><small>Currently eligible for reconciliation.</small></div>
        <div className="card admin-metric-card"><span>Incomplete Jumps</span><strong>{incompleteJumps}</strong><small>Pending or copied customer work.</small></div>
        <div className="card admin-metric-card healthy"><span>Jumps completed</span><strong>{completedJumps}</strong><small>Done or sent in the last 7 days.</small></div>
        <Link className={`card admin-metric-card ${ticketsWaiting ? "attention" : "healthy"}`} href="/admin/support"><span>Support queue</span><strong>{ticketsWaiting}</strong><small>Open or waiting on Jump in the Mix.</small></Link>
        <Link className={`card admin-metric-card ${pendingTemplates ? "attention" : "healthy"}`} href="/admin/templates?status=PENDING"><span>Template review</span><strong>{pendingTemplates}</strong><small>Community contributions awaiting moderation.</small></Link>
        <Link className={`card admin-metric-card ${operationalIssues ? "critical" : "healthy"}`} href="/admin/operations"><span>Operational issues</span><strong>{operationalIssues}</strong><small>{failedJobs} jobs · {failedWebhooks} webhooks · {integrationErrors} connections</small></Link>
      </section>

      <section className="card admin-command-center">
        <div className="card-header"><div><h2>Control center</h2><p>Move directly to the area responsible for a customer or platform issue.</p></div></div>
        <div className="settings-hub-grid admin-command-grid">
          <Link className="settings-hub-card" href="/admin/users"><span className="settings-hub-icon">U</span><span><strong>Users and support views</strong><small>Search accounts and start audited view-only sessions.</small></span></Link>
          <Link className="settings-hub-card" href="/admin/billing"><span className="settings-hub-icon">$</span><span><strong>Billing</strong><small>Review subscriptions, payment state, and webhook diagnostics.</small></span></Link>
          <Link className="settings-hub-card" href="/admin/support"><span className="settings-hub-icon">?</span><span><strong>Support</strong><small>Reply, triage, resolve, and reopen customer conversations.</small></span></Link>
          <Link className="settings-hub-card" href="/admin/templates"><span className="settings-hub-icon">M</span><span><strong>Mix Templates</strong><small>Author platform content and moderate Community submissions.</small></span></Link>
          <Link className="settings-hub-card" href="/admin/operations"><span className="settings-hub-icon">O</span><span><strong>Operations</strong><small>Inspect jobs, syncs, integrations, and provider webhooks.</small></span></Link>
          <Link className="settings-hub-card" href="/admin/audit"><span className="settings-hub-icon">A</span><span><strong>Audit log</strong><small>Trace user, admin, AI, system, and webhook actions.</small></span></Link>
          <Link className="settings-hub-card" href="/admin/settings"><span className="settings-hub-icon"><AppIcon name="settings" /></span><span><strong>System Settings</strong><small>Manage dropdown options and reviewed feature flags without code.</small></span></Link>
        </div>
      </section>

      <section className="card admin-operation-section">
        <div className="card-header"><div><h2>Recent audited activity</h2><p>The latest security and product events across workspaces.</p></div><Link className="button" href="/admin/audit">Open full audit</Link></div>
        <div className="admin-operation-list">
          {recentAudits.map((log) => (
            <article className="admin-operation-row" key={log.id}>
              <div><strong>{log.action}</strong><span>{log.workspace.name} · {log.entityType}{log.entityId ? ` · ${log.entityId}` : ""}</span><small>{log.actorUser ? `${log.actorUser.name} · ${log.actorUser.email}` : log.actorType} · {log.source} · {timestamp(log.createdAt)}</small></div>
              <span className="status-pill">{log.actorType}</span>
            </article>
          ))}
          {!recentAudits.length && <p className="muted-copy">No audited activity has been recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}
