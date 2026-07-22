import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { resendVerificationAction } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Verify email" };

type SearchParams = {
  email?: string;
  sent?: string;
  error?: string;
  devToken?: string;
  delivery?: string;
};

export default async function VerifyEmailPendingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const email = params.email?.trim().toLowerCase() ?? "";
  const developmentVerificationUrl = params.devToken ? `/api/auth/verify-email?token=${encodeURIComponent(params.devToken)}` : null;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Verify your email</h1>
        <p>Open the one-time verification link sent to {email || "your email address"}. Verification protects account recovery and personal data controls.</p>
        {params.sent && <Notice type="success">A new verification link was prepared. Check your inbox and spam folder.</Notice>}
        {params.delivery === "failed" && <Notice type="error">The email provider could not deliver the message. You can try again below.</Notice>}
        {params.error && <Notice type="error">{params.error}</Notice>}
        {developmentVerificationUrl && process.env.NODE_ENV !== "production" && <Notice type="info">Development email preview: <Link href={developmentVerificationUrl}><strong>verify this account</strong></Link>.</Notice>}
        <form action={resendVerificationAction} className="form-stack">
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} defaultValue={email} required /></div>
          <button className="button primary" type="submit">Send another verification link</button>
        </form>
        <div className="auth-footer"><Link href="/login"><strong>Back to sign in</strong></Link></div>
      </section>
    </main>
  );
}
