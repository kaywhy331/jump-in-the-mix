import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { PLAN_LIMITS } from "@/lib/plans";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string; demo?: string }> }) {
  const { welcome, demo } = await searchParams;
  const { workspace, user } = await requireWorkspace();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [contacts, activeMixes, dueToday, completed, todayJumps, importantDates] = await Promise.all([
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } }),
    prisma.mix.count({ where: { workspaceId: workspace.id, status: "ACTIVE" } }),
    prisma.jump.count({ where: { workspaceId: workspace.id, scheduledAt: { gte: start, lt: end }, status: { in: ["PENDING", "COPIED"] } } }),
    prisma.jump.count({ where: { workspaceId: workspace.id, status: { in: ["DONE", "SENT"] } } }),
    prisma.jump.findMany({
      where: { workspaceId: workspace.id, scheduledAt: { gte: start, lt: end }, status: { in: ["PENDING", "COPIED"] } },
      include: { contact: true, stepVersion: { include: { stepTemplate: true } }, mix: true },
      orderBy: { scheduledAt: "asc" },
      take: 4
    }),
    prisma.jumpDate.count({ where: { workspaceId: workspace.id, isActive: true } })
  ]);

  const checklist = [
    [contacts > 0, "Add your first contact", "/contacts/new"],
    [importantDates > 0, "Add an Important Date", "/contacts"],
    [activeMixes > 0, "Activate a follow-up Mix", "/mixes"],
    [completed > 0, "Complete your first Jump", "/jumps"]
  ] as const;
  const doneCount = checklist.filter(([done]) => done).length;
  const progress = Math.round((doneCount / checklist.length) * 100);
  const mixBuilderHref = PLAN_LIMITS[workspace.planTier].aiWizard ? "/mixes/wizard" : "/mixes";

  return (
    <div className="page">
      {welcome && <Notice type="success">You&apos;re set up, {user.name.split(" ")[0]}. Start with one person or one follow-up—the rest can grow from there.</Notice>}
      {demo && <Notice type="info">You are in a safe local demo workspace. Try completing a Jump, opening a contact, or generating a Mix. Your changes stay on this computer.</Notice>}
      <header className="page-header">
        <div><h1>Good to see you, {user.name.split(" ")[0]}.</h1><p>Here is what deserves your attention today.</p></div>
        <div className="page-actions"><Link href="/contacts/new" className="button">Add a contact</Link><Link href={mixBuilderHref} className="button primary">Create a Mix</Link></div>
      </header>

      <section className="stats-grid" aria-label="Workspace overview">
        <article className="stat-card"><small>Due today</small><strong>{dueToday}</strong></article>
        <article className="stat-card"><small>Active contacts</small><strong>{contacts}</strong></article>
        <article className="stat-card"><small>Active Mixes</small><strong>{activeMixes}</strong></article>
        <article className="stat-card"><small>Completed Jumps</small><strong>{completed}</strong></article>
      </section>

      <div className="dashboard-grid">
        <section>
          <div className="card">
            <div className="card-header"><div><h2>Today&apos;s Jumps</h2><p>Small actions that keep important relationships moving.</p></div><Link href="/jumps" className="text-button">View all</Link></div>
            {todayJumps.length ? (
              <div className="jump-list">
                {todayJumps.map((jump) => (
                  <Link href="/jumps" className="jump-card" key={jump.id}>
                    <div><h3>{jump.contact.displayName}</h3><div className="jump-meta"><span>{jump.reason}</span><span>{jump.mix.name}</span><span>{formatDateTime(jump.scheduledAt)}</span></div></div>
                    <span className="channel-pill">{jump.stepVersion.stepTemplate.channel.replaceAll("_", " ")}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ minHeight: 240 }}><div className="empty-icon">✓</div><h2>Nothing is due right now</h2><p>Add a contact and an Important Date, or create a Mix to begin building your follow-up rhythm.</p><Link href="/contacts/new" className="button primary">Add someone</Link></div>
            )}
          </div>
        </section>

        <aside>
          <div className="card">
            <div className="card-header"><div><h2>Quick actions</h2><p>Start where the information already is.</p></div></div>
            <div className="quick-actions">
              <Link className="quick-action" href="/contacts/new"><span>Add one person</span><span>→</span></Link>
              <Link className="quick-action" href={mixBuilderHref}><span>Build a follow-up plan</span><span>→</span></Link>
              <Link className="quick-action" href="/settings"><span>Connect another source</span><span>→</span></Link>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div><h2>Your first-win checklist</h2><p>{progress}% complete</p></div></div>
            <div className="progress-track"><div className="progress-value" style={{ width: `${progress}%` }} /></div>
            <div className="checklist">
              {checklist.map(([done, label, href]) => <Link key={label} href={href} className={done ? "check-row done" : "check-row"}><span>{done ? "✓" : "○"}</span><span>{label}</span></Link>)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
