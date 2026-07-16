import type { Metadata } from "next";
import Link from "next/link";
import { GoogleContactsPanel } from "@/components/GoogleContactsPanel";
import { Notice } from "@/components/Notice";
import {
  changePasswordAction,
  revokeSessionAction,
  signOutEverywhereAction,
  signOutOtherSessionsAction
} from "@/lib/auth-actions";
import { requireWorkspace } from "@/lib/auth";
import { billingPeriodLabel, checkoutConfigured, subscriptionStatusLabel } from "@/lib/billing";
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
  billing?: string;
  billingError?: string;
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, context] = await Promise.all([searchParams, requireWorkspace()]);
  const { session, user, workspace, impersonation } = context;
  const [sessions, subscription] = await Promise.all([
    impersonation
      ? Promise.resolve([])
      : prisma.session.findMany({
          where: { userId: user.id, expiresAt: { gt: new Date() } },
          orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }]
        }),
    workspace.stripeSubscriptionId
      ? prisma.subscription.findUnique({ where: { stripeSubscriptionId: workspace.stripeSubscriptionId } })
      : Promise.resolve(null)
  ]);
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
        <div><dt>Subscription</dt><dd>{subscriptionStatusLabel(workspace.subscriptionStatus)}</dd></div>
      </dl>
    </section>
  );

  const billingSummary = (
    <section className="card account-billing-card" id="billing">
      <div className="card-header">
        <div><h2>Billing and subscription</h2><p>Stripe securely manages payment methods, invoices, plan changes, and cancellations.</p></div>
        <span className={`status-pill ${["ACTIVE", "TRIALING"].includes(workspace.subscriptionStatus) ? "done" : ""}`}>{subscriptionStatusLabel(workspace.subscriptionStatus)}</span>
      </div>
      <dl className="account-definition-list billing-definition-list">
        <div><dt>Current plan</dt><dd>{workspace.planTier.toLowerCase()}</dd></div>
        <div><dt>Billing period</dt><dd>{subscription ? billingPeriodLabel(subscription.billingPeriod) : "Not billed"}</dd></div>
        <div>
          <dt>{workspace.cancelAtPeriodEnd ? "Access ends" : "Renews"}</dt>
          <dd>{workspace.currentPeriodEnd ? formatDate(workspace.currentPeriodEnd) : "No paid renewal scheduled"}</dd>
        </div>
        {subscription && <div><dt>Stripe status</dt><dd>{subscriptionStatusLabel(subscription.status)}</dd></div>}
      </dl>
      {workspace.subscriptionStatus === "PAST_DUE" && <Notice type="error">A payment needs attention. Open the billing portal to update the payment method and review Stripe&apos;s recovery status.</Notice>}
      {workspace.cancelAtPeriodEnd && <Notice type="info">Your paid subscription is scheduled to end at the close of the current period. Stripe can resume it before that date.</Notice>}
      {!checkoutConfigured() && <Notice type="info">Billing is not configured in this environment. Core Free-plan workflows remain available.</Notice>}
      {!impersonation && (
        <div className="page-actions account-billing-actions">
          <Link className="button primary" href="/plans">Review plans</Link>
          {workspace.stripeCustomerId && <form action="/api/billing/portal" method="post"><button className="button" type="submit">Manage billing in Stripe</button></form>}
        </div>
      )}
    </section>
  );

  if (impersonation) {
    return (
      <div className="page account-page">
        <header className="page-header"><div><h1>My Account</h1><p>Account identity, plan, and integration state are visible; security controls remain private and billing changes remain unavailable during support access.</p></div></header>
        <Notice type="info">This is a view-only administrator support session. Password controls, active devices, billing changes, integrations, and every other browser mutation are unavailable.</Notice>
        <div className="account-grid">{accountSummary}{billingSummary}</div>
        <GoogleContactsPanel />
      </div>
    );
  }

  return (
    <div className="page account-page">
      <header className="page-header">
        <div><h1>My Account</h1><p>Review identity, billing, integrations, password security, and active devices.</p></div>
      </header>

      {params.error && <Notice type="error">{params.error}</Notice>}
      {params.billingError && <Notice type="error">{params.billingError}</Notice>}
      {params.billing === "portal-return" && <Notice type="success">Returned from Stripe. Subscription changes will appear here after Stripe confirms them.</Notice>}
      {params.google === "connected" && <Notice type="success">Google Contacts connected. Choose labels, preview the import, and start the first sync below.</Notice>}
      {params.google === "upgrade" && <Notice type="info">Google Contacts is available on Plus and Pro plans.</Notice>}
      {params.google === "readonly" && <Notice type="info">End the view-only support session before connecting an external account.</Notice>}
      {params.googleError && <Notice type="error">{params.googleError}</Notice>}
      {params.passwordChanged && <Notice type="success">Password updated. Other active sessions were signed out.</Notice>}
      {params.sessionRevoked && <Notice type="success">That session was signed out.</Notice>}
      {params.sessionsClosed !== undefined && <Notice type="success">Signed out {params.sessionsClosed} other session{params.sessionsClosed === "1" ? "" : "s"}.</Notice>}

      <div className="account-grid">
        {accountSummary}
        {billingSummary}
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
