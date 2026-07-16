import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncStripeSubscription, type StripeSubscription } from "../src/lib/billing-service";
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";

const originalPrices = {
  plusMonthly: env.stripePlusMonthlyPriceId,
  plusAnnual: env.stripePlusAnnualPriceId,
  proMonthly: env.stripeProMonthlyPriceId,
  proAnnual: env.stripeProAnnualPriceId
};

function subscription(input: {
  id: string;
  workspaceId: string;
  customerId: string;
  priceId: string;
  status: string;
  planTier?: string;
  billingPeriod?: string;
  cancelAtPeriodEnd?: boolean;
}): StripeSubscription {
  return {
    id: input.id,
    object: "subscription",
    customer: input.customerId,
    status: input.status,
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    metadata: {
      workspace_id: input.workspaceId,
      ...(input.planTier ? { plan_tier: input.planTier } : {}),
      ...(input.billingPeriod ? { billing_period: input.billingPeriod } : {})
    },
    items: {
      data: [{
        id: `${input.id}_item`,
        current_period_start: 1_900_000_000,
        current_period_end: 1_902_678_400,
        price: { id: input.priceId, recurring: { interval: input.billingPeriod === "ANNUAL" ? "year" : "month" } }
      }]
    }
  };
}

describe.sequential("Stripe subscription reconciliation", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    env.stripePlusMonthlyPriceId = `price_plus_monthly_${suffix}`;
    env.stripePlusAnnualPriceId = `price_plus_annual_${suffix}`;
    env.stripeProMonthlyPriceId = `price_pro_monthly_${suffix}`;
    env.stripeProAnnualPriceId = `price_pro_annual_${suffix}`;

    const user = await prisma.user.create({
      data: { email: `billing-${suffix}@example.com`, name: "Billing Owner", passwordHash: "test-only" }
    });
    const workspace = await prisma.workspace.create({
      data: {
        name: "Billing Test",
        slug: `billing-${suffix}`,
        ownerId: user.id,
        profile: { create: { timezone: "America/Los_Angeles" } }
      }
    });
    ids.user = user.id;
    ids.workspace = workspace.id;
    ids.customer = `cus_${suffix}`;
    ids.subscription = `sub_${suffix}`;
  });

  afterAll(async () => {
    if (ids.workspace) await prisma.workspace.deleteMany({ where: { id: ids.workspace } });
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
    env.stripePlusMonthlyPriceId = originalPrices.plusMonthly;
    env.stripePlusAnnualPriceId = originalPrices.plusAnnual;
    env.stripeProMonthlyPriceId = originalPrices.proMonthly;
    env.stripeProAnnualPriceId = originalPrices.proAnnual;
  });

  it("activates Plus from a recognized Stripe Price and item-level period dates", async () => {
    const result = await syncStripeSubscription({
      subscription: subscription({
        id: ids.subscription,
        workspaceId: ids.workspace,
        customerId: ids.customer,
        priceId: env.stripePlusMonthlyPriceId,
        status: "active",
        planTier: "PLUS",
        billingPeriod: "MONTHLY"
      }),
      eventType: "customer.subscription.created"
    });
    expect(result).toEqual({ workspaceId: ids.workspace, planTier: "PLUS", status: "ACTIVE" });

    const [workspace, saved] = await Promise.all([
      prisma.workspace.findUniqueOrThrow({ where: { id: ids.workspace } }),
      prisma.subscription.findUniqueOrThrow({ where: { stripeSubscriptionId: ids.subscription } })
    ]);
    expect(workspace).toMatchObject({
      planTier: "PLUS",
      subscriptionStatus: "ACTIVE",
      stripeCustomerId: ids.customer,
      stripeSubscriptionId: ids.subscription,
      cancelAtPeriodEnd: false
    });
    expect(workspace.currentPeriodEnd?.toISOString()).toBe(new Date(1_902_678_400 * 1000).toISOString());
    expect(saved).toMatchObject({
      workspaceId: ids.workspace,
      stripePriceId: env.stripePlusMonthlyPriceId,
      planTier: "PLUS",
      billingPeriod: "MONTHLY",
      status: "ACTIVE"
    });
  });

  it("retains paid access during payment recovery and records cancellation intent", async () => {
    const result = await syncStripeSubscription({
      subscription: subscription({
        id: ids.subscription,
        workspaceId: ids.workspace,
        customerId: ids.customer,
        priceId: env.stripePlusMonthlyPriceId,
        status: "past_due",
        planTier: "PLUS",
        billingPeriod: "MONTHLY",
        cancelAtPeriodEnd: true
      }),
      eventType: "invoice.payment_failed",
      statusOverride: "PAST_DUE"
    });
    expect(result.planTier).toBe("PLUS");
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ids.workspace } });
    expect(workspace).toMatchObject({ planTier: "PLUS", subscriptionStatus: "PAST_DUE", cancelAtPeriodEnd: true });
  });

  it("returns a canceled subscription to Free without deleting subscription history", async () => {
    const result = await syncStripeSubscription({
      subscription: subscription({
        id: ids.subscription,
        workspaceId: ids.workspace,
        customerId: ids.customer,
        priceId: env.stripePlusMonthlyPriceId,
        status: "canceled",
        planTier: "PLUS",
        billingPeriod: "MONTHLY"
      }),
      eventType: "customer.subscription.deleted"
    });
    expect(result).toEqual({ workspaceId: ids.workspace, planTier: "FREE", status: "CANCELED" });
    expect(await prisma.workspace.findUniqueOrThrow({ where: { id: ids.workspace } })).toMatchObject({
      planTier: "FREE",
      subscriptionStatus: "CANCELED"
    });
    expect(await prisma.subscription.count({ where: { workspaceId: ids.workspace } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { workspaceId: ids.workspace, action: "billing.subscription.sync" } })).toBe(3);
  });

  it("rejects an unknown Price even when subscription metadata claims a paid tier", async () => {
    const unknown = subscription({
      id: `sub_unknown_${suffix}`,
      workspaceId: ids.workspace,
      customerId: ids.customer,
      priceId: `price_unknown_${suffix}`,
      status: "active",
      planTier: "PRO",
      billingPeriod: "ANNUAL"
    });
    await expect(syncStripeSubscription({ subscription: unknown, eventType: "customer.subscription.created" })).rejects.toThrow(/allowlist/i);
    expect(await prisma.subscription.count({ where: { stripeSubscriptionId: unknown.id } })).toBe(0);
  });
});
