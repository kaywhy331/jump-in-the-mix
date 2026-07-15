import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { registerAction } from "@/lib/actions";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Create your account</h1>
        <p>Start with the people and follow-ups that matter most. You can add integrations later.</p>
        {error && <Notice type="error">{error}</Notice>}
        <form action={registerAction} className="form-stack">
          <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" autoComplete="name" required /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={10} autoComplete="new-password" required /><small>Use at least 10 characters.</small></div>
          <button className="button primary" type="submit">Create account</button>
        </form>
        <div className="auth-footer">Already have an account? <Link href="/login"><strong>Sign in</strong></Link></div>
      </section>
    </main>
  );
}
