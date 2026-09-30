"use server";

import { redirect } from "next/navigation";
import { billingReady } from "@/lib/billing-config";
import { effectiveSubscription, stripePriceId, subscriptionFacts, type BillingIntervalId, type PaidPlanId } from "@/lib/billing-plans";
import { syncCustomerBilling } from "@/lib/billing-sync";
import { env } from "@/lib/env";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe-client";
import { requireWritableWorkspace } from "@/lib/writable-workspace";

const BILLING_PATH = "/account/billing";
const UNAVAILABLE = "Payments aren’t available right now. Nothing was charged. Try again in a few minutes.";

function refuse(message: string, viewer: ErrorViewer): never {
  redirect(withViewerError(BILLING_PATH, message, viewer));
}

async function owner() {
  const context = await requireWritableWorkspace(refuse);
  if (context.workspace.ownerId !== context.user.id) refuse("Only the account owner can change the plan.", context.session);
  if (!billingReady()) refuse("Paid plans haven’t started yet.", context.session);
  return context;
}

/** Opens Stripe's hosted checkout for a paid plan. The plan changes only when Stripe confirms the subscription. */
export async function startCheckoutAction(formData: FormData): Promise<void> {
  const { session, workspace, user } = await owner();
  const plan = String(formData.get("plan") ?? ""), interval = String(formData.get("interval") ?? "");
  if ((plan !== "PLUS" && plan !== "PRO") || (interval !== "MONTH" && interval !== "YEAR")) refuse("Choose a plan and how often to pay.", session);
  let destination: string;
  try {
    const stripe = stripeClient();
    const price = await stripePriceId(stripe, plan as PaidPlanId, interval as BillingIntervalId);
    let customerId = (await prisma.workspaceBilling.findUnique({ where: { workspaceId: workspace.id }, select: { stripeCustomerId: true } }))?.stripeCustomerId;
    if (!customerId) {
      // The key makes a retry within a day reuse the same customer if saving it below failed.
      const customer = await stripe.customers.create({ email: user.email, name: user.name || undefined, metadata: { workspaceId: workspace.id } }, { idempotencyKey: `jitm-customer-${workspace.id}` });
      customerId = customer.id;
      await prisma.workspaceBilling.upsert({ where: { workspaceId: workspace.id }, create: { workspaceId: workspace.id, stripeCustomerId: customerId }, update: { stripeCustomerId: customerId } });
    }
    // One paid plan per account. If another tab already finished a checkout, show that plan instead of selling a second.
    const existing = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    if (effectiveSubscription(existing.data.map(subscriptionFacts))) {
      await syncCustomerBilling(prisma, stripe, customerId);
      destination = `${BILLING_PATH}?checkout=already`;
    } else {
      const checkout = await stripe.checkout.sessions.create({
        mode: "subscription", customer: customerId, client_reference_id: workspace.id, line_items: [{ price, quantity: 1 }],
        metadata: { workspaceId: workspace.id }, subscription_data: { metadata: { workspaceId: workspace.id } },
        success_url: `${env.appUrl}${BILLING_PATH}?checkout={CHECKOUT_SESSION_ID}`, cancel_url: `${env.appUrl}${BILLING_PATH}?checkout=cancelled`
      });
      if (!checkout.url) throw new Error("Stripe returned no checkout page.");
      destination = checkout.url;
    }
  } catch {
    refuse(UNAVAILABLE, session);
  }
  redirect(destination);
}

/** Opens Stripe's billing portal, where the owner changes plans, updates the card, sees invoices or cancels. */
export async function openBillingPortalAction(): Promise<void> {
  const { session, workspace } = await owner();
  const customerId = (await prisma.workspaceBilling.findUnique({ where: { workspaceId: workspace.id }, select: { stripeCustomerId: true } }))?.stripeCustomerId;
  if (!customerId) refuse("Choose a paid plan first.", session);
  let destination: string;
  try {
    const stripe = stripeClient();
    // The portal settings scripts/stripe-setup-prices.ts creates; Stripe's default settings otherwise.
    const configuration = (await stripe.billingPortal.configurations.list({ active: true, limit: 20 })).data.find(item => item.metadata?.app === "jump-in-the-mix")?.id;
    destination = (await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${env.appUrl}${BILLING_PATH}`, ...(configuration ? { configuration } : {}) })).url;
  } catch {
    refuse(UNAVAILABLE, session);
  }
  redirect(destination);
}
