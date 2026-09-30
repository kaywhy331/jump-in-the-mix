import type Stripe from "stripe";
import type { PrismaClient } from "@/generated/prisma/client";
import { effectiveSubscription, subscriptionFacts } from "@/lib/billing-plans";

type Db = Pick<PrismaClient, "workspaceBilling">;
const toDate = (seconds: number | null | undefined) => seconds ? new Date(seconds * 1000) : null;

/**
 * Re-read a customer's subscriptions from Stripe and store the plan they give. Stripe is the source of truth, so a
 * webhook event that arrives late, out of order or twice cannot leave the wrong plan, and a redirect back from
 * checkout never grants a plan by itself.
 */
export async function syncCustomerBilling(db: Db, stripe: Pick<Stripe, "subscriptions">, customerId: string, now = new Date()) {
  const row = await db.workspaceBilling.findUnique({ where: { stripeCustomerId: customerId }, select: { workspaceId: true } });
  if (!row) return null; // A customer this app did not create.
  const listed = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  const subscriptions = listed.data.map(subscriptionFacts);
  const paid = effectiveSubscription(subscriptions);
  const latest = [...subscriptions].sort((left, right) => right.created - left.created)[0];
  const data = {
    plan: paid?.plan ?? "FREE" as const, interval: paid?.interval ?? null, stripeSubscriptionId: paid?.id ?? null,
    subscriptionStatus: paid?.status ?? latest?.status ?? null, currentPeriodEnd: toDate(paid?.currentPeriodEnd), cancelAt: toDate(paid?.cancelAt), syncedAt: now
  };
  await db.workspaceBilling.update({ where: { workspaceId: row.workspaceId }, data });
  return { workspaceId: row.workspaceId, ...data };
}
