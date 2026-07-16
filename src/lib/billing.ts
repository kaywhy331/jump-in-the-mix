import type { PlanTier, SubscriptionStatus } from "@/generated/prisma/client";
import { env } from "@/lib/env";

export type BillingPeriod = "MONTHLY" | "ANNUAL";
export type PaidPlanTier = Exclude<PlanTier, "FREE">;

export type BillingPlanDetails = {
  name: string;
  description: string;
  monthlyAmountCents: number;
  annualAmountCents: number;
  annualMonthlyEquivalentCents: number;
  features: string[];
};

export const BILLING_PLANS: Record<PaidPlanTier, BillingPlanDetails> = {
  PLUS: {
    name: "Plus",
    description: "For entrepreneurs building a consistent relationship routine.",
    monthlyAmountCents: 1500,
    annualAmountCents: 14400,
    annualMonthlyEquivalentCents: 1200,
    features: [
      "1,000 active Contacts",
      "10 Contact Groups",
      "10 custom Jump Date Types",
      "10 active Mixes",
      "AI Mix Wizard",
      "Google Contacts sync",
      "Share up to 3 Community Mixes"
    ]
  },
  PRO: {
    name: "Pro",
    description: "For growing businesses managing a broader relationship network.",
    monthlyAmountCents: 1800,
    annualAmountCents: 18000,
    annualMonthlyEquivalentCents: 1500,
    features: [
      "5,000 active Contacts",
      "Unlimited Contact Groups",
      "Unlimited custom Jump Date Types",
      "Unlimited active Mixes",
      "AI Mix Wizard",
      "Google Contacts sync",
      "Share up to 10 Community Mixes",
      "50 Ringless Voicemail scripts per month"
    ]
  }
};

export function isPaidPlanTier(value: unknown): value is PaidPlanTier {
  return value === "PLUS" || value === "PRO";
}

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === "MONTHLY" || value === "ANNUAL";
}

export function planRank(planTier: PlanTier): number {
  return planTier === "PRO" ? 2 : planTier === "PLUS" ? 1 : 0;
}

export function isPlanDowngrade(from: PlanTier, to: PlanTier): boolean {
  return planRank(to) < planRank(from);
}

export function billingPriceId(planTier: PaidPlanTier, billingPeriod: BillingPeriod): string {
  if (planTier === "PLUS") {
    return billingPeriod === "MONTHLY" ? env.stripePlusMonthlyPriceId : env.stripePlusAnnualPriceId;
  }
  return billingPeriod === "MONTHLY" ? env.stripeProMonthlyPriceId : env.stripeProAnnualPriceId;
}

export function billingSelectionForPriceId(priceId: string | null | undefined): {
  planTier: PaidPlanTier;
  billingPeriod: BillingPeriod;
  priceId: string;
} | null {
  if (!priceId) return null;
  const candidates: Array<{ planTier: PaidPlanTier; billingPeriod: BillingPeriod; priceId: string }> = [
    { planTier: "PLUS", billingPeriod: "MONTHLY", priceId: env.stripePlusMonthlyPriceId },
    { planTier: "PLUS", billingPeriod: "ANNUAL", priceId: env.stripePlusAnnualPriceId },
    { planTier: "PRO", billingPeriod: "MONTHLY", priceId: env.stripeProMonthlyPriceId },
    { planTier: "PRO", billingPeriod: "ANNUAL", priceId: env.stripeProAnnualPriceId }
  ];
  const selection = candidates.find((candidate) => candidate.priceId && candidate.priceId === priceId);
  if (!selection) throw new Error(`Stripe Price ${priceId} is not in the Jump in the Mix billing allowlist.`);
  return selection;
}

export function billingConfigurationIssues(): string[] {
  const issues: string[] = [];
  if (!env.stripeSecretKey) issues.push("STRIPE_SECRET_KEY");
  if (!env.stripeWebhookSecret) issues.push("STRIPE_WEBHOOK_SECRET");
  if (!env.stripePlusMonthlyPriceId) issues.push("STRIPE_PLUS_MONTHLY_PRICE_ID");
  if (!env.stripePlusAnnualPriceId) issues.push("STRIPE_PLUS_ANNUAL_PRICE_ID");
  if (!env.stripeProMonthlyPriceId) issues.push("STRIPE_PRO_MONTHLY_PRICE_ID");
  if (!env.stripeProAnnualPriceId) issues.push("STRIPE_PRO_ANNUAL_PRICE_ID");
  return issues;
}

export function checkoutConfigured(): boolean {
  return Boolean(
    env.stripeSecretKey
      && env.stripePlusMonthlyPriceId
      && env.stripePlusAnnualPriceId
      && env.stripeProMonthlyPriceId
      && env.stripeProAnnualPriceId
  );
}

export function webhookConfigured(): boolean {
  return Boolean(env.stripeSecretKey && env.stripeWebhookSecret);
}

export function mapStripeSubscriptionStatus(value: string | null | undefined): SubscriptionStatus {
  switch ((value ?? "").toLowerCase()) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "paused":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "incomplete":
      return "INCOMPLETE";
    case "canceled":
    case "incomplete_expired":
    default:
      return "CANCELED";
  }
}

export function subscriptionHasPaidAccess(status: SubscriptionStatus): boolean {
  return status === "ACTIVE" || status === "TRIALING" || status === "PAST_DUE";
}

export function effectivePlanTier(planTier: PaidPlanTier, status: SubscriptionStatus): PlanTier {
  return subscriptionHasPaidAccess(status) ? planTier : "FREE";
}

export function money(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amountCents / 100);
}

export function billingPeriodLabel(value: string | null | undefined): string {
  return value === "ANNUAL" ? "Annual" : "Monthly";
}

export function subscriptionStatusLabel(value: SubscriptionStatus): string {
  return value.toLowerCase().replaceAll("_", " ");
}
