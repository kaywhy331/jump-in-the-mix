import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { resetPasswordAction } from "@/lib/auth-actions";

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
          <form action={resetPasswordAction} className="form-stack">
            <input type="hidden" name="token" value={token} />
            <div className="field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required autoFocus /><small>Use at least 12 characters.</small></div>
            <div className="field"><label htmlFor="confirmPassword">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></div>
            <button className="button primary" type="submit">Reset password</button>
          </form>
        )}
        <div className="auth-footer"><Link href="/forgot-password"><strong>Request a new reset link</strong></Link></div>
      </section>
    </main>
  );
}
