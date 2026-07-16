import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BILLING_PLANS,
  billingPriceId,
  billingSelectionForPriceId,
  effectivePlanTier,
  mapStripeSubscriptionStatus,
  money,
  subscriptionHasPaidAccess
} from "../src/lib/billing";
import { env } from "../src/lib/env";

const originals = {
  plusMonthly: env.stripePlusMonthlyPriceId,
  plusAnnual: env.stripePlusAnnualPriceId,
  proMonthly: env.stripeProMonthlyPriceId,
  proAnnual: env.stripeProAnnualPriceId
};

describe("billing catalog", () => {
  beforeAll(() => {
    env.stripePlusMonthlyPriceId = "price_plus_monthly";
    env.stripePlusAnnualPriceId = "price_plus_annual";
    env.stripeProMonthlyPriceId = "price_pro_monthly";
    env.stripeProAnnualPriceId = "price_pro_annual";
  });

  afterAll(() => {
    env.stripePlusMonthlyPriceId = originals.plusMonthly;
    env.stripePlusAnnualPriceId = originals.plusAnnual;
    env.stripeProMonthlyPriceId = originals.proMonthly;
    env.stripeProAnnualPriceId = originals.proAnnual;
  });

  it("maps only the four approved Stripe Price IDs", () => {
    expect(billingPriceId("PLUS", "MONTHLY")).toBe("price_plus_monthly");
    expect(billingPriceId("PRO", "ANNUAL")).toBe("price_pro_annual");
    expect(billingSelectionForPriceId("price_plus_annual")).toEqual({ planTier: "PLUS", billingPeriod: "ANNUAL", priceId: "price_plus_annual" });
    expect(() => billingSelectionForPriceId("price_unknown")).toThrow(/allowlist/i);
  });

  it("uses the approved monthly and annual display pricing", () => {
    expect(BILLING_PLANS.PLUS.monthlyAmountCents).toBe(1500);
    expect(BILLING_PLANS.PLUS.annualAmountCents).toBe(14400);
    expect(BILLING_PLANS.PRO.monthlyAmountCents).toBe(1800);
    expect(BILLING_PLANS.PRO.annualAmountCents).toBe(18000);
    expect(money(14400)).toBe("$144");
  });

  it("maps Stripe lifecycle statuses into application access states", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("ACTIVE");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("TRIALING");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeSubscriptionStatus("paused")).toBe("INCOMPLETE");
    expect(mapStripeSubscriptionStatus("incomplete")).toBe("INCOMPLETE");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("UNPAID");
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("CANCELED");
  });

  it("keeps paid access during recovery but returns inactive subscriptions to Free", () => {
    expect(subscriptionHasPaidAccess("ACTIVE")).toBe(true);
    expect(subscriptionHasPaidAccess("TRIALING")).toBe(true);
    expect(subscriptionHasPaidAccess("PAST_DUE")).toBe(true);
    expect(effectivePlanTier("PLUS", "PAST_DUE")).toBe("PLUS");
    expect(effectivePlanTier("PRO", "CANCELED")).toBe("FREE");
    expect(effectivePlanTier("PLUS", "UNPAID")).toBe("FREE");
    expect(effectivePlanTier("PLUS", "INCOMPLETE")).toBe("FREE");
  });
});
