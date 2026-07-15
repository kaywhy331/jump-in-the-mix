import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { demoLoginAction, loginAction } from "@/lib/actions";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; firstRun?: string }> }) {
  const { error, firstRun } = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Welcome back</h1>
        <p>Sign in and see who needs your attention today.</p>
        {firstRun && <Notice type="success">Installation complete. Open the guided demo below, or create your own account.</Notice>}
        {error && <Notice type="error">{error}</Notice>}
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
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required defaultValue={env.demoMode ? env.demoEmail : ""} /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required defaultValue={env.demoMode ? env.demoPassword : ""} /></div>
          <button className="button primary" type="submit">Sign in</button>
        </form>
        <div className="auth-footer">New here? <Link href="/register"><strong>Create a free account</strong></Link></div>
      </section>
    </main>
  );
}
