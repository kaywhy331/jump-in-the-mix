import { AccountDeletionBlockedError } from "@/lib/account-deletion";
import { billingSettings } from "@/lib/billing-config";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe-client";

const NOT_CLOSED = "Your paid plan couldn’t be closed with the payment provider, so nothing was deleted. Try again in a few minutes, or contact support.";

/**
 * Deleting an account must never leave a card being charged. Deleting the Stripe customer ends its subscriptions at
 * once and removes its saved cards; Stripe keeps its own records of past payments. Runs before any account data is removed.
 * Covers exactly the workspaces the person owns, which are the ones the deletion removes: a workspace they only belong
 * to keeps its owner's billing.
 */
export async function closeBillingForDeletion(userId: string): Promise<void> {
  const customers = await prisma.workspaceBilling.findMany({
    where: { workspace: { ownerId: userId }, stripeCustomerId: { not: null } },
    select: { stripeCustomerId: true }
  });
  if (!customers.length) return;
  if (!billingSettings().secretKey) throw new AccountDeletionBlockedError(NOT_CLOSED);
  const stripe = stripeClient();
  for (const { stripeCustomerId } of customers) {
    try {
      await stripe.customers.del(stripeCustomerId!);
    } catch (error) {
      // Already deleted in Stripe (including by an earlier attempt that stopped partway): nothing is left to charge.
      if ((error as { statusCode?: number; code?: string }).statusCode === 404 || (error as { code?: string }).code === "resource_missing") continue;
      throw new AccountDeletionBlockedError(NOT_CLOSED);
    }
  }
}
