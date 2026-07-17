"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  enableAdminMfaAction,
  INITIAL_ADMIN_MFA_STATE,
  verifyAdminMfaAction
} from "@/lib/admin-mfa-actions";

export function AdminMfaPanel({
  mode,
  returnTo,
  secret,
  qrDataUrl
}: {
  mode: "setup" | "verify";
  returnTo: string;
  secret?: string;
  qrDataUrl?: string;
}) {
  const router = useRouter();
  const action = mode === "setup" ? enableAdminMfaAction : verifyAdminMfaAction;
  const [state, formAction, pending] = useActionState(action, INITIAL_ADMIN_MFA_STATE);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.status === "verified") {
      router.replace(state.redirectTo);
      router.refresh();
    }
  }, [router, state]);

  const recoveryCodes = state.status === "enabled" ? state.recoveryCodes : [];
  const copyRecoveryCodes = async () => {
    if (!recoveryCodes.length) return;
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
  };

  if (state.status === "enabled") {
    return (
      <section className="card admin-mfa-recovery-card" aria-live="polite">
        <div className="card-header">
          <div>
            <h2>Save your recovery codes</h2>
            <p>Each code works once. Store them in a password manager or another secure location before continuing.</p>
          </div>
          <span className="status-pill done">MFA enabled</span>
        </div>
        <div className="admin-mfa-recovery-grid" aria-label="Administrator MFA recovery codes">
          {recoveryCodes.map((code) => <code data-testid="mfa-recovery-code" key={code}>{code}</code>)}
        </div>
        <div className="form-actions">
          <button className="button" type="button" onClick={copyRecoveryCodes}>{copied ? "Copied" : "Copy recovery codes"}</button>
          <Link className="button primary" href={returnTo}>Continue to Admin</Link>
        </div>
      </section>
    );
  }

  return (
    <form action={formAction} className="card admin-mfa-form">
      <input type="hidden" name="returnTo" value={returnTo} />
      {mode === "setup" && (
        <>
          <div className="card-header">
            <div>
              <h2>Connect an authenticator app</h2>
              <p>Scan the QR code with a standards-based authenticator, then confirm the current six-digit code.</p>
            </div>
            <span className="status-pill">Required</span>
          </div>
          <div className="admin-mfa-setup-grid">
            {qrDataUrl && <img className="admin-mfa-qr" src={qrDataUrl} alt="QR code for Jump in the Mix administrator MFA" width={220} height={220} />}
            <div className="admin-mfa-manual-key">
              <strong>Cannot scan the code?</strong>
              <span>Choose manual entry in your authenticator and use this secret:</span>
              <code data-testid="mfa-secret">{secret}</code>
              <small>Type: time based · 6 digits · 30-second period</small>
            </div>
          </div>
          <label className="field">
            <span className="field-label">Current password</span>
            <input name="currentPassword" type="password" autoComplete="current-password" maxLength={72} required />
            <small>Password confirmation prevents a stolen session from silently enrolling a new authenticator.</small>
          </label>
        </>
      )}

      {mode === "verify" && (
        <div className="card-header">
          <div>
            <h2>Verify administrator access</h2>
            <p>Enter the current authenticator code, or use one unused recovery code.</p>
          </div>
          <span className="status-pill">Step-up</span>
        </div>
      )}

      <label className="field">
        <span className="field-label">{mode === "setup" ? "Authenticator code" : "Verification code"}</span>
        <input
          name="code"
          inputMode={mode === "setup" ? "numeric" : "text"}
          autoComplete="one-time-code"
          pattern={mode === "setup" ? "[0-9]{6}" : undefined}
          minLength={6}
          maxLength={40}
          placeholder={mode === "setup" ? "123456" : "6-digit code or recovery code"}
          required
          autoFocus={mode === "verify"}
        />
      </label>

      {state.status === "error" && <div className="notice error" role="alert">{state.message}</div>}

      <div className="form-actions">
        <Link className="button" href="/jumps">Return to Jump</Link>
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? "Verifying…" : mode === "setup" ? "Enable administrator MFA" : "Verify and continue"}
        </button>
      </div>
    </form>
  );
}
