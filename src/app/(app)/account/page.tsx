import type { Metadata } from "next";
import Link from "next/link";
import { AccountDeletionForm } from "@/components/AccountDeletionForm";
import { AppIcon } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Notice } from "@/components/Notice";
import {
  changePasswordAction,
  revokeSessionAction,
  signOutEverywhereAction,
  signOutOtherSessionsAction
} from "@/lib/auth-actions";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { describeUserAgent } from "@/lib/request-context";

export const metadata: Metadata = { title: "My Account" };

type SearchParams = {
  error?: string;
  passwordChanged?: string;
  sessionRevoked?: string;
  sessionsClosed?: string;
  section?: string;
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, context] = await Promise.all([searchParams, requireWorkspace()]);
  const { session, user, impersonation } = context;
  const section = ["overview", "security", "privacy"].includes(params.section ?? "") ? params.section! : "overview";
  const sessions = impersonation ? [] : await prisma.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }]
  });
  const emailStatus = user.emailVerifiedAt
    ? `Verified ${formatDate(user.emailVerifiedAt)}`
    : env.requireEmailVerification ? "Verification required" : "Verification not enforced";

  if (impersonation) return <div className="page account-page"><header className="page-header"><div><h1>My Account</h1><p>Your identity is visible, while personal controls remain private.</p></div></header><Notice type="info">This view-only support session cannot change personal account settings.</Notice><section className="card"><dl className="account-definition-list"><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Email status</dt><dd>{emailStatus}</dd></div></dl></section></div>;

  return <div className="page account-page">
    <header className="page-header"><div><h1>My Account</h1><p>Manage your profile, security, personal data, and account lifecycle.</p></div></header>
    <nav className="account-section-nav" aria-label="Account sections">{[["overview", "Profile"], ["security", "Security"], ["privacy", "Data & privacy"]].map(([key, label]) => <Link className={section === key ? "active" : ""} href={`/account?section=${key}`} key={key}>{label}</Link>)}</nav>
    {params.error && <Notice type="error">{params.error}</Notice>}
    {params.passwordChanged && <Notice type="success">Password updated. Other active sessions were signed out.</Notice>}
    {params.sessionRevoked && <Notice type="success">That session was signed out.</Notice>}
    {params.sessionsClosed !== undefined && <Notice type="success">Signed out {params.sessionsClosed} other session{params.sessionsClosed === "1" ? "" : "s"}.</Notice>}

    {section === "overview" && <div className="account-grid"><section className="card account-summary-card"><div className="card-header"><div><h2>Profile</h2><p>Your personal account details and defaults.</p></div><Link className="button small" href="/account/preferences">Edit preferences</Link></div><dl className="account-definition-list"><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Email status</dt><dd>{emailStatus}</dd></div></dl></section><section className="card"><div className="card-header"><div><h2>Personal data</h2><p>Download a copy of your Contacts, Mixes, Jumps, and account settings.</p></div></div><a className="button" href="/api/account/export">Export my data</a></section></div>}

    {section === "security" && <><section className="card account-password-card"><div className="card-header"><div><h2>Change password</h2><p>Changing it keeps this device signed in and closes every other session.</p></div></div><form action={changePasswordAction} className="form-stack"><div className="field"><label htmlFor="currentPassword">Current password</label><input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></div><div className="field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /><small>Use at least 12 characters.</small></div><div className="field"><label htmlFor="confirmPassword">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></div><button className="button primary" type="submit">Update password</button></form></section><section className="card account-sessions-card"><div className="card-header"><div><h2>Active sessions</h2><p>Review devices that currently have access to your account.</p></div>{sessions.length > 1 && <form action={signOutOtherSessionsAction}><button className="button" type="submit">Sign out other devices</button></form>}</div><div className="session-list">{sessions.map((item) => { const current = item.id === session.id; return <article className="session-row" key={item.id}><div className="session-device-icon"><AppIcon name={current ? "check" : "circle"}/></div><div><h3>{describeUserAgent(item.userAgent)} {current && <span className="status-pill done">Current</span>}</h3><p>{item.ipAddress || "IP unavailable"} · Last active {formatDateTime(item.lastSeenAt)}</p><small>Created {formatDateTime(item.createdAt)} · Expires {formatDate(item.expiresAt)}</small></div>{!current && <form action={revokeSessionAction}><input type="hidden" name="sessionId" value={item.id}/><button className="button small danger" type="submit">Sign out</button></form>}</article>; })}</div><div className="account-signout-all"><ConfirmDialog trigger="Sign out everywhere…" title="Sign out everywhere?" description="This closes every active session, including this device." danger><form action={signOutEverywhereAction}><button className="button danger" type="submit">Confirm sign out everywhere</button></form></ConfirmDialog></div></section></>}

    {section === "privacy" && <section className="card danger-zone" aria-labelledby="danger-zone-heading"><div className="card-header"><div><p className="eyebrow">Danger Zone</p><h2 id="danger-zone-heading">Permanently delete account</h2><p>This cannot be undone. Reauthentication and an exact confirmation phrase are required.</p></div></div><div className="notice error"><p><strong>Deletion removes:</strong> your profile, sessions, Contacts and private notes, Important Dates, Groups, Mixes, Jumps, and support history.</p><p>A pseudonymous operational record retains only the deletion time and outcome; it does not retain your name, email, relationship data, or messages.</p></div><AccountDeletionForm/></section>}
  </div>;
}
