import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { PasswordInput } from "@/components/PasswordInput";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { changeUnverifiedEmailFormAction, resendVerificationFormAction } from "@/lib/auth-actions";
import { AUTH_EMAILS_PER_RECIPIENT_PER_DAY } from "@/lib/email-budget";
import { verifiedErrorMessage } from "@/lib/form-errors";

export const metadata: Metadata = { title: "Verify email" };

type SearchParams = {
  email?: string;
  registered?: string;
  sent?: string;
  error?: string;
  sig?: string;
  devToken?: string;
  delivery?: string;
};

export default async function VerifyEmailPendingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const email = params.email?.trim().toLowerCase() ?? "";
  // Unsigned errors here nearly always come from an opened verification link, so the fixed sentence says so.
  const error = verifiedErrorMessage(params, "That verification link could not be used. Send another link below.");
  const developmentVerificationUrl = params.devToken ? `/api/auth/verify-email?token=${encodeURIComponent(params.devToken)}` : null;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Verify your email</h1>
        <p>Open the one-time verification link sent to {email || "your email address"}. Verification protects account recovery and personal data controls.</p>
        {params.registered && params.delivery !== "failed" && <Notice type="success">We sent a verification link to {email || "your email address"}. Check your inbox and spam folder.</Notice>}
        {params.sent && params.delivery !== "failed" && <Notice type="success">A new verification link was prepared. Check your inbox and spam folder. A new link replaces older ones. An address gets up to {AUTH_EMAILS_PER_RECIPIENT_PER_DAY.verifyEmail} verification links a day.</Notice>}
        {params.delivery === "failed" && <Notice type="error">The email provider could not deliver the message. You can try again below.</Notice>}
        {error && <Notice type="error">{error}</Notice>}
        {developmentVerificationUrl && process.env.NODE_ENV !== "production" && <Notice type="info">Development email preview: <Link href={developmentVerificationUrl}><strong>verify this account</strong></Link>.</Notice>}
        <ActionForm action={resendVerificationFormAction} className="form-stack">
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} defaultValue={email} required /></div>
          <FormSubmitButton label="Send another verification link" pendingLabel="Please wait…" />
        </ActionForm>
        <details className="verify-email-change">
          <summary>Typed the wrong email?</summary>
          <p>If a text invitation brought you here and you mistyped your email, correct it and we’ll send the link to the new address. Enter the email and password you signed up with.</p>
          <ActionForm action={changeUnverifiedEmailFormAction} className="form-stack">
            <div className="field"><label htmlFor="currentEmail">Email you signed up with</label><input id="currentEmail" name="email" type="email" inputMode="email" autoComplete="off" maxLength={254} defaultValue={email} required /></div>
            <div className="field"><label htmlFor="currentPassword">Password</label><PasswordInput id="currentPassword" name="password" autoComplete="current-password" maxLength={72} required /></div>
            <div className="field"><label htmlFor="newEmail">Correct email</label><input id="newEmail" name="newEmail" type="email" inputMode="email" autoComplete="email" maxLength={254} required /></div>
            <div className="field"><label htmlFor="confirmNewEmail">Confirm correct email</label><input id="confirmNewEmail" name="confirmNewEmail" type="email" inputMode="email" autoComplete="off" maxLength={254} required /></div>
            <FormSubmitButton label="Change email and send link" pendingLabel="Please wait…" />
          </ActionForm>
        </details>
        <p><Link href="/contact">Contact support</Link> if you cannot recover your account.</p>
        <div className="auth-footer"><Link href="/login"><strong>Back to sign in</strong></Link></div>
      </section>
    </main>
  );
}
