import { ActionForm } from "@/components/ActionForm";
import { FieldError } from "@/components/FieldError";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { PasswordInput } from "@/components/PasswordInput";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { Notice } from "@/components/Notice";
import { resetPasswordFormAction } from "@/lib/auth-actions";
import type { FieldMessages } from "@/lib/field-validation";
import { verifiedErrorMessage } from "@/lib/form-errors";

export const metadata: Metadata = { title: "Choose a new password" };

// The server's rule (password-policy.ts), said beside each field before sending.
const NEW_PASSWORD: FieldMessages = { valueMissing: "Enter a new password.", tooShort: "Use a password with at least 12 characters." };
const CONFIRM_PASSWORD: FieldMessages = { valueMissing: "Enter the new password again.", tooShort: "Use a password with at least 12 characters." };

type SearchParams = { token?: string; error?: string; sig?: string };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";
  const error = verifiedErrorMessage(params);
  return (
    <AuthCard>
        {/* Without a token the heading names that state and the one action is a new link (JITM-08 §2.39). */}
        <h1>{token ? "Choose a new password" : "This reset link is incomplete"}</h1>
        <p>{token ? "The reset link can be used once. Completing it signs out every existing session for the account." : "Open the full link from your reset email, or request a new one."}</p>
        {error && <Notice type="error">{error}</Notice>}
        {!token ? (
          <Link className="button primary" href="/forgot-password">Request a new reset link</Link>
        ) : (
          <ActionForm action={resetPasswordFormAction} className="form-stack">
            <input type="hidden" name="token" value={token} />
            <div className="field"><label htmlFor="password">New password</label><PasswordInput id="password" name="password"  autoComplete="new-password" minLength={12} maxLength={72} required autoFocus /><FieldError name="password" messages={NEW_PASSWORD} /><small>Use at least 12 characters.</small></div>
            <div className="field"><label htmlFor="confirmPassword">Confirm new password</label><PasswordInput id="confirmPassword" name="confirmPassword"  autoComplete="new-password" minLength={12} maxLength={72} required /><FieldError name="confirmPassword" messages={CONFIRM_PASSWORD} /></div>
            <FormSubmitButton label="Reset password" pendingLabel="Please wait…" />
          </ActionForm>
        )}
        <p><Link href="/contact">Contact support</Link> if you cannot recover your account.</p>
        {token && <div className="auth-footer"><Link href="/forgot-password"><strong>Request a new reset link</strong></Link></div>}
    </AuthCard>
  );
}
