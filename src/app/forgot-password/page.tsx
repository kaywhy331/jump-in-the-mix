import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { requestPasswordResetAction } from "@/lib/auth-actions";
import { env } from "@/lib/env";
import { transactionalEmailConfigured } from "@/lib/transactional-email";

export const metadata: Metadata = { title: "Reset password" };

type SearchParams = { error?: string; sent?: string; devToken?: string; unavailable?: string; delivery?: string };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const developmentResetUrl = params.devToken ? `/reset-password?token=${encodeURIComponent(params.devToken)}` : null;
  const emailAvailable = process.env.NODE_ENV !== "production" || transactionalEmailConfigured();
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Reset your password</h1>
        <p>Enter the email used for your account. The response is intentionally the same whether or not an account exists.</p>
        {params.sent && <Notice type="success">If an account matches that email, a reset link has been sent.</Notice>}
        {(params.unavailable || !emailAvailable) && <Notice type="info">Password-reset email is not configured for this installation. {env.privateTestMode ? "Ask the site operator for a one-time password reset link." : env.pilotMode ? <>Ask the operator to run <code>npm run pilot:reset-password -- your@email.com</code> on the server.</> : "Ask the site operator to restore email delivery."}</Notice>}
        {params.delivery === "failed" && <Notice type="error">The reset email could not be delivered. Nothing was reported as sent; please try again or contact the site operator.</Notice>}
        {params.error && <Notice type="error">{params.error}</Notice>}
        {developmentResetUrl && process.env.NODE_ENV !== "production" && <Notice type="info">Development email preview: <Link href={developmentResetUrl}><strong>open the reset link</strong></Link>.</Notice>}
        {emailAvailable && <form action={requestPasswordResetAction} className="form-stack">
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required autoFocus /></div>
          <button className="button primary" type="submit">Send reset link</button>
        </form>}
        <div className="auth-footer"><Link href="/login"><strong>Back to sign in</strong></Link></div>
      </section>
    </main>
  );
}
