import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { Sheet } from "@/components/Sheet";
import { requirePlatformAdmin } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { manageUserAccessAction } from "@/lib/user-admin-actions";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Admin · Users" };

type SearchParams = {
  q?: string;
  error?: string;
  impersonationEnded?: string;
  updated?: string;
  page?: string;
  status?: string;
};

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { user: adminUser, permissions }] = await Promise.all([searchParams, requirePlatformAdmin("users.read")]);
  const displayPreferences = await displayPreferencesForUser(adminUser.id);
  const query = (params.q?.trim() ?? "").slice(0, 254);
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const status = params.status === "suspended" ? "suspended" : params.status === "active" ? "active" : "all";
  const where: Prisma.UserWhereInput = {
    ...(status === "suspended" ? { suspendedAt: { not: null } } : status === "active" ? { suspendedAt: null } : {}),
    ...(query ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { memberships: { some: { workspace: { name: { contains: query, mode: "insensitive" } } } } }
          ]
        } : {})
  };
  const [users, total] = await Promise.all([prisma.user.findMany({
    where,
    select: {
      id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true, suspendedAt: true, accessRevision: true,
      staffMembership: { select: { status: true, role: true } },
      _count: { select: { sessions: { where: { expiresAt: { gt: new Date() } } } } },
      memberships: {
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              _count: { select: { contacts: true, mixes: true, jumps: true } }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50, skip: (page - 1) * 50
  }), prisma.user.count({ where })]);
  const pageHref = (next: number) => `/admin/users?${new URLSearchParams({ q: query, status, page: String(next) })}`;

  return (
    <div className="page admin-users-page">
      <header className="page-header">
        <div>
          <h1>Admin · Users</h1>
          <p>Find an account, review its access, and manage sessions within your permissions.</p>
        </div>
        <div className="page-actions">
          {permissions.includes("support.manage") && <Link className="button" href="/admin/support">Support</Link>}
          {permissions.includes("mixes.edit") && <Link className="button" href="/admin/templates">Ready-made mixes</Link>}
        </div>
      </header>

      {params.error && <Notice type="error">{params.error}</Notice>}
      {params.impersonationEnded && <Notice type="success">The view-only support session has ended.</Notice>}
      {params.updated === "suspend" && <Notice>Account suspended. Sessions ended, sending and reminders switched off, and unused referrals revoked. A message already handed to a provider may still arrive.</Notice>}
      {params.updated === "restore" && <Notice>Access restored. The member must sign in again and choose any sending or reminders they want to enable.</Notice>}
      {params.updated === "revoke_sessions" && <Notice>All current sessions and existing email sign-in links were ended. The member can sign in again.</Notice>}

      <section className="card admin-safety-card">
        <strong>View-only by design</strong>
        <p>Impersonation lasts 30 minutes by default. All browser mutations are blocked, the target workspace is recorded, and start/end events are written to the audit log.</p>
      </section>

      <form className="filter-bar admin-user-search" method="get">
        <input name="q" defaultValue={query} maxLength={254} placeholder="Search name, email, or workspace" aria-label="Search users" />
        <select name="status" aria-label="Account access" defaultValue={status}><option value="all">All accounts</option><option value="active">Active accounts</option><option value="suspended">Suspended accounts</option></select>
        <button className="button" type="submit">Search</button>
        {query && <a className="button" href="/admin/users">Clear</a>}
      </form>
      <p>{total} matching accounts · Page {page}</p>

      <div className="admin-user-list">
        {users.map((user) => (
          <article className="card admin-user-card" key={user.id} style={{ overflowWrap: "anywhere" }}>
            <div className="admin-user-heading">
              <div>
                <h2>{user.name}</h2>
                <p>{user.email}</p>
              </div>
              <div className="admin-user-badges">
                {user.staffMembership && <span className="status-pill">Staff · {user.staffMembership.role.toLowerCase()} · {user.staffMembership.status.toLowerCase()}</span>}
                <span className="status-pill">{user.suspendedAt ? "Suspended" : "Active"}</span>
                <span className={user.emailVerifiedAt ? "status-pill done" : "status-pill"}>{user.emailVerifiedAt ? "Verified" : "Unverified"}</span>
              </div>
            </div>
            <small>Joined {formatDate(user.createdAt, displayPreferences)}</small>
            <p>{user._count.sessions} active sessions{user.suspendedAt ? ` · Access paused ${formatDate(user.suspendedAt, displayPreferences)}` : ""}</p>
            {user.staffMembership ? <p>Staff access is managed by an Owner in {permissions.includes("staff.manage") ? <Link href="/admin/team">Admin → Team</Link> : "Admin → Team"}.</p> : user.id !== adminUser.id && (permissions.includes("users.suspend") || permissions.includes("sessions.revoke")) && <Sheet trigger={<button className="button small" type="button">Manage account access…</button>} title={`Manage ${user.name}’s access`} description="Every change requires your current password, recent administrator verification, and a recorded reason.">
              <form action={manageUserAccessAction} className="form-stack">
                <input type="hidden" name="userId" value={user.id} /><input type="hidden" name="revision" value={user.accessRevision} />
                <input type="hidden" name="q" value={user.email} />
                <label className="field"><span>Account operation</span><select name="operation" required>
                  {permissions.includes("users.suspend") && <option value={user.suspendedAt ? "restore" : "suspend"}>{user.suspendedAt ? "Restore account access" : "Suspend account"}</option>}
                  {permissions.includes("sessions.revoke") && <option value="revoke_sessions">End all sessions</option>}
                </select></label>
                <p>Suspending ends sessions, turns off automatic sending and reminders, and revokes unused referrals. Existing members who joined through those referrals keep their accounts. Messages already handed to a provider may still arrive.</p>
                <p>Restoring access requires a fresh sign-in. Sending and reminders stay off until the member enables them.</p>
                <label className="field"><span>Reason for account change</span><textarea name="reason" minLength={10} maxLength={500} required /><small>Use a case reference and brief explanation. Keep passwords and private messages out of this record.</small></label>
                <label className="field"><span>Your administrator password</span><input type="password" name="currentPassword" autoComplete="current-password" maxLength={72} required /></label>
                <button className="button primary" type="submit">Apply account change</button>
              </form>
            </Sheet>}

            {!user.memberships.length ? (
              <div className="notice info">No workspace membership is attached to this account.</div>
            ) : (
              <div className="admin-workspace-list">
                {user.memberships.map(({ workspace, role }) => (
                  <section className="admin-workspace-row" key={workspace.id}>
                    <div>
                      <strong>{workspace.name}</strong>
                      <span>{role.toLowerCase()}</span>
                      <small>
                        {workspace._count.contacts} contacts · {workspace._count.mixes} mixes · {workspace._count.jumps} follow-ups
                      </small>
                    </div>
                    {user.id === adminUser.id ? (
                      <span className="muted-copy">Current administrator</span>
                    ) : permissions.includes("support.manage") ? (
                      <Link className="button small" href={`/admin/support?q=${encodeURIComponent(user.email)}`}>Find support tickets</Link>
                    ) : <span className="muted-copy">Support permission required</span>}
                  </section>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {!users.length && <div className="empty-state"><h2>No users found</h2><p>Try another name, email address, or workspace.</p></div>}
      <nav className="page-actions" aria-label="User pages">{page > 1 && <Link href={pageHref(page - 1)}>Previous</Link>}{page * 50 < total && <Link href={pageHref(page + 1)}>Next</Link>}</nav>
    </div>
  );
}
