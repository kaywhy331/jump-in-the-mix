import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { requireWorkspace } from "@/lib/auth";
import { billingView, confirmCheckoutReturn, type BillingView } from "@/lib/billing-account";
import { openBillingPortalAction, startCheckoutAction } from "@/lib/billing-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDate, type DisplayFormatPreferences } from "@/lib/format";
import { PLANS, formatDollars, planById } from "@/lib/plans";

export const metadata: Metadata = { title: "Plan and billing" };

type SearchParams = { checkout?: string; error?: string; at?: string; sig?: string };

function planLine(view: BillingView, preferences: DisplayFormatPreferences): string {
  const plan = planById(view.plan);
  const limits = `Up to ${plan.people.toLocaleString("en-US")} people with follow-ups and ${plan.activeMixes} active Mixes.`;
  if (view.plan === "FREE") return `Free. ${limits}`;
  const price = view.interval === "YEAR" ? `${formatDollars(plan.yearlyCents!)} a year` : `${formatDollars(plan.monthlyCents)} a month`;
  const when = view.cancelAt ? ` It ends on ${formatDate(view.cancelAt, preferences)} and won’t renew.`
    : view.status === "past_due" ? " The last payment didn’t go through. Update your card with Manage billing."
      : view.currentPeriodEnd ? ` It renews on ${formatDate(view.currentPeriodEnd, preferences)}.` : "";
  return `${plan.name}, ${price}.${when} ${limits}`;
}

// Kevin's plans (docs/PRICING_DECISION_2026-09-29.md). Until billing starts, this page only explains the free beta.
export default async function BillingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { session, user, workspace, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  const checkout = query.checkout ?? "";
  const confirmation = checkout.startsWith("cs_") && !impersonation ? await confirmCheckoutReturn(workspace.id, checkout) : null;
  const [view, preferences] = await Promise.all([billingView(workspace.id), displayPreferencesForUser(user.id)]);
  const canChange = !impersonation && workspace.ownerId === user.id;
  return <div className="page page--form billing-page">
    <BackLink href="/account" label="My account" />
    <header className="page-header"><div><h1>Plan and billing</h1><p>Your plan and what it includes.</p></div></header>
    <UrlErrorNotice params={query} viewer={session} />
    {confirmation === "confirmed" && <Notice type="success">Thank you. You’re on {planById(view.plan).name}.</Notice>}
    {confirmation === "pending" && <Notice type="info">Stripe is still confirming your payment. Your plan updates here once it does.</Notice>}
    {checkout === "cancelled" && <Notice type="info">Checkout was cancelled. Nothing was charged.</Notice>}
    {checkout === "already" && <Notice type="info">This account already has a paid plan. Change it with Manage billing.</Notice>}
    {!view.on ? <section className="card form-stack">
      <h2>Free during the beta</h2>
      <p>Paid plans haven’t started yet, so nothing is charged and no plan limits apply. When they start, the plans are Free ({formatDollars(0)}), Plus ({formatDollars(planById("PLUS").monthlyCents)} a month or {formatDollars(planById("PLUS").yearlyCents!)} a year) and Pro ({formatDollars(planById("PRO").monthlyCents)} a month or {formatDollars(planById("PRO").yearlyCents!)} a year).</p>
      <p><Link className="inline-action" href="/pricing">See what each plan includes</Link></p>
    </section> : <>
      <section className="card form-stack">
        <h2>Your plan</h2>
        <p>{planLine(view, preferences)}</p>
        {view.plan !== "FREE" && view.hasCustomer && <form action={openBillingPortalAction}><FormSubmitButton label="Manage billing" pendingLabel="Opening billing…" disabled={!canChange} /></form>}
        {view.plan !== "FREE" && <p className="muted-copy">Manage billing opens Stripe’s billing page, where you can update your card, see invoices, change your plan or cancel.</p>}
      </section>
      {view.plan === "FREE" && <section className="card form-stack">
        <h2>Choose a paid plan</h2>
        <p>You pay on Stripe’s checkout page; your card details never reach Jump in the Mix.</p>
        <div className="billing-plan-options">{PLANS.filter(plan => plan.id !== "FREE").map(plan => <form key={plan.id} action={startCheckoutAction} className="billing-plan-option" aria-labelledby={`billing-plan-${plan.id}`}>
          <input type="hidden" name="plan" value={plan.id} />
          <h3 id={`billing-plan-${plan.id}`}>{plan.name}</h3>
          <p>Up to {plan.people.toLocaleString("en-US")} people with follow-ups and {plan.activeMixes} active Mixes.</p>
          <div className="form-actions">
            <FormSubmitButton name="interval" value="MONTH" label={`${formatDollars(plan.monthlyCents)} a month`} pendingLabel="Opening checkout…" disabled={!canChange} />
            <FormSubmitButton name="interval" value="YEAR" label={`${formatDollars(plan.yearlyCents!)} a year`} pendingLabel="Opening checkout…" className="button" disabled={!canChange} />
          </div>
        </form>)}</div>
        <p className="muted-copy">Prices are in US dollars. <Link className="inline-action" href="/pricing">Compare the plans</Link></p>
      </section>}
    </>}
  </div>;
}
