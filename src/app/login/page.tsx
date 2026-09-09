import { PublicTrustLinks } from "@/components/PublicTrustLinks";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { SocialSignInOptions } from "@/components/SocialSignInOptions";
import { demoLoginAction, loginAction, requestMagicLinkAction } from "@/lib/auth-actions";
import { env } from "@/lib/env";
import { pilotRegistrationOpen } from "@/lib/pilot-registration";
import { appleSignInConfigured, googleSignInConfigured } from "@/lib/social-auth";
import { transactionalEmailConfigured } from "@/lib/transactional-email";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

type SearchParams = {
  error?: string;
  firstRun?: string;
  reset?: string;
  verified?: string;
  signedOutEverywhere?: string;
  magicSent?: string;
  devToken?: string;
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, registrationOpen] = await Promise.all([searchParams, pilotRegistrationOpen()]);
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Welcome back</h1>
        <p>Sign in and see who needs your attention today.</p>
        {params.firstRun && registrationOpen && <Notice type="success">Installation complete. Create the private owner account to begin.</Notice>}
        {params.reset && <Notice type="success">Your password was reset. Sign in with the new password.</Notice>}
        {params.verified && <Notice type="success">Your email is verified. You can sign in securely.</Notice>}
        {params.signedOutEverywhere && <Notice type="success">All sessions were signed out.</Notice>}
        {params.magicSent && <Notice type="success">If you have an account, check your inbox for a sign-in link. It expires in 15 minutes.</Notice>}
        {params.devToken && process.env.NODE_ENV !== "production" && <Notice type="info"><Link href={`/api/auth/magic?token=${encodeURIComponent(params.devToken)}`}>Open the development sign-in link</Link>.</Notice>}
        {params.error && <Notice type="error">{params.error}</Notice>}
        {env.demoMode && (
          <>
            <form action={demoLoginAction}>
              <button className="button primary full-width" type="submit">Open the guided demo</button>
            </form>
            <div className="auth-divider"><span>or sign in manually</span></div>
            <div className="demo-credentials">
              <strong>Local demo credentials</strong>
              <code>{env.demoEmail}</code>
              <code>{env.demoPassword}</code>
            </div>
          </>
        )}
        <SocialSignInOptions google={googleSignInConfigured()} apple={appleSignInConfigured()} />
        <form action={loginAction} className="form-stack">
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={env.demoMode ? env.demoEmail : ""} /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required defaultValue={env.demoMode ? env.demoPassword : ""} /></div>
          <div className="auth-inline-actions"><Link href="/forgot-password">Forgot password?</Link></div>
          <button className="button primary" type="submit">Sign in</button>
        </form>
        {transactionalEmailConfigured() && <>
          <div className="auth-divider"><span>or skip the password</span></div>
          <form action={requestMagicLinkAction} className="form-stack">
            <div className="field"><label htmlFor="magicEmail">Email me a secure sign-in link</label><input id="magicEmail" name="email" type="email" autoComplete="email" inputMode="email" required /></div>
            <button className="button" type="submit">Email sign-in link</button>
          </form>
        </>}
        <div className="auth-footer">{registrationOpen ? <>New here? <Link href="/waitlist"><strong>Join the waitlist</strong></Link></> : <>Owner setup is complete.</>}</div>
        <PublicTrustLinks />
      </section>
    </main>
  );
}
