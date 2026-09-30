import { billingReady } from "@/lib/billing-config";
import { syncCustomerBilling } from "@/lib/billing-sync";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe-client";
import type { PlanId } from "@/lib/plans";

export type BillingView = {
  on: boolean; plan: PlanId; interval: "MONTH" | "YEAR" | null; status: string | null;
  currentPeriodEnd: Date | null; cancelAt: Date | null; hasCustomer: boolean;
};

/** The account's plan as the app last confirmed it with Stripe. While billing is off, every account is on the free beta. */
export async function billingView(workspaceId: string): Promise<BillingView> {
  const row = await prisma.workspaceBilling.findUnique({ where: { workspaceId } });
  const on = billingReady();
  return { on, plan: on ? row?.plan ?? "FREE" : "FREE", interval: row?.interval ?? null, status: row?.subscriptionStatus ?? null,
    currentPeriodEnd: row?.currentPeriodEnd ?? null, cancelAt: row?.cancelAt ?? null, hasCustomer: Boolean(row?.stripeCustomerId) };
}

/**
 * When Stripe's checkout sends the owner back, confirm that the checkout belongs to this account and store the plan
 * straight away, instead of waiting for the webhook. The return address alone never grants a plan.
 */
export async function confirmCheckoutReturn(workspaceId: string, sessionId: string): Promise<"confirmed" | "pending" | null> {
  if (!billingReady() || !/^cs_(test|live)_\w+$/.test(sessionId)) return null;
  try {
    const stripe = stripeClient();
    const [checkout, row] = await Promise.all([stripe.checkout.sessions.retrieve(sessionId), prisma.workspaceBilling.findUnique({ where: { workspaceId }, select: { stripeCustomerId: true } })]);
    const customer = typeof checkout.customer === "string" ? checkout.customer : checkout.customer?.id;
    if (checkout.client_reference_id !== workspaceId || !customer || customer !== row?.stripeCustomerId) return null;
    const synced = await syncCustomerBilling(prisma, stripe, customer);
    return synced && synced.plan !== "FREE" ? "confirmed" : "pending";
  } catch {
    return "pending";
  }
}
