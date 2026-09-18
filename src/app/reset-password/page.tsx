import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { PasswordInput } from "@/components/PasswordInput";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { resetPasswordFormAction } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Choose a new password" };

type SearchParams = { token?: string; error?: string };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Choose a new password</h1>
        <p>The reset link can be used once. Completing it signs out every existing session for the account.</p>
        {params.error && <Notice type="error">{params.error}</Notice>}
        {!token ? (
          <Notice type="error">This reset link is incomplete. Request a new one.</Notice>
        ) : (
          <ActionForm action={resetPasswordFormAction} className="form-stack">
            <input type="hidden" name="token" value={token} />
            <div className="field"><label htmlFor="password">New password</label><PasswordInput id="password" name="password"  autoComplete="new-password" minLength={12} maxLength={72} required autoFocus /><small>Use at least 12 characters.</small></div>
            <div className="field"><label htmlFor="confirmPassword">Confirm new password</label><PasswordInput id="confirmPassword" name="confirmPassword"  autoComplete="new-password" minLength={12} maxLength={72} required /></div>
            <FormSubmitButton label="Reset password" pendingLabel="Please wait…" />
          </ActionForm>
        )}
        <p><Link href="/contact">Contact support</Link> if you cannot recover your account.</p>
        <div className="auth-footer"><Link href="/forgot-password"><strong>Request a new reset link</strong></Link></div>
      </section>
    </main>
  );
}
