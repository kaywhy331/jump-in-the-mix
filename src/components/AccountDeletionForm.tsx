"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteAccountAction, reauthenticateForDeletionAction, type AccountDeletionActionState } from "@/lib/account-deletion-actions";
import { ACCOUNT_DELETION_PHRASE } from "@/lib/account-deletion-policy";

const initialState: AccountDeletionActionState = { error: null };

function DeletionActions({ onCancel, reauthenticate = false }: { onCancel: () => void; reauthenticate?: boolean }) {
  const { pending } = useFormStatus();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return <div className="page-actions">
    <button ref={cancelRef} className="button" type="button" disabled={pending} onClick={onCancel}>Cancel</button>
    <button className={`button${reauthenticate ? "" : " danger"}`} type="submit" disabled={pending}>
      {reauthenticate ? "Sign in again to confirm identity" : pending ? "Deleting account…" : "Permanently delete account"}
    </button>
  </div>;
}

type DeletionProps = { hasPassword: boolean; recentlyAuthenticated: boolean };

export function AccountDeletionForm(props: DeletionProps) {
  const [revealed, setRevealed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);
  const formId = useId();
  useEffect(() => {
    if (!revealed && hasOpened.current) triggerRef.current?.focus();
  }, [revealed]);

  return <div className="form-stack">
    <button ref={triggerRef} className="button danger" type="button" aria-expanded={revealed} aria-controls={formId} disabled={revealed} onClick={() => { hasOpened.current = true; setRevealed(true); }}>Delete account</button>
    <div id={formId}>
      {/* Unmounting clears the phrase, password and action error before another attempt. */}
      {revealed && <DeletionConfirmation {...props} onCancel={() => setRevealed(false)} />}
    </div>
  </div>;
}

function DeletionConfirmation({ hasPassword, recentlyAuthenticated, onCancel }: DeletionProps & { onCancel: () => void }) {
  const [state, action] = useActionState(deleteAccountAction, initialState);
  if (!hasPassword && !recentlyAuthenticated) return <form action={reauthenticateForDeletionAction} className="form-stack" aria-describedby="account-deletion-warning"><p>Confirm your identity with your usual sign-in method. Then return here within five minutes to confirm deletion.</p><DeletionActions onCancel={onCancel} reauthenticate /></form>;
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
      <DeletionActions onCancel={onCancel} />
    </form>
  );
}
