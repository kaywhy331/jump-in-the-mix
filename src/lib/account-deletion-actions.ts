"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { deleteAccountData } from "@/lib/account-deletion";
import { ACCOUNT_DELETION_PHRASE } from "@/lib/account-deletion-policy";
import { requireWorkspace } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

export type AccountDeletionActionState = { error: string | null };

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function deleteAccountAction(
  _previous: AccountDeletionActionState,
  formData: FormData
): Promise<AccountDeletionActionState> {
  const { user, impersonation } = await requireWorkspace();
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
  if (!user.passwordHash) {
    return { error: "Set a password in Security before permanently deleting this account." };
  }
  const passwordMatches = await bcrypt.compare(field(formData, "currentPassword"), user.passwordHash).catch(() => false);
  if (!passwordMatches) return { error: "The current password is incorrect." };

  await deleteAccountData(user.id);
  redirect("/account/deleted");
}
