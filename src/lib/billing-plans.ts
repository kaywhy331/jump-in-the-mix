import type Stripe from "stripe";
import { planById, type PlanId } from "@/lib/plans";

export type PaidPlanId = Exclude<PlanId, "FREE">;
export type BillingIntervalId = "MONTH" | "YEAR";

// Stripe prices are found by these lookup keys (scripts/stripe-setup-prices.mjs creates them), so no price ids are configured.
const LOOKUP_KEYS: Record<PaidPlanId, Record<BillingIntervalId, string>> = {
  PLUS: { MONTH: "jitm_plus_month", YEAR: "jitm_plus_year" },
  PRO: { MONTH: "jitm_pro_month", YEAR: "jitm_pro_year" }
};

export function priceLookupKey(plan: PaidPlanId, interval: BillingIntervalId): string {
  return LOOKUP_KEYS[plan][interval];
}

export function paidPlanFor(lookupKey: string | null | undefined): { plan: PaidPlanId; interval: BillingIntervalId } | null {
  for (const plan of ["PLUS", "PRO"] as const) for (const interval of ["MONTH", "YEAR"] as const) {
    if (LOOKUP_KEYS[plan][interval] === lookupKey) return { plan, interval };
  }
  return null;
}

export function planAmountCents(plan: PaidPlanId, interval: BillingIntervalId): number {
  const catalogue = planById(plan);
  return interval === "MONTH" ? catalogue.monthlyCents : catalogue.yearlyCents!;
}

type PriceFacts = Pick<Stripe.Price, "active" | "currency" | "type" | "unit_amount" | "lookup_key"> & { recurring: Pick<Stripe.Price.Recurring, "interval" | "interval_count" | "usage_type"> | null };

/** A Stripe price is sold only when it is exactly the plan's price, so a price edited in Stripe can never be charged. */
export function priceMatchesPlan(price: PriceFacts, plan: PaidPlanId, interval: BillingIntervalId): boolean {
  return price.active && price.currency === "usd" && price.type === "recurring" && price.lookup_key === priceLookupKey(plan, interval)
    && price.unit_amount === planAmountCents(plan, interval) && price.recurring?.interval === (interval === "MONTH" ? "month" : "year")
    && price.recurring.interval_count === 1 && price.recurring.usage_type === "licensed";
}

export class BillingUnavailableError extends Error {}

const PRICE_CACHE_MS = 10 * 60_000;
const priceCache = new Map<string, { id: string; at: number }>();

export async function stripePriceId(stripe: Pick<Stripe, "prices">, plan: PaidPlanId, interval: BillingIntervalId, now = Date.now()): Promise<string> {
  const key = priceLookupKey(plan, interval), cached = priceCache.get(key);
  if (cached && now - cached.at < PRICE_CACHE_MS) return cached.id;
  const prices = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 2 });
  const price = prices.data.length === 1 ? prices.data[0] : null;
  if (!price || !priceMatchesPlan(price, plan, interval)) throw new BillingUnavailableError(`The Stripe price ${key} is missing or does not match the plan.`);
  priceCache.set(key, { id: price.id, at: now });
  return price.id;
}

// Stripe keeps retrying a failed renewal while a subscription is past due, so the plan continues until Stripe gives up.
const ACCESS_STATUSES = new Set(["active", "trialing", "past_due"]);

export type SubscriptionFacts = { id: string; status: string; created: number; cancelAt: number | null; items: Array<{ lookupKey: string | null; currentPeriodEnd: number | null }> };
export type PaidSubscription = { id: string; status: string; plan: PaidPlanId; interval: BillingIntervalId; currentPeriodEnd: number | null; cancelAt: number | null };

export function subscriptionFacts(subscription: Stripe.Subscription): SubscriptionFacts {
  return { id: subscription.id, status: subscription.status, created: subscription.created, cancelAt: subscription.cancel_at,
    items: subscription.items.data.map(item => ({ lookupKey: item.price.lookup_key, currentPeriodEnd: item.current_period_end ?? null })) };
}

/**
 * The plan a customer's subscriptions give: the highest paid plan among those that still grant it. A duplicate
 * subscription (two checkouts finished in two tabs) never lowers the plan; the operator refunds it in Stripe.
 */
export function effectiveSubscription(subscriptions: SubscriptionFacts[]): PaidSubscription | null {
  const rank = { PLUS: 1, PRO: 2 } as const;
  let best: PaidSubscription | null = null;
  for (const subscription of subscriptions) {
    if (!ACCESS_STATUSES.has(subscription.status)) continue;
    for (const item of subscription.items) {
      const paid = paidPlanFor(item.lookupKey);
      if (!paid) continue;
      const candidate = { id: subscription.id, status: subscription.status, ...paid, currentPeriodEnd: item.currentPeriodEnd, cancelAt: subscription.cancelAt };
      if (!best || rank[candidate.plan] > rank[best.plan]) best = candidate;
    }
  }
  return best;
}
