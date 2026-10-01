"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { AccountDeletionBlockedError, assertNotLastActiveOwner, deleteAccountData } from "@/lib/account-deletion";
import { ACCOUNT_DELETION_PHRASE } from "@/lib/account-deletion-policy";
import { closeBillingForDeletion } from "@/lib/billing-deletion";
import { destroySession, requireWorkspace } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

export type AccountDeletionActionState = { error: string | null };

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function deleteAccountAction(
  _previous: AccountDeletionActionState,
  formData: FormData
): Promise<AccountDeletionActionState> {
  const { user, session, impersonation } = await requireWorkspace();
  if (impersonation) return { error: "End the administrator support session before deleting an account." };

  const rateLimit = await consumeRateLimit({
    scope: "account.delete",
    identifiers: [user.id],
    limit: 5,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000
  });
  if (!rateLimit.allowed) return { error: "Too many deletion attempts. Try again later." };

  if (field(formData, "confirmation") !== ACCOUNT_DELETION_PHRASE) {
    return { error: `Type ${ACCOUNT_DELETION_PHRASE} exactly to continue.` };
  }
  if (user.passwordHash) {
    const passwordMatches = await bcrypt.compare(field(formData, "currentPassword"), user.passwordHash).catch(() => false);
    if (!passwordMatches) return { error: "The current password is incorrect." };
  } else if (Date.now() - session.createdAt.getTime() > 5 * 60_000 || session.createdAt > new Date()) {
    return { error: "Sign in again using your usual provider or email link, then return here within five minutes to confirm deletion." };
  }

  try {
    // Refuse a deletion that is going to be blocked before any paid plan is closed.
    await assertNotLastActiveOwner(user.id);
    await closeBillingForDeletion(user.id);
    await deleteAccountData(user.id);
  } catch (error) {
    // A rule the person can act on (for example the last active staff owner) belongs in the form,
    // not on the framework's error page. Anything else is still an unexpected failure.
    if (error instanceof AccountDeletionBlockedError) return { error: error.message };
    throw error;
  }
  redirect("/account/deleted");
}

export async function reauthenticateForDeletionAction(): Promise<void> {
  const { impersonation } = await requireWorkspace();
  if (impersonation) return;
  await destroySession();
  redirect("/login?next=%2Faccount%3Fsection%3Dprivacy&reauth=deletion");
}
