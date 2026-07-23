import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { demoLoginAction, loginAction } from "@/lib/auth-actions";
import { env } from "@/lib/env";
import { pilotRegistrationOpen } from "@/lib/pilot-registration";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

type SearchParams = {
  error?: string;
  firstRun?: string;
  reset?: string;
  verified?: string;
  signedOutEverywhere?: string;
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
        <form action={loginAction} className="form-stack">
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={env.demoMode ? env.demoEmail : ""} /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required defaultValue={env.demoMode ? env.demoPassword : ""} /></div>
          <div className="auth-inline-actions"><Link href="/forgot-password">Forgot password?</Link></div>
          <button className="button primary" type="submit">Sign in</button>
        </form>
        <div className="auth-footer">{registrationOpen ? <>New here? <Link href="/register"><strong>Create the owner account</strong></Link></> : <>Owner setup is complete.</>}</div>
      </section>
    </main>
  );
}
