import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { requestPasswordResetAction } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Reset password" };

type SearchParams = { error?: string; sent?: string; devToken?: string };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const developmentResetUrl = params.devToken ? `/reset-password?token=${encodeURIComponent(params.devToken)}` : null;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Reset your password</h1>
        <p>Enter the email used for your account. The response is intentionally the same whether or not an account exists.</p>
        {params.sent && <Notice type="success">If an account matches that email, a reset link has been sent.</Notice>}
        {params.error && <Notice type="error">{params.error}</Notice>}
        {developmentResetUrl && process.env.NODE_ENV !== "production" && <Notice type="info">Development email preview: <Link href={developmentResetUrl}><strong>open the reset link</strong></Link>.</Notice>}
        <form action={requestPasswordResetAction} className="form-stack">
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required autoFocus /></div>
          <button className="button primary" type="submit">Send reset link</button>
        </form>
        <div className="auth-footer"><Link href="/login"><strong>Back to sign in</strong></Link></div>
      </section>
    </main>
  );
}
