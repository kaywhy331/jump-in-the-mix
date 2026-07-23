import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { registerAction } from "@/lib/auth-actions";
import { pilotRegistrationOpen } from "@/lib/pilot-registration";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [params, registrationOpen] = await Promise.all([searchParams, pilotRegistrationOpen()]);
  if (!registrationOpen) {
    return <main className="auth-page"><section className="auth-card"><div><p className="eyebrow">Jump in the Mix</p><h1>Owner setup is complete</h1><p>This installation already has its personal owner account. New account creation is disabled.</p></div><Link className="button primary" href="/login">Sign in</Link></section></main>;
  }
  return <main className="auth-page"><section className="auth-card"><div><p className="eyebrow">Jump in the Mix</p><h1>Create your account</h1><p>Start a private, personal space for relationship follow-up.</p></div>{params.error && <Notice type="error">{params.error}</Notice>}<form action={registerAction} className="form-stack"><label className="field"><span>Name</span><input name="name" autoComplete="name" maxLength={120} required/></label><label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={254} required/></label><label className="field"><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required/><small>Use at least 12 characters.</small></label><button className="button primary" type="submit">Create account</button></form><p>Already have an account? <Link href="/login">Sign in</Link>.</p></section></main>;
}
