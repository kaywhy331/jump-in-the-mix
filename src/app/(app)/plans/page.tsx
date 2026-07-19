import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import {
  BILLING_PLANS,
  billingPeriodLabel,
  checkoutConfigured,
  money,
  type BillingPeriod,
  type PaidPlanTier
} from "@/lib/billing";
import { requireWorkspace } from "@/lib/auth";
import { PLAN_LIMITS, formatPlanLimit } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Plans" };

type SearchParams = { period?: string; error?: string };

function planUsageLine(planTier: PaidPlanTier): string {
  const limits = PLAN_LIMITS[planTier];
  return `${formatPlanLimit(limits.contacts)} Contacts · ${formatPlanLimit(limits.mixes)} active Mixes`;
}

export default async function PlansPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace, membership, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  const billingPeriod: BillingPeriod = params.period?.toLowerCase() === "monthly" ? "MONTHLY" : "ANNUAL";
  const subscription = workspace.stripeSubscriptionId
    ? await prisma.subscription.findUnique({ where: { stripeSubscriptionId: workspace.stripeSubscriptionId } })
    : null;
  const activeStripeSubscription = Boolean(
    workspace.stripeSubscriptionId && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(workspace.subscriptionStatus)
  );
  const canManageBilling = !impersonation && membership.role !== "MEMBER";
  const configured = checkoutConfigured();

  return (
    <div className="page billing-plans-page">
      <header className="page-header">
        <div><h1>Choose your plan</h1><p>Keep every record you create. Paid plans expand the number of active workflows and unlock AI and Google Contacts.</p></div>
        <div className="page-actions"><Link className="button" href="/account">My Account</Link></div>
      </header>

      {params.error && <Notice type="error">{params.error}</Notice>}
      {impersonation && <Notice type="info">Billing changes are unavailable during a view-only administrator support session.</Notice>}
      {!canManageBilling && !impersonation && <Notice type="info">Only a workspace owner or administrator can change the subscription.</Notice>}
      {!configured && <Notice type="info">Checkout is not enabled in this environment. Add the Stripe secret key and all four approved Price IDs on the server.</Notice>}
      {workspace.subscriptionStatus === "PAST_DUE" && <Notice type="error">A payment needs attention. Open the Stripe billing portal to update the payment method.</Notice>}

      <nav className="billing-period-toggle" aria-label="Billing period">
        <Link className={billingPeriod === "ANNUAL" ? "active" : ""} href="/plans?period=annual">Annual <span>Best value</span></Link>
        <Link className={billingPeriod === "MONTHLY" ? "active" : ""} href="/plans?period=monthly">Monthly</Link>
      </nav>

      <div className="billing-plan-grid">
        <article className={`billing-plan-card ${workspace.planTier === "FREE" ? "current" : ""}`}>
          <div className="billing-plan-heading"><div><h2>Free</h2><p>Build a focused relationship routine before committing to a paid plan.</p></div>{workspace.planTier === "FREE" && <span className="status-pill done">Current</span>}</div>
          <div className="billing-price"><strong>$0</strong><span>forever</span></div>
          <p className="billing-plan-usage">100 Contacts · 3 active Mixes</p>
          <ul><li>3 Contact Groups</li><li>3 custom Important Date Types</li><li>Platform and Community Mix Templates</li><li>Native SMS, email, and phone actions</li></ul>
          <Link className="button" href="/jumps">Continue with Free</Link>
        </article>

        {(Object.keys(BILLING_PLANS) as PaidPlanTier[]).map((planTier) => {
          const plan = BILLING_PLANS[planTier];
          const annual = billingPeriod === "ANNUAL";
          const amount = annual ? plan.annualAmountCents : plan.monthlyAmountCents;
          const equivalent = annual ? plan.annualMonthlyEquivalentCents : plan.monthlyAmountCents;
          const current = workspace.planTier === planTier && activeStripeSubscription;
          return (
            <article className={`billing-plan-card ${planTier === "PLUS" ? "featured" : ""} ${current ? "current" : ""}`} key={planTier}>
              <div className="billing-plan-heading">
                <div><h2>{plan.name}</h2><p>{plan.description}</p></div>
                {current ? <span className="status-pill done">Current</span> : planTier === "PLUS" ? <span className="plan-pill">Popular</span> : null}
              </div>
              <div className="billing-price"><strong>{money(equivalent)}</strong><span>/ month{annual ? " equivalent" : ""}</span></div>
              {annual && <p className="billing-annual-total">{money(amount)} billed once per year</p>}
              <p className="billing-plan-usage">{planUsageLine(planTier)}</p>
              <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>

              {activeStripeSubscription ? (
                <form action="/api/billing/portal" method="post"><button className="button primary" type="submit" disabled={!canManageBilling}>Manage plan in Stripe</button></form>
              ) : (
                <form action="/api/billing/checkout" method="post">
                  <input type="hidden" name="planTier" value={planTier} />
                  <input type="hidden" name="billingPeriod" value={billingPeriod} />
                  <button className="button primary" type="submit" disabled={!configured || !canManageBilling}>
                    Choose {plan.name} · {billingPeriodLabel(billingPeriod)}
                  </button>
                </form>
              )}
            </article>
          );
        })}
      </div>

      {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
        <Notice type="info">Your current paid plan is scheduled to end on {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(subscription.currentPeriodEnd)}. You can resume it from the Stripe billing portal.</Notice>
      )}
      <p className="billing-policy-note">Plan changes and cancellations are managed in Stripe. Jump in the Mix updates access only after a server-verified Checkout Session or signed Stripe webhook.</p>
    </div>
  );
}
