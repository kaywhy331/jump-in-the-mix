import type { Metadata } from "next";
import { GoogleContactsPanel } from "@/components/GoogleContactsPanel";
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
  google?: string;
  googleError?: string;
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, context] = await Promise.all([searchParams, requireWorkspace()]);
  const { session, user, workspace, impersonation } = context;
  const sessions = impersonation
    ? []
    : await prisma.session.findMany({
        where: { userId: user.id, expiresAt: { gt: new Date() } },
        orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }]
      });
  const emailStatus = user.emailVerifiedAt
    ? `Verified ${formatDate(user.emailVerifiedAt)}`
    : env.requireEmailVerification
      ? "Verification required"
      : "Verification not enforced";

  const accountSummary = (
    <section className="card account-summary-card">
      <div className="card-header"><div><h2>Account</h2><p>These details identify the owner of this workspace.</p></div></div>
      <dl className="account-definition-list">
        <div><dt>Name</dt><dd>{user.name}</dd></div>
        <div><dt>Email</dt><dd>{user.email}</dd></div>
        <div><dt>Email status</dt><dd>{emailStatus}</dd></div>
        <div><dt>Workspace</dt><dd>{workspace.name}</dd></div>
        <div><dt>Plan</dt><dd>{workspace.planTier.toLowerCase()}</dd></div>
        <div><dt>Subscription</dt><dd>{workspace.subscriptionStatus.toLowerCase().replaceAll("_", " ")}</dd></div>
      </dl>
    </section>
  );

  if (impersonation) {
    return (
      <div className="page account-page">
        <header className="page-header"><div><h1>My Account</h1><p>Account identity and integration state are visible; security controls remain private during support access.</p></div></header>
        <Notice type="info">This is a view-only administrator support session. Password controls, active devices, billing changes, integrations, and every other browser mutation are unavailable.</Notice>
        <div className="account-grid">{accountSummary}</div>
        <GoogleContactsPanel />
      </div>
    );
  }

  return (
    <div className="page account-page">
      <header className="page-header">
        <div><h1>My Account</h1><p>Review account identity, integrations, password security, and active devices.</p></div>
      </header>

      {params.error && <Notice type="error">{params.error}</Notice>}
      {params.google === "connected" && <Notice type="success">Google Contacts connected. Choose labels, preview the import, and start the first sync below.</Notice>}
      {params.google === "upgrade" && <Notice type="info">Google Contacts is available on Plus and Pro plans.</Notice>}
      {params.google === "readonly" && <Notice type="info">End the view-only support session before connecting an external account.</Notice>}
      {params.googleError && <Notice type="error">{params.googleError}</Notice>}
      {params.passwordChanged && <Notice type="success">Password updated. Other active sessions were signed out.</Notice>}
      {params.sessionRevoked && <Notice type="success">That session was signed out.</Notice>}
      {params.sessionsClosed !== undefined && <Notice type="success">Signed out {params.sessionsClosed} other session{params.sessionsClosed === "1" ? "" : "s"}.</Notice>}

      <div className="account-grid">
        {accountSummary}
        <section className="card account-password-card">
          <div className="card-header"><div><h2>Change password</h2><p>Changing it keeps this device signed in and closes every other session.</p></div></div>
          <form action={changePasswordAction} className="form-stack">
            <div className="field"><label htmlFor="currentPassword">Current password</label><input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></div>
            <div className="field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /><small>Use at least 12 characters.</small></div>
            <div className="field"><label htmlFor="confirmPassword">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></div>
            <button className="button primary" type="submit">Update password</button>
          </form>
        </section>
      </div>

      <GoogleContactsPanel />

      <section className="card account-sessions-card">
        <div className="card-header">
          <div><h2>Active sessions</h2><p>Session activity is recorded without storing the raw sign-in token.</p></div>
          {sessions.length > 1 && <form action={signOutOtherSessionsAction}><button className="button" type="submit">Sign out other devices</button></form>}
        </div>
        <div className="session-list">
          {sessions.map((item) => {
            const current = item.id === session.id;
            return (
              <article className="session-row" key={item.id}>
                <div className="session-device-icon" aria-hidden="true">{current ? "●" : "○"}</div>
                <div>
                  <h3>{describeUserAgent(item.userAgent)} {current && <span className="status-pill done">Current</span>}</h3>
                  <p>{item.ipAddress || "IP unavailable"} · Last active {formatDateTime(item.lastSeenAt)}</p>
                  <small>Created {formatDateTime(item.createdAt)} · Expires {formatDate(item.expiresAt)}</small>
                </div>
                {!current && <form action={revokeSessionAction}><input type="hidden" name="sessionId" value={item.id} /><button className="button small danger" type="submit">Sign out</button></form>}
              </article>
            );
          })}
        </div>
        <details className="destructive-confirm account-signout-all">
          <summary className="button danger">Sign out everywhere…</summary>
          <div className="destructive-confirm-panel"><p>This closes every active session, including this device.</p><form action={signOutEverywhereAction}><button className="button danger" type="submit">Confirm sign out everywhere</button></form></div>
        </details>
      </section>
    </div>
  );
}
