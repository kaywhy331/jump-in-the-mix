import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { operationsPolicy } from "@/lib/operations-policy";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Admin · Overview" };

type AttentionItem = { title: string; detail: string; href: string; count?: number };

export default async function AdminPage() {
  const { user, permissions } = await requirePlatformAdmin("dashboard.read");
  const canOperate = permissions.includes("operations.read");
  const canSupport = permissions.includes("support.manage");
  const canEdit = permissions.includes("mixes.edit");
  const canWaitlist = permissions.includes("waitlist.read");
  const now = new Date();
  const [users, waiting, completed, failedJobs, tickets, alerts, monitor, hiddenMixes, schedule, display] = await Promise.all([
    prisma.user.count(),
    prisma.waitlistEntry.count({ where: { status: "WAITING", verifiedAt: { not: null } } }),
    prisma.jump.count({ where: { status: "DONE", completedAt: { gte: new Date(now.getTime() - 7 * 86400_000) } } }),
    canOperate ? prisma.job.count({ where: { failedAt: { not: null } } }) : 0,
    canSupport ? prisma.supportTicket.count({ where: { status: { in: ["OPEN", "WAITING_ON_SUPPORT"] } } }) : 0,
    canOperate ? prisma.operationsCheck.count({ where: { state: { not: "OK" } } }) : 0,
    canOperate ? prisma.operationsMonitor.findUnique({ where: { id: "primary" }, select: { observedAt: true, lastError: true } }) : null,
    canEdit ? prisma.sharedMix.count({ where: { status: "UNPUBLISHED" } }) : 0,
    canWaitlist ? prisma.waitlistSchedule.findUnique({ where: { id: "default" }, select: { nextRunAt: true, paused: true } }) : null,
    displayPreferencesForUser(user.id)
  ]);
  const monitorStale = canOperate && (!monitor?.observedAt || Boolean(monitor.lastError)
    || now.getTime() - monitor.observedAt.getTime() > operationsPolicy().monitorStaleSeconds * 1000);
  const attention: AttentionItem[] = [];
  if (monitorStale || alerts > 0) attention.push({ title: monitorStale ? "Monitoring needs a check" : "Review operational alerts", detail: monitorStale ? "Current health has not been confirmed. Open monitoring to review it." : "Open the checks that need follow-up.", href: "/admin/operations/alerts", ...(alerts > 0 ? { count: alerts } : {}) });
  if (failedJobs > 0) attention.push({ title: "Background work needs attention", detail: "Review failed jobs and retry eligible work.", href: "/admin/operations?status=failed", count: failedJobs });
  if (tickets > 0) attention.push({ title: "Support is waiting on a reply", detail: "Review new conversations and requests waiting on your team.", href: "/admin/support?status=attention", count: tickets });
  const actions = [
    { permission: "mixes.edit", href: "/admin/templates/new", label: "Create a library draft", detail: "Prepare content for customers.", icon: "edit" as const },
    { permission: "waitlist.read", href: "/admin/waitlist", label: "Review the waitlist", detail: "Manage the next customer invitations.", icon: "people" as const },
    { permission: "users.read", href: "/admin/users", label: "Find an account", detail: "Look up an account or its access.", icon: "contacts" as const },
    { permission: "reports.read", href: "/admin/reports", label: "Explore reports", detail: "Dig into activity and adoption.", icon: "calendar" as const }
  ].filter(action => permissions.some(permission => permission === action.permission));

  return <div className="page admin-overview-page">
    <header className="page-header"><div><h1>Admin · Overview</h1><p>The essentials, with a clear next step.</p></div><span className="admin-updated">Updated {formatDateTime(now, display)}</span></header>
    <section className="admin-pulse" aria-label="Aggregate activity">
      {[{ label: "Accounts", value: users, note: "Total registered accounts" }, { label: "Follow-ups completed", value: completed, note: "Last 7 days" }, { label: "Confirmed waiting", value: waiting, note: "Verified people on the waitlist" }].map(metric => <div className="admin-pulse-item" key={metric.label}><span>{metric.label}</span><strong>{metric.value.toLocaleString("en-US")}</strong><small>{metric.note}</small></div>)}
    </section>
    <div className="admin-overview-columns">
      <section className="admin-panel" aria-labelledby="admin-attention-title">
        <header className="admin-panel-heading"><div><h2 id="admin-attention-title">Needs attention</h2><p>Priorities for the areas you manage.</p></div><span className="admin-count">{attention.length} {attention.length === 1 ? "area" : "areas"}</span></header>
        {attention.length ? <ul className="admin-action-list">{attention.map(item => <li key={item.href}><Link href={item.href}><span className="admin-action-icon"><AppIcon name="alert" /></span><span className="admin-action-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>{item.count !== undefined && <span className="admin-count">{item.count.toLocaleString("en-US")}</span>}<span aria-hidden="true">→</span></Link></li>)}</ul> : <div className="admin-calm-state"><AppIcon name="check" /><h3>No outstanding items in your queues</h3><p>You can continue with your day-to-day work below.</p></div>}
        {canOperate && !monitorStale && <p className="admin-panel-footnote">Monitoring checked {formatDateTime(monitor!.observedAt!, display)}.</p>}
      </section>
      {actions.length > 0 && <section className="admin-panel" aria-labelledby="admin-actions-title"><header className="admin-panel-heading"><h2 id="admin-actions-title">Quick actions</h2></header><ul className="admin-action-list">{actions.map(action => <li key={action.href}><Link href={action.href}><span className="admin-action-icon"><AppIcon name={action.icon} /></span><span className="admin-action-copy"><strong>{action.label}</strong><small>{action.detail}</small></span><span aria-hidden="true">→</span></Link></li>)}</ul></section>}
    </div>
    {(canEdit || canWaitlist) && <section className="admin-next-work" aria-label="Continue your work">
      {canEdit && <Link href="/admin/templates" className="admin-panel admin-work-link"><AppIcon name="mixes" /><span><strong>Content library</strong><small>{hiddenMixes > 0 ? `${hiddenMixes} drafts or hidden mixes · Review and organize content` : "Review and organize your ready-made mixes"}</small></span><span aria-hidden="true">→</span></Link>}
      {canWaitlist && <Link href="/admin/waitlist" className="admin-panel admin-work-link"><AppIcon name="people" /><span><strong>Customer invitations</strong><small>{schedule ? schedule.paused ? "Automatic waitlist waves are paused" : `Next wave: ${formatDateTime(schedule.nextRunAt, display)}` : "Automatic waitlist waves are not scheduled yet"}</small></span><span aria-hidden="true">→</span></Link>}
    </section>}
  </div>;
}
