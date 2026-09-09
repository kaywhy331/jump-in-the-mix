import Link from "next/link";
import { ADMIN_AREAS } from "@/lib/admin-permissions";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Admin · Overview" };

export default async function AdminPage() {
  const { permissions } = await requirePlatformAdmin("dashboard.read");
  const [users, waiting, grants, completed, failedJobs, tickets, worker, schedule, alerts] = await Promise.all([
    prisma.user.count(),
    prisma.waitlistEntry.count({ where: { status: "WAITING", verifiedAt: { not: null } } }),
    prisma.referralAccessInvite.count({ where: { acceptedAt: null, revokedAt: null } }),
    prisma.jump.count({ where: { status: "DONE", completedAt: { gte: new Date(Date.now() - 7 * 86400_000) } } }),
    prisma.job.count({ where: { failedAt: { not: null } } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "WAITING_ON_SUPPORT"] } } }),
    prisma.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }),
    prisma.waitlistSchedule.findUnique({ where: { id: "default" }, select: { nextRunAt: true, paused: true } }),
    permissions.includes("operations.read") ? prisma.operationsCheck.count({ where: { state: { not: "OK" } } }) : Promise.resolve(null)
  ]);
  return <div className="page admin-control-page">
    <header className="page-header"><div><h1>Admin · Overview</h1><p>See what needs attention, then open the area you manage.</p></div></header>
    <section className="admin-metric-grid admin-overview-metrics" aria-label="Aggregate activity">
      {[ ["Accounts", users], ["Confirmed waiting", waiting], ["Outstanding invitations", grants], ["Follow-ups completed this week", completed], ["Failed jobs", failedJobs], ["Open support conversations", tickets] ].map(([label, count]) => <div className="card admin-metric-card" key={label}><span>{label}</span><strong>{count}</strong></div>)}
    </section>
    {alerts !== null && <Link className="card admin-metric-card" href="/admin/operations/alerts"><span>Operational checks needing attention</span><strong>{alerts}</strong><small>Open alerts to verify monitoring freshness and missing evidence.</small></Link>}
    <section className="card form-stack"><h2>Next checks</h2><p>Last worker check-in: {worker ? `${worker.lastSeenAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : "No check-in yet"}.</p><p>{schedule ? schedule.paused ? "Weekly waitlist waves are paused." : `Next waitlist wave: ${schedule.nextRunAt.toISOString().slice(0, 16).replace("T", " ")} UTC.` : "The waitlist schedule starts when the configured worker runs."}</p></section>
    <section className="card"><h2>Your administration areas</h2><div className="settings-hub-grid admin-command-grid">
      {ADMIN_AREAS.filter(area => area.href !== "/admin" && permissions.includes(area.permission)).map(area => <Link className="settings-hub-card" key={area.href} href={area.href}>{area.label}</Link>)}
    </div></section>
  </div>;
}
