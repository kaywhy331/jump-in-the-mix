import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Users" };

type SearchParams = {
  q?: string;
  error?: string;
  impersonationEnded?: string;
};

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { user: adminUser }] = await Promise.all([searchParams, requirePlatformAdmin()]);
  const query = params.q?.trim() ?? "";
  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { memberships: { some: { workspace: { name: { contains: query, mode: "insensitive" } } } } }
          ]
        }
      : undefined,
    include: {
      memberships: {
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              planTier: true,
              subscriptionStatus: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
              _count: { select: { contacts: true, mixes: true, jumps: true } }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <div className="page admin-users-page">
      <header className="page-header">
        <div>
          <h1>Admin · Users</h1>
          <p>Find an account and open a time-limited, fully audited, view-only support session.</p>
        </div>
        <div className="page-actions">
          <Link className="button" href="/admin/support">Support</Link>
          <Link className="button" href="/admin/billing">Billing</Link>
          <Link className="button" href="/admin/templates">Mix Templates</Link>
          <Link className="button" href="/admin/integrations">Integrations</Link>
        </div>
      </header>

      {params.error && <Notice type="error">{params.error}</Notice>}
      {params.impersonationEnded && <Notice type="success">The view-only support session has ended.</Notice>}

      <section className="card admin-safety-card">
        <strong>View-only by design</strong>
        <p>Impersonation lasts 30 minutes by default. All browser mutations are blocked, the target workspace is recorded, and start/end events are written to the audit log.</p>
      </section>

      <form className="filter-bar admin-user-search" method="get">
        <input name="q" defaultValue={query} placeholder="Search name, email, or workspace" aria-label="Search users" />
        <button className="button" type="submit">Search</button>
        {query && <a className="button" href="/admin/users">Clear</a>}
      </form>

      <div className="admin-user-list">
        {users.map((user) => (
          <article className="card admin-user-card" key={user.id}>
            <div className="admin-user-heading">
              <div>
                <h2>{user.name}</h2>
                <p>{user.email}</p>
              </div>
              <div className="admin-user-badges">
                {user.isPlatformAdmin && <span className="status-pill">Platform admin</span>}
                <span className={user.emailVerifiedAt ? "status-pill done" : "status-pill"}>{user.emailVerifiedAt ? "Verified" : "Unverified"}</span>
              </div>
            </div>
            <small>Joined {formatDate(user.createdAt)}</small>

            {!user.memberships.length ? (
              <div className="notice info">No workspace membership is attached to this account.</div>
            ) : (
              <div className="admin-workspace-list">
                {user.memberships.map(({ workspace, role }) => (
                  <section className="admin-workspace-row" key={workspace.id}>
                    <div>
                      <strong>{workspace.name}</strong>
                      <span>{role.toLowerCase()} · {workspace.planTier.toLowerCase()} · {workspace.subscriptionStatus.toLowerCase().replaceAll("_", " ")}{workspace.cancelAtPeriodEnd ? " · canceling" : ""}</span>
                      <small>
                        {workspace._count.contacts} Contacts · {workspace._count.mixes} Mixes · {workspace._count.jumps} Jumps
                        {workspace.currentPeriodEnd ? ` · Period ends ${formatDate(workspace.currentPeriodEnd)}` : ""}
                      </small>
                    </div>
                    {user.id === adminUser.id ? (
                      <span className="muted-copy">Current administrator</span>
                    ) : (
                      <details className="admin-impersonation-panel">
                        <summary className="button small">View account…</summary>
                        <form action="/api/admin/impersonation/start" method="post" className="form-stack">
                          <input type="hidden" name="targetUserId" value={user.id} />
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <div className="field">
                            <label htmlFor={`reason-${user.id}-${workspace.id}`}>Support reason</label>
                            <textarea
                              id={`reason-${user.id}-${workspace.id}`}
                              name="reason"
                              minLength={10}
                              maxLength={500}
                              placeholder="Example: Investigating ticket #1842 about missing Jump tasks."
                              required
                            />
                            <small>This reason is stored in the workspace audit log.</small>
                          </div>
                          <button className="button primary" type="submit">Start 30-minute view-only session</button>
                        </form>
                      </details>
                    )}
                  </section>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {!users.length && <div className="empty-state"><h2>No users found</h2><p>Try another name, email address, or workspace.</p></div>}
    </div>
  );
}
