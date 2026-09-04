import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { SocialSignInOptions } from "@/components/SocialSignInOptions";
import { registerAction, requestMagicLinkAction } from "@/lib/auth-actions";
import { pilotRegistrationOpen } from "@/lib/pilot-registration";
import { appleSignInConfigured, googleSignInConfigured } from "@/lib/social-auth";
import { transactionalEmailConfigured } from "@/lib/transactional-email";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [params, registrationOpen] = await Promise.all([searchParams, pilotRegistrationOpen()]);
  if (!registrationOpen) {
    return <main className="auth-page"><section className="auth-card"><div><p className="eyebrow">Jump in the Mix</p><h1>Owner setup is complete</h1><p>This private installation already has an owner account. New account creation is disabled.</p></div><Link className="button primary" href="/login">Sign in</Link></section></main>;
  }
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div><p className="eyebrow">Jump in the Mix</p><h1>Get your follow-ups working for you</h1><p>Create your business account, then prepare the first customer follow-up in about three minutes.</p></div>
        {params.error && <Notice type="error">{params.error}</Notice>}
        <SocialSignInOptions google={googleSignInConfigured()} apple={appleSignInConfigured()} />
        {transactionalEmailConfigured() && <>
          <form action={requestMagicLinkAction} className="form-stack">
            <label className="field"><span>Work email</span><input name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required /></label>
            <button className="button" type="submit">Create account with an email link</button>
          </form>
          <div className="auth-divider"><span>or create a password</span></div>
        </>}
        <form action={registerAction} className="form-stack">
          <label className="field"><span>Your name</span><input name="name" autoComplete="name" maxLength={120} required /></label>
          <label className="field"><span>Work email</span><input name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required /></label>
          <label className="field"><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /><small>Use at least 12 characters.</small></label>
          <button className="button primary" type="submit">Continue to business setup</button>
        </form>
        <p>Already have an account? <Link href="/login">Sign in</Link>.</p>
      </section>
    </main>
  );
}
