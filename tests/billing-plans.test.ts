import { describe, expect, it } from "vitest";
import { billingConfigurationIssues, billingReady } from "@/lib/billing-config";
import { BillingUnavailableError, effectiveSubscription, paidPlanFor, priceLookupKey, priceMatchesPlan, stripePriceId, type SubscriptionFacts } from "@/lib/billing-plans";

const price = (overrides: Record<string, unknown> = {}) => ({ id: "price_1", active: true, currency: "usd", type: "recurring" as const, unit_amount: 1500, lookup_key: "jitm_plus_month",
  recurring: { interval: "month" as const, interval_count: 1, usage_type: "licensed" as const }, ...overrides });
const subscription = (status: string, lookupKey: string | null, overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts => ({ id: `sub_${status}_${lookupKey}`, status, created: 1, cancelAt: null, items: [{ lookupKey, currentPeriodEnd: 1_900_000_000 }], ...overrides });

describe("plan prices in Stripe", () => {
  it("maps each paid plan and interval to one lookup key and back", () => {
    expect([priceLookupKey("PLUS", "MONTH"), priceLookupKey("PLUS", "YEAR"), priceLookupKey("PRO", "MONTH"), priceLookupKey("PRO", "YEAR")]).toEqual(["jitm_plus_month", "jitm_plus_year", "jitm_pro_month", "jitm_pro_year"]);
    expect(paidPlanFor("jitm_pro_year")).toEqual({ plan: "PRO", interval: "YEAR" });
    expect(paidPlanFor("someone_elses_price")).toBeNull();
  });

  it("sells a price only when it is exactly the plan's price", () => {
    expect(priceMatchesPlan(price(), "PLUS", "MONTH")).toBe(true);
    expect(priceMatchesPlan(price({ lookup_key: "jitm_plus_year", unit_amount: 14400, recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } }), "PLUS", "YEAR")).toBe(true);
    for (const changed of [{ unit_amount: 1400 }, { currency: "eur" }, { active: false }, { type: "one_time", recurring: null }, { lookup_key: "jitm_pro_month" },
      { recurring: { interval: "month", interval_count: 3, usage_type: "licensed" } }, { recurring: { interval: "month", interval_count: 1, usage_type: "metered" } }]) {
      expect(priceMatchesPlan(price(changed), "PLUS", "MONTH")).toBe(false);
    }
  });

  it("refuses to sell a missing or edited price, and caches a verified one", async () => {
    let calls = 0;
    const stripe = (data: unknown[]) => ({ prices: { list: async () => { calls += 1; return { data }; } } }) as never;
    await expect(stripePriceId(stripe([]), "PRO", "MONTH", 0)).rejects.toBeInstanceOf(BillingUnavailableError);
    await expect(stripePriceId(stripe([price({ lookup_key: "jitm_pro_month", unit_amount: 2500 })]), "PRO", "MONTH", 0)).rejects.toBeInstanceOf(BillingUnavailableError);
    const good = stripe([price({ id: "price_pro", lookup_key: "jitm_pro_month", unit_amount: 2900 })]);
    calls = 0;
    expect(await stripePriceId(good, "PRO", "MONTH", 1_000)).toBe("price_pro");
    expect(await stripePriceId(good, "PRO", "MONTH", 2_000)).toBe("price_pro");
    expect(calls).toBe(1);
  });
});

describe("the plan a customer's subscriptions give", () => {
  it("is Free without a subscription that still grants a plan", () => {
    expect(effectiveSubscription([])).toBeNull();
    for (const status of ["canceled", "incomplete", "incomplete_expired", "unpaid", "paused"]) expect(effectiveSubscription([subscription(status, "jitm_plus_month")])).toBeNull();
    expect(effectiveSubscription([subscription("active", "not_ours")])).toBeNull();
  });

  it("keeps a past-due plan while Stripe retries the payment, and reports when it ends", () => {
    expect(effectiveSubscription([subscription("past_due", "jitm_plus_year", { cancelAt: 1_950_000_000 })])).toMatchObject({ plan: "PLUS", interval: "YEAR", status: "past_due", currentPeriodEnd: 1_900_000_000, cancelAt: 1_950_000_000 });
  });

  it("takes the highest plan when a duplicate checkout left two subscriptions", () => {
    expect(effectiveSubscription([subscription("active", "jitm_plus_month"), subscription("trialing", "jitm_pro_month"), subscription("canceled", "jitm_pro_year")])).toMatchObject({ plan: "PRO", interval: "MONTH" });
  });
});

const settings = (values: Record<string, string>) => ({ NODE_ENV: "test", ...values }) as NodeJS.ProcessEnv;

describe("billing configuration", () => {
  it("is off, and asks for nothing, until BILLING_ENABLED is true", () => {
    expect(billingConfigurationIssues(settings({ NODE_ENV: "production" }))).toEqual([]);
    expect(billingReady(settings({ BILLING_ENABLED: "false", STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc" }))).toBe(false);
  });

  it("needs both Stripe secrets once it is on, and a live key in hosted production", () => {
    expect(billingConfigurationIssues(settings({ BILLING_ENABLED: "true" }))).toHaveLength(2);
    const test = settings({ BILLING_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc" });
    expect(billingConfigurationIssues(test)).toEqual([]);
    expect(billingReady(test)).toBe(true);
    const hosted = { ...test, NODE_ENV: "production", APP_URL: "https://jumpinthemix.com" } as NodeJS.ProcessEnv;
    expect(billingConfigurationIssues(hosted)).toEqual(["STRIPE_SECRET_KEY must be a live key when billing is on in hosted production"]);
    expect(billingConfigurationIssues({ ...hosted, STRIPE_SECRET_KEY: "rk_live_abc" })).toEqual([]);
    // A production build served locally, as in the release checks, may use a test key.
    expect(billingConfigurationIssues({ ...test, NODE_ENV: "production", APP_URL: "http://127.0.0.1:3300" })).toEqual([]);
  });
});
