import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { demoLoginAction, loginAction } from "@/lib/auth-actions";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = {
  error?: string;
  firstRun?: string;
  reset?: string;
  verified?: string;
  signedOutEverywhere?: string;
  invite?: string;
  emailChanged?: string;
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Welcome back</h1>
        <p>Sign in and see who needs your attention today.</p>
        {params.firstRun && <Notice type="success">Installation complete. Open the guided demo below, or create your own account.</Notice>}
        {params.reset && <Notice type="success">Your password was reset. Sign in with the new password.</Notice>}
        {params.verified && <Notice type="success">Your email is verified. You can sign in securely.</Notice>}
        {params.signedOutEverywhere && <Notice type="success">All sessions were signed out.</Notice>}
        {params.invite && <Notice type="info">Sign in with the invited email address. The workspace invitation will resume automatically.</Notice>}
        {params.emailChanged && <Notice type="success">Your new email is confirmed. Sign in again with the updated address.</Notice>}
        {params.error && <Notice type="error">{params.error}</Notice>}
        {env.demoMode && (
          <>
            <form action={demoLoginAction}><button className="button primary full-width" type="submit">Open the guided demo</button></form>
            <div className="auth-divider"><span>or sign in manually</span></div>
            <div className="demo-credentials"><strong>Local demo credentials</strong><code>{env.demoEmail}</code><code>{env.demoPassword}</code></div>
          </>
        )}
        <form action={loginAction} className="form-stack">
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={env.demoMode ? env.demoEmail : ""} /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required defaultValue={env.demoMode ? env.demoPassword : ""} /></div>
          <div className="auth-inline-actions"><Link href="/forgot-password">Forgot password?</Link></div>
          <button className="button primary" type="submit">Sign in</button>
        </form>
        <div className="auth-footer">New here? <Link href="/register"><strong>Create a free account</strong></Link></div>
      </section>
    </main>
  );
}
