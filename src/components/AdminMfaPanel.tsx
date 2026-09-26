"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { enableAdminMfaAction, verifyAdminMfaAction } from "@/lib/admin-mfa-actions";
import { INITIAL_ADMIN_MFA_STATE } from "@/lib/admin-mfa-action-state";

export function AdminMfaPanel({
  mode,
  returnTo,
  secret,
  qrDataUrl,
  canReturn = false
}: {
  mode: "setup" | "verify";
  returnTo: string;
  secret?: string;
  qrDataUrl?: string;
  canReturn?: boolean;
}) {
  const router = useRouter();
  const action = mode === "setup" ? enableAdminMfaAction : verifyAdminMfaAction;
  const [state, formAction, pending] = useActionState(action, INITIAL_ADMIN_MFA_STATE);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [codesStored, setCodesStored] = useState(false);
  const admissionDraft = /^\/admin\/admission\?draft=[0-9a-f-]{36}$/.test(returnTo);

  useEffect(() => {
    if (state.status === "verified") {
      router.replace(state.redirectTo);
      router.refresh();
    }
  }, [router, state]);

  const recoveryCodes = state.status === "enabled" ? state.recoveryCodes : [];
  const copyRecoveryCodes = async () => {
    if (!recoveryCodes.length) return;
    try { await navigator.clipboard.writeText(recoveryCodes.join("\n")); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); setCopied(false); }
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
        {copyError && <label className="field"><span role="alert">Clipboard unavailable. Select and copy these codes manually, then store them securely.</span><textarea readOnly value={recoveryCodes.join("\n")} rows={recoveryCodes.length} onFocus={event => event.currentTarget.select()} aria-label="Recovery codes for manual copying" /></label>}
        <label><input type="checkbox" checked={codesStored} onChange={event => setCodesStored(event.target.checked)} /> I stored my one-time recovery codes securely.</label>
        <div className="form-actions">
          <button className="button" type="button" onClick={copyRecoveryCodes}>{copied ? "Copied" : "Copy recovery codes"}</button>
          <button type="button" className="button primary" disabled={!codesStored} onClick={() => router.push(returnTo)}>Continue to Admin</button>
        </div>
      </section>
    );
  }

  return (
    <form action={formAction} className="card admin-mfa-form">
      <input type="hidden" name="returnTo" value={returnTo} />
      {admissionDraft && <p role="status">Your admission changes are held as a draft for 30 minutes. Verification will return you to review them; you must re-enter your password and select Save admission controls to apply them.</p>}
      {mode === "setup" && (
        <>
          <div className="card-header">
            <div>
              <h2>Connect an authenticator app</h2>
              <p>Scan the QR code, then enter your 6-digit code.</p>
            </div>
            <span className="status-pill">Required</span>
          </div>
          <div className="admin-mfa-setup-grid">
            {qrDataUrl && <img className="admin-mfa-qr" src={qrDataUrl} alt="QR code for Jump in the Mix administrator MFA" width={220} height={220} />}
            <div className="admin-mfa-manual-key">
              <strong>Cannot scan the code?</strong>
              <span>Enter this key in your authenticator:</span>
              <code data-testid="mfa-secret">{secret}</code>
              <small>Type: time based · 6 digits · 30-second period</small>
            </div>
          </div>
          <label className="field">
            <span className="field-label">Current password</span>
            <input name="currentPassword" type="password" autoComplete="current-password" maxLength={72} required />

          </label>
        </>
      )}

      {mode === "verify" && (
        <div className="card-header">
          <div>
            <h2>Verify administrator access</h2>
            <p>Enter the current authenticator code, or use one unused recovery code.</p>
          </div>
          <span className="status-pill">Verification</span>
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
        {canReturn && <Link className="button" href={returnTo}>Return without verifying</Link>}
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? "Verifying…" : mode === "setup" ? "Enable administrator MFA" : "Verify and continue"}
        </button>
      </div>
    </form>
  );
}
