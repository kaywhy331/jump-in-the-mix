"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deleteAccountAction, reauthenticateForDeletionAction, type AccountDeletionActionState } from "@/lib/account-deletion-actions";
import { ACCOUNT_DELETION_PHRASE } from "@/lib/account-deletion-policy";

const initialState: AccountDeletionActionState = { error: null };

function DeleteButton() {
  const { pending } = useFormStatus();
  return <button className="button danger" type="submit" disabled={pending}>{pending ? "Deleting account…" : "Permanently delete account"}</button>;
}

export function AccountDeletionForm({ hasPassword, recentlyAuthenticated }: { hasPassword: boolean; recentlyAuthenticated: boolean }) {
  const [state, action] = useActionState(deleteAccountAction, initialState);
  if (!hasPassword && !recentlyAuthenticated) return <form action={reauthenticateForDeletionAction}><p>Confirm your identity with your usual sign-in method. Then return here within five minutes to confirm deletion.</p><button className="button" type="submit">Sign in again to confirm identity</button></form>;
  return (
    <form action={action} className="form-stack" aria-describedby="account-deletion-warning">
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      {!hasPassword && <p>Identity recently confirmed. You still need to type the deletion phrase below.</p>}
      {hasPassword && <div className="field">
        <label htmlFor="deleteCurrentPassword">Current password</label>
        <input id="deleteCurrentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>}
      <div className="field">
        <label htmlFor="deleteConfirmation">Type <strong>{ACCOUNT_DELETION_PHRASE}</strong></label>
        <input id="deleteConfirmation" name="confirmation" autoComplete="off" spellCheck={false} required />
      </div>
      <DeleteButton />
    </form>
  );
}
