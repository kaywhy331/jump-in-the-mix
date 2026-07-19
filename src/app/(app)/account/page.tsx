import type { Metadata } from "next";
import Link from "next/link";
import { GoogleContactsPanel } from "@/components/GoogleContactsPanel";
import { AccountDeletionForm } from "@/components/AccountDeletionForm";
import { Notice } from "@/components/Notice";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ReferralAccountCard } from "@/components/ReferralAccountCard";
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
import { countActiveGroups } from "@/lib/group-activity";
import { formatPlanLimit, PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { describeUserAgent } from "@/lib/request-context";
import { supportCategoryLabel, supportStatusLabel } from "@/lib/support-content";

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
  section?: string;
};

type UsageRow = {
  label: string;
  value: number;
  limit: number;
  href: string;
  action: string;
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, context] = await Promise.all([searchParams, requireWorkspace()]);
  const { session, user, workspace, impersonation } = context;
  const section = ["overview", "billing", "connections", "security", "referrals", "support", "privacy"].includes(params.section ?? "") ? params.section! : "overview";
  const [sessions, subscription, usage, supportTickets] = await Promise.all([
    impersonation
      ? Promise.resolve([])
      : prisma.session.findMany({
          where: { userId: user.id, expiresAt: { gt: new Date() } },
          orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }]
        }),
    workspace.stripeSubscriptionId
      ? prisma.subscription.findUnique({ where: { stripeSubscriptionId: workspace.stripeSubscriptionId } })
      : Promise.resolve(null),
    Promise.all([
      prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } }),
      countActiveGroups(workspace.id),
      prisma.dateType.count({ where: { workspaceId: workspace.id, isSystem: false, isActive: true } }),
      prisma.mix.count({ where: { workspaceId: workspace.id, status: "ACTIVE" } }),
      prisma.sharedMixMetadata.count({
        where: {
          publisherWorkspaceId: workspace.id,
          isPlatform: false,
          reviewState: { in: ["PENDING", "APPROVED", "FLAGGED"] }
        }
      })
    ]).then(([contacts, groups, customDateTypes, mixes, sharedMixes]) => ({ contacts, groups, customDateTypes, mixes, sharedMixes })),
    prisma.supportTicket.findMany({
      where: { workspaceId: workspace.id, requesterUserId: user.id },
      include: { _count: { select: { messages: true } } },
      orderBy: { lastActivityAt: "desc" },
      take: 8
    })
  ]);
  const emailStatus = user.emailVerifiedAt
    ? `Verified ${formatDate(user.emailVerifiedAt)}`
    : env.requireEmailVerification
      ? "Verification required"
      : "Verification not enforced";
  const limits = PLAN_LIMITS[workspace.planTier];
  const usageRows: UsageRow[] = [
    { label: "Active Contacts", value: usage.contacts, limit: limits.contacts, href: "/contacts", action: "Manage Contacts" },
    { label: "Active Contact Groups", value: usage.groups, limit: limits.groups, href: "/contacts", action: "Choose active Groups" },
    { label: "Active custom Important Date Types", value: usage.customDateTypes, limit: limits.customDateTypes, href: "/settings/jump-date-types", action: "Choose active types" },
    { label: "Active Mixes", value: usage.mixes, limit: limits.mixes, href: "/mixes", action: "Choose active Mixes" },
    { label: "Shared Community Mixes", value: usage.sharedMixes, limit: limits.sharedMixes, href: "/templates?source=community", action: "Review sharing" }
  ];
  const overageRows = usageRows.filter((row) => Number.isFinite(row.limit) && row.value > row.limit);

  const accountSummary = (
    <section className="card account-summary-card" id="profile">
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

  const usageSummary = (
    <section className="card account-plan-usage-card" id="plan-usage">
      <div className="card-header">
        <div><h2>Plan usage</h2><p>Your records are preserved when a plan changes. Active workflow limits are enforced without deleting completed work.</p></div>
        <span className={`status-pill ${overageRows.length ? "" : "done"}`}>{overageRows.length ? `${overageRows.length} over limit` : "Within limits"}</span>
      </div>
      <details className="account-downgrade-details"><summary>What happens if I downgrade?</summary><Notice type="info">After a downgrade, excess active Mixes are paused, future incomplete Jumps from them are canceled, excess custom Important Date Types and Contact Groups become inactive, and excess Community shares are unpublished. Contacts, memberships, assignments, and history stay stored. Choose the active Groups and Important Date Types you want to keep from their management pages.</Notice></details>
      <div className="plan-usage-list">
        {usageRows.map((row) => {
          const unlimited = !Number.isFinite(row.limit);
          const over = !unlimited && row.value > row.limit;
          const percentage = unlimited ? 0 : Math.min((row.value / Math.max(row.limit, 1)) * 100, 100);
          return (
            <article className={`plan-usage-row ${over ? "over" : ""}`} key={row.label}>
              <div><strong>{row.label}</strong><span>{row.value}/{formatPlanLimit(row.limit)}</span></div>
              {!unlimited && <div className="plan-usage-track" aria-label={`${row.label}: ${row.value} of ${row.limit}`}><span style={{ width: `${percentage}%` }} /></div>}
              <Link href={row.href} className="text-button">{row.action}</Link>
            </article>
          );
        })}
      </div>
    </section>
  );

  const supportSummary = (
    <section className="card account-support-card" id="support">
      <div className="card-header">
        <div><h2>Help and support tickets</h2><p>Review complete conversations, reply, or reopen a resolved issue without losing its history.</p></div>
        <span className="status-pill">{supportTickets.length}</span>
      </div>
      <div className="support-ticket-list">
        {supportTickets.map((ticket) => (
          <Link className="support-ticket-row" href={`/account/tickets/${ticket.id}`} key={ticket.id}>
            <div>
              <strong>{ticket.title}</strong>
              <span>{ticket.reference} · {supportCategoryLabel(ticket.category)}</span>
              <small>{ticket._count.messages} message{ticket._count.messages === 1 ? "" : "s"} · Updated {formatDateTime(ticket.lastActivityAt)}</small>
            </div>
            <span className={`status-pill ${ticket.status === "RESOLVED" ? "done" : ""}`}>{supportStatusLabel(ticket.status)}</span>
          </Link>
        ))}
        {!supportTickets.length && (
          <div className="support-inline-empty">
            <strong>No support conversations yet.</strong>
            <span>Search the FAQ or submit a private ticket when you need help.</span>
          </div>
        )}
      </div>
      <div className="account-support-actions">
        <Link className="button" href="/help">Search Help & FAQ</Link>
        {!impersonation && <Link className="button primary" href="/help#contact-support">Open a support ticket</Link>}
      </div>
    </section>
  );

  const referralSummary = (
    <ReferralAccountCard
      workspaceId={workspace.id}
      planTier={workspace.planTier}
      impersonation={Boolean(impersonation)}
    />
  );

  if (impersonation) {
    return (
      <div className="page account-page">
        <header className="page-header"><div><h1>My Account</h1><p>Account identity, plan, integration state, referral history, and support history are visible; security controls and mutations remain private during support access.</p></div></header>
        <Notice type="info">This is a view-only administrator support session. Password controls, active devices, billing changes, integrations, referral sharing, ticket replies, and every other browser mutation are unavailable.</Notice>
        <div className="account-grid">{accountSummary}{billingSummary}{usageSummary}{referralSummary}{supportSummary}</div>
        <GoogleContactsPanel />
      </div>
    );
  }

  return (
    <div className="page account-page">
      <header className="page-header">
        <div><h1>My Account</h1><p>Review identity, billing, integrations, referrals, support, password security, and active devices.</p></div>
      </header>

      <nav className="account-section-nav" aria-label="Account sections">
        {[['overview','Overview'],['billing','Billing'],['connections','Connections'],['security','Security'],['referrals','Referrals'],['support','Support'],['privacy','Data & privacy']].map(([key, label]) => <Link className={section === key ? "active" : ""} href={`/account?section=${key}`} key={key}>{label}</Link>)}
      </nav>

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
        {section === "overview" && accountSummary}
        {section === "billing" && billingSummary}
        {section === "billing" && usageSummary}
        {section === "referrals" && referralSummary}
        {section === "support" && supportSummary}
        {section === "security" && <section className="card account-password-card" id="security">
          <div className="card-header"><div><h2>Change password</h2><p>Changing it keeps this device signed in and closes every other session.</p></div></div>
          <form action={changePasswordAction} className="form-stack">
            <div className="field"><label htmlFor="currentPassword">Current password</label><input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></div>
            <div className="field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /><small>Use at least 12 characters.</small></div>
            <div className="field"><label htmlFor="confirmPassword">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></div>
            <button className="button primary" type="submit">Update password</button>
          </form>
        </section>}
      </div>

      {section === "connections" && <GoogleContactsPanel />}

      {section === "security" && <section className="card account-sessions-card">
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
        <div className="account-signout-all"><ConfirmDialog trigger="Sign out everywhere…" title="Sign out everywhere?" description="This closes every active session, including this device." danger><form action={signOutEverywhereAction}><button className="button danger" type="submit">Confirm sign out everywhere</button></form></ConfirmDialog></div>
      </section>}

      {section === "privacy" && <section className="card danger-zone" id="data-privacy" aria-labelledby="danger-zone-heading">
        <div className="card-header">
          <div>
            <p className="eyebrow">Danger Zone</p>
            <h2 id="danger-zone-heading">Permanently delete account</h2>
            <p id="account-deletion-warning">This cannot be undone. Reauthentication and an exact confirmation phrase are required.</p>
          </div>
        </div>
        <div className="notice error">
          <p><strong>Deletion removes:</strong> your profile and every session; each workspace you own; Contacts and their private notes; Important Dates; Groups; Mixes; pending jobs; future and completed Jumps; support history; billing records stored here; and encrypted integration credentials.</p>
          <p>Provider access is revoked on a best-effort basis before local deletion. Google or another provider may be unavailable or may already have revoked the token. Failed revocations are retried from an encrypted queue, but you may also remove Jump in the Mix from the provider&apos;s security settings.</p>
          <p>A pseudonymous operational record is retained with the deletion time, outcome, and pending-revocation count. It does not retain your name, email, Contacts, messages, or raw provider tokens.</p>
        </div>
        <AccountDeletionForm />
      </section>}
    </div>
  );
}
