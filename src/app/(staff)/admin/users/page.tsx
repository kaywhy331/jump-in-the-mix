import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { AdminPagination } from "@/components/AdminPagination";
import { requirePlatformAdmin } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Admin · Users" };

type SearchParams = {
  q?: string;
  error?: string;
  at?: string;
  sig?: string;
  impersonationEnded?: string;
  updated?: string;
  page?: string;
  status?: string;
};

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { user: adminUser, session, permissions }] = await Promise.all([searchParams, requirePlatformAdmin("users.read")]);
  const displayPreferences = await displayPreferencesForUser(adminUser.id);
  const query = (params.q?.trim() ?? "").slice(0, 254);
  const requestedPage = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
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
  const total = await prisma.user.count({ where });
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / 50)));
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true, suspendedAt: true, accessRevision: true,
      sessions: { where: { expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, take: 1, select: { lastSeenAt: true } },
      staffMembership: { select: { status: true, role: true } },
      _count: { select: { sessions: { where: { expiresAt: { gt: new Date() } } } } },
      memberships: {
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              profile: { select: { onboardingDone: true } },
              _count: { select: { contacts: true, mixes: true, jumps: true } }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50, skip: (page - 1) * 50
  });
  const pageHref = (next: number) => `/admin/users?${new URLSearchParams({ q: query, status, page: String(next) })}`;

  return (
    <div className="page admin-users-page">
      <header className="page-header">
        <div>
          <h1>Users</h1>

        </div>
        <div className="page-actions">
          {permissions.includes("support.manage") && <Link className="button" href="/admin/support">Support</Link>}

        </div>
      </header>

      <UrlErrorNotice params={params} viewer={session} />
      {params.impersonationEnded && <Notice type="success">The view-only support session has ended.</Notice>}
      {params.updated === "suspend" && <Notice>Account suspended. Sessions ended, sending and reminders switched off, and unused referrals revoked. A message already handed to a provider may still arrive.</Notice>}
      {params.updated === "restore" && <Notice>Access restored. The member must sign in again and choose any sending or reminders they want to enable.</Notice>}
      {params.updated === "revoke_sessions" && <Notice>All current sessions and existing email sign-in links were ended. The member can sign in again.</Notice>}

      <form className="filter-bar admin-user-search" method="get">
        <input name="q" defaultValue={query} maxLength={254} placeholder="Search name, email, or workspace" aria-label="Search users" />
        <select name="status" aria-label="Account access" defaultValue={status}><option value="all">All accounts</option><option value="active">Active accounts</option><option value="suspended">Suspended accounts</option></select>
        <button className="button" type="submit">Search</button>
        {query && <a className="button" href="/admin/users">Clear</a>}
      </form>
      <p>{total} matching accounts · Page {page}</p>

      <div className="admin-queue" role="region" aria-label="Results" tabIndex={0}>
        {users.map(user => <article className="admin-queue-row" key={user.id}>
          <div><h2><Link href={`/admin/users/${user.id}?returnTo=${encodeURIComponent(pageHref(page))}`}>{user.name}</Link></h2><p>{user.email}</p><small>{user.memberships.map(item => item.workspace.name).join(" · ") || "No customer workspace"} · Joined {formatDate(user.createdAt, displayPreferences)}</small><p>{user.memberships.some(item => item.workspace.profile?.onboardingDone) ? "First-use setup complete" : "First-use setup incomplete"} · {user.sessions[0] ? `Last active ${formatDate(user.sessions[0].lastSeenAt, displayPreferences)}` : "No active session"}</p></div>
          <div className="page-actions"><span className="status-pill">{user.suspendedAt ? "Suspended" : "Active"}</span>{user.staffMembership && <span className="status-pill">Staff · {user.staffMembership.role.toLowerCase()}</span>}<span>{user._count.sessions} sessions</span><Link className="button small" href={`/admin/users/${user.id}?returnTo=${encodeURIComponent(pageHref(page))}`}>View account</Link></div>
        </article>)}
      </div>

      {!users.length && <div className="empty-state"><h2>No users found</h2><p>Try another name, email address, or workspace.</p></div>}
      <AdminPagination page={page} total={total} pageSize={50} href={pageHref} />
    </div>
  );
}
