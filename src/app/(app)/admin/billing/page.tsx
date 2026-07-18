import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requirePlatformAdmin } from "@/lib/auth";
import { billingPeriodLabel, billingConfigurationIssues, subscriptionStatusLabel } from "@/lib/billing";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Billing" };

type SearchParams = { q?: string };

export default async function AdminBillingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [{ q = "" }] = await Promise.all([searchParams, requirePlatformAdmin()]);
  const query = q.trim();
  const subscriptionWhere = query
    ? {
        OR: [
          { stripeSubscriptionId: { contains: query, mode: "insensitive" as const } },
          { stripePriceId: { contains: query, mode: "insensitive" as const } },
          { workspace: { name: { contains: query, mode: "insensitive" as const } } },
          { workspace: { owner: { email: { contains: query, mode: "insensitive" as const } } } }
        ]
      }
    : undefined;

  const [subscriptions, webhookEvents, paidCount, pastDueCount, cancelingCount, failedWebhookCount] = await Promise.all([
    prisma.subscription.findMany({
      where: subscriptionWhere,
      include: { workspace: { include: { owner: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100
    }),
    prisma.webhookEvent.findMany({
      where: { provider: "STRIPE" },
      include: { workspace: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.workspace.count({ where: { planTier: { in: ["PLUS", "PRO"] } } }),
    prisma.workspace.count({ where: { subscriptionStatus: "PAST_DUE" } }),
    prisma.workspace.count({ where: { cancelAtPeriodEnd: true } }),
    prisma.webhookEvent.count({ where: { provider: "STRIPE", status: "FAILED" } })
  ]);
  const configurationIssues = billingConfigurationIssues();

  return (
    <div className="page admin-billing-page">
      <header className="page-header">
        <div><h1>Admin · Billing</h1><p>Monitor server-verified subscriptions, renewal state, payment issues, and Stripe webhook processing.</p></div>
        <div className="page-actions"><Link className="button" href="/admin/users">Users</Link><Link className="button" href="/admin/support">Support</Link><Link className="button" href="/admin/integrations">Integrations</Link><Link className="button" href="/admin/templates">Templates</Link></div>
      </header>

      {configurationIssues.length > 0 && <Notice type="error">Billing configuration is incomplete: {configurationIssues.join(", ")}.</Notice>}
      <section className="stats-grid admin-billing-stats">
        <article className="stat-card"><small>Paid workspaces</small><strong>{paidCount}</strong></article>
        <article className="stat-card"><small>Past due</small><strong>{pastDueCount}</strong></article>
        <article className="stat-card"><small>Canceling</small><strong>{cancelingCount}</strong></article>
        <article className="stat-card"><small>Failed webhooks</small><strong>{failedWebhookCount}</strong></article>
      </section>

      <form className="filter-bar admin-billing-search" method="get">
        <input name="q" defaultValue={query} placeholder="Search workspace, owner email, subscription, or Price ID" aria-label="Search billing records" />
        <button className="button" type="submit">Search</button>
        {query && <Link className="button" href="/admin/billing">Clear</Link>}
      </form>

      <section className="card">
        <div className="card-header"><div><h2>Subscriptions</h2><p>Stripe period dates are the billing source of truth. Workspace access mirrors the reconciled subscription state.</p></div><span className="status-pill">{subscriptions.length}</span></div>
        <div className="admin-billing-list">
          {subscriptions.map((subscription) => (
            <article className="admin-billing-row" key={subscription.id}>
              <div><strong>{subscription.workspace.name}</strong><span>{subscription.workspace.owner.email}</span><small>{subscription.stripeSubscriptionId}</small></div>
              <div><span>{subscription.planTier.toLowerCase()} · {billingPeriodLabel(subscription.billingPeriod)}</span><small>Price {subscription.stripePriceId}</small></div>
              <div><span className={`status-pill ${["ACTIVE", "TRIALING"].includes(subscription.status) ? "done" : ""}`}>{subscriptionStatusLabel(subscription.status)}</span><small>{subscription.currentPeriodEnd ? `${subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} ${formatDate(subscription.currentPeriodEnd)}` : "No period end"}</small></div>
            </article>
          ))}
          {!subscriptions.length && <div className="empty-state"><h3>No subscriptions found</h3><p>Completed Stripe subscriptions will appear after Checkout verification or webhook reconciliation.</p></div>}
        </div>
      </section>

      <section className="card">
        <div className="card-header"><div><h2>Recent Stripe webhook events</h2><p>Duplicate event IDs are processed once. Failed events remain visible for retry investigation.</p></div><span className="status-pill">{webhookEvents.length}</span></div>
        <div className="admin-webhook-list">
          {webhookEvents.map((event) => (
            <article className="admin-webhook-row" key={event.id}>
              <div><strong>{event.externalId}</strong><span>{event.workspace?.name || "Workspace unresolved"}</span></div>
              <div><span className={`status-pill ${event.status === "PROCESSED" ? "done" : ""}`}>{event.status.toLowerCase()}</span><small>{event.processedAt ? `Processed ${formatDateTime(event.processedAt)}` : `Received ${formatDateTime(event.createdAt)}`}</small></div>
              {event.error && <p>{event.error}</p>}
            </article>
          ))}
          {!webhookEvents.length && <div className="empty-state"><h3>No Stripe events received</h3><p>Register the public `/api/webhooks/stripe` endpoint in Stripe Workbench and complete a test subscription.</p></div>}
        </div>
      </section>
    </div>
  );
}
