import { AccountDeletionBlockedError } from "@/lib/account-deletion";
import { billingSettings } from "@/lib/billing-config";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe-client";

const NOT_CLOSED = "Your paid plan couldn’t be closed with the payment provider, so nothing was deleted. Try again in a few minutes, or contact support.";

/**
 * Deleting an account must never leave a card being charged. Deleting the Stripe customer ends its subscriptions at
 * once and removes its saved cards; Stripe keeps its own records of past payments. Runs before any account data is removed.
 */
export async function closeBillingForDeletion(workspaceId: string): Promise<void> {
  const customerId = (await prisma.workspaceBilling.findUnique({ where: { workspaceId }, select: { stripeCustomerId: true } }))?.stripeCustomerId;
  if (!customerId) return;
  if (!billingSettings().secretKey) throw new AccountDeletionBlockedError(NOT_CLOSED);
  try {
    await stripeClient().customers.del(customerId);
  } catch (error) {
    // Already deleted in Stripe: nothing is left to charge.
    if ((error as { statusCode?: number; code?: string }).statusCode === 404 || (error as { code?: string }).code === "resource_missing") return;
    throw new AccountDeletionBlockedError(NOT_CLOSED);
  }
}
