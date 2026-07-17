import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { REFERRAL_COOKIE, normalizeReferralCode } from "@/lib/referral";
import { findReferralInvite } from "@/lib/referral-service";
import { registerWithReferralAction } from "@/lib/register-action";

export const metadata: Metadata = { title: "Create account" };

type SearchParams = { error?: string; ref?: string };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, store] = await Promise.all([searchParams, cookies()]);
  const referralCode = normalizeReferralCode(params.ref || store.get(REFERRAL_COOKIE)?.value);
  const invite = referralCode ? await findReferralInvite(referralCode) : null;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Create your account</h1>
        <p>Start with the people and follow-ups that matter most. You can add integrations later.</p>
        {params.error && <Notice type="error">{params.error}</Notice>}
        {invite && (
          <Notice type="info">
            {invite.ownerName} invited you to Jump in the Mix. Complete signup and email verification to start with 30 days of Plus.
          </Notice>
        )}
        {referralCode && !invite && (
          <Notice type="error">
            This referral invitation is unavailable. <Link href="/register"><strong>Continue without the invitation</strong></Link>.
          </Notice>
        )}
        <form action={registerWithReferralAction} className="form-stack">
          {invite && <input type="hidden" name="referralCode" value={invite.code} />}
          <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" autoComplete="name" maxLength={120} required /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /><small>Use at least 12 characters. Longer passphrases are encouraged.</small></div>
          <button className="button primary" type="submit">Create account</button>
        </form>
        <div className="auth-footer">Already have an account? <Link href="/login"><strong>Sign in</strong></Link></div>
      </section>
    </main>
  );
}
