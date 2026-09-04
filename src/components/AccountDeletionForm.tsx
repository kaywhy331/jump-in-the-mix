"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deleteAccountAction, type AccountDeletionActionState } from "@/lib/account-deletion-actions";
import { ACCOUNT_DELETION_PHRASE } from "@/lib/account-deletion-policy";

const initialState: AccountDeletionActionState = { error: null };

function DeleteButton() {
  const { pending } = useFormStatus();
  return <button className="button danger" type="submit" disabled={pending}>{pending ? "Deleting account…" : "Permanently delete account"}</button>;
}

export function AccountDeletionForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action] = useActionState(deleteAccountAction, initialState);
  if (!hasPassword) {
    return <p className="notice info">For secure reauthentication, <Link href="/account?section=security">set an account password</Link> before deleting this account.</p>;
  }
  return (
    <form action={action} className="form-stack" aria-describedby="account-deletion-warning">
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      <div className="field">
        <label htmlFor="deleteCurrentPassword">Current password</label>
        <input id="deleteCurrentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="field">
        <label htmlFor="deleteConfirmation">Type <strong>{ACCOUNT_DELETION_PHRASE}</strong></label>
        <input id="deleteConfirmation" name="confirmation" autoComplete="off" spellCheck={false} required />
      </div>
      <DeleteButton />
    </form>
  );
}
