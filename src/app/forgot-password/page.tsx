import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { PasswordInput } from "@/components/PasswordInput";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { requestPasswordResetFormAction } from "@/lib/auth-actions";
import { AUTH_EMAILS_PER_RECIPIENT_PER_DAY } from "@/lib/email-budget";
import { env } from "@/lib/env";
import { verifiedErrorMessage } from "@/lib/form-errors";
import { transactionalEmailConfigured } from "@/lib/transactional-email";

export const metadata: Metadata = { title: "Reset password" };

type SearchParams = { error?: string; sig?: string; sent?: string; devToken?: string; unavailable?: string; delivery?: string };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const error = verifiedErrorMessage(params);
  const developmentResetUrl = params.devToken ? `/reset-password?token=${encodeURIComponent(params.devToken)}` : null;
  const emailAvailable = process.env.NODE_ENV !== "production" || transactionalEmailConfigured();
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Reset your password</h1>
        <p>Enter the email you use to sign in. Check your inbox and spam folder for the next step.</p>
        {params.sent && <Notice type="success">If an account matches that email, a reset link has been sent. An address gets up to {AUTH_EMAILS_PER_RECIPIENT_PER_DAY.resetPassword} reset links a day, unless this browser has signed in to the account before.</Notice>}
        {(params.unavailable || !emailAvailable) && <Notice type="info">Password-reset email is temporarily unavailable. <Link href="/contact">Contact support for help recovering your account</Link>.</Notice>}
        {params.delivery === "failed" && <Notice type="error">The reset email could not be delivered. Please try again or contact support using the link below.</Notice>}
        {error && <Notice type="error">{error}</Notice>}
        {developmentResetUrl && process.env.NODE_ENV !== "production" && <Notice type="info">Development email preview: <Link href={developmentResetUrl}><strong>open the reset link</strong></Link>.</Notice>}
        {emailAvailable && <ActionForm action={requestPasswordResetFormAction} className="form-stack">
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required autoFocus /></div>
          <FormSubmitButton label="Send reset link" pendingLabel="Please wait…" />
        </ActionForm>}
        <p><Link href="/contact">Contact support</Link> if you cannot recover your account.</p>
        <div className="auth-footer"><Link href="/login"><strong>Back to sign in</strong></Link></div>
      </section>
    </main>
  );
}
