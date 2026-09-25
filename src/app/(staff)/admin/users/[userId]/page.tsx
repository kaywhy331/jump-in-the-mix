import { AdminAccountOperation } from "@/components/AdminAccountOperation";
import { describeUserAgent } from "@/lib/request-context";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminDraftForm } from "@/components/AdminDraftForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { requirePlatformAdmin } from "@/lib/auth";
import { safeAdminReturnTo } from "@/lib/admin-navigation";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { manageUserAccessAction } from "@/lib/user-admin-actions";
export const metadata = { title: "Admin · Customer account" };
export default async function AdminUserDetail({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ returnTo?: string; updated?: string; error?: string; at?: string; sig?: string }> }) {
  const [{ userId }, query, { user: operator, session: operatorSession, permissions }] = await Promise.all([params, searchParams, requirePlatformAdmin("users.read")]);
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { staffMembership: true, sessions: { where: { expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, expiresAt: true, userAgent: true, lastSeenAt: true }, orderBy: { createdAt: "desc" } }, memberships: { include: { workspace: { select: { id: true, name: true, _count: { select: { contacts: true, mixes: true, jumps: true } } } } } } } });
  if (!user) notFound();
  const display = await displayPreferencesForUser(operator.id);
  const returnTo = safeAdminReturnTo(query.returnTo, "/admin/users");
  const detailPath = `/admin/users/${user.id}?returnTo=${encodeURIComponent(returnTo)}`;
  const messages: Record<string, string> = { suspend: "Account suspended. Sessions ended, sending and reminders switched off, unused referrals revoked. Messages already handed to a provider may still arrive.", restore: "Access restored. The member must sign in again and choose whether to enable sending or reminders.", revoke_sessions: "Sessions and existing email sign-in links ended. The member can sign in again." };
  return <div className="page"><header className="page-header"><div><h1>{user.name}</h1><p>{user.email} · {user.suspendedAt ? "Suspended" : "Active"} · {user.emailVerifiedAt ? "Email verified" : "Email unverified"}</p></div><Link className="button" href={returnTo}>Back to results</Link></header>
    <UrlErrorNotice params={query} viewer={operatorSession} />{query.updated && <Notice>{messages[query.updated] ?? "Account updated."}</Notice>}
    <nav className="page-actions" aria-label="Related account records">{permissions.includes("support.manage") && <Link className="button" href={`/admin/support?view=all&q=${encodeURIComponent(user.email)}`}>Support tickets</Link>}{permissions.includes("access.read") && <Link className="button" href={`/admin/access?q=${encodeURIComponent(user.email)}`}>Invitations</Link>}{permissions.includes("audit.read") && <Link className="button" href={`/admin/audit?q=${encodeURIComponent(user.id)}`}>Audit history</Link>}</nav>
    <div className="admin-detail-columns"><section className="card"><h2>Account context</h2><p>Joined {formatDateTime(user.createdAt, display)} · {user.sessions.length} active sessions</p>{user.memberships.length ? user.memberships.map(({ workspace, role }) => <div className="admin-queue-row" key={workspace.id}><div><h3>{workspace.name}</h3><p>{role.toLowerCase()} · {workspace._count.contacts} contacts · {workspace._count.mixes} mixes · {workspace._count.jumps} follow-ups</p></div></div>) : <p>No customer workspace is attached.</p>}<details><summary>Active devices ({user.sessions.length})</summary>{user.sessions.map(session => <p key={session.id}><strong>{describeUserAgent(session.userAgent)}{session.id === operatorSession.id ? " · Current session" : ""}</strong> · Last active {formatDateTime(session.lastSeenAt, display)} · Started {formatDateTime(session.createdAt, display)} · Expires {formatDateTime(session.expiresAt, display)}</p>)}</details></section>
    {user.staffMembership ? <section className="card"><h2>Staff access</h2><p>{user.staffMembership.role.toLowerCase()} · {user.staffMembership.status.toLowerCase()}</p>{permissions.includes("staff.manage") ? <Link href={`/admin/team?q=${encodeURIComponent(user.email)}`}>Manage in Team</Link> : <p>An owner manages this staff account.</p>}</section> : user.id !== operator.id && (permissions.includes("users.suspend") || permissions.includes("sessions.revoke")) && <section className="card"><h2>Manage account access</h2><AdminDraftForm draftKey={`user-access:${user.id}`} fields={["operation", "reason"]} revision={user.accessRevision} saved={query.updated ? `${query.updated}:${user.accessRevision}` : undefined} action={manageUserAccessAction}>
      <input name="userId" type="hidden" value={user.id} /><input name="returnTo" type="hidden" value={detailPath} />
      <label className="field"><span>Operation</span><select name="operation" required>{permissions.includes("users.suspend") && <option value={user.suspendedAt ? "restore" : "suspend"}>{user.suspendedAt ? "Restore account access" : "Suspend account"}</option>}{permissions.includes("sessions.revoke") && <option value="revoke_sessions">End all sessions</option>}</select></label>

      <label className="field"><span>Reason and case reference</span><textarea name="reason" minLength={10} maxLength={500} required /></label><label className="field"><span>Your administrator password</span><input name="currentPassword" type="password" autoComplete="current-password" maxLength={72} required /></label>
      <AdminAccountOperation email={user.email} />
    </AdminDraftForm></section>}
  </div></div>;
}
