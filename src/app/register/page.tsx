import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { registerAction } from "@/lib/auth-actions";
import { hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { pilotRegistrationOpen } from "@/lib/pilot-registration";
import { prisma } from "@/lib/prisma";
import { validAccessToken } from "@/lib/referral-access";
import { getAdmissionPolicy } from "@/lib/admission";
import { PublicTrustLinks } from "@/components/PublicTrustLinks";
import { storedMarketingScenario } from "@/lib/marketing-scenarios";

export const metadata: Metadata = { title: "Your invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; invite?: string }> }) {
  const params = await searchParams;
  const token = params.invite ?? "";
  const pilotOpen = env.pilotMode && await pilotRegistrationOpen();
  const invite = !env.pilotMode && validAccessToken(token)
    ? await prisma.referralAccessInvite.findFirst({ where: { tokenHash: hashAuthToken(token), acceptedAt: null, revokedAt: null }, select: { id: true, marketingScenario: true, marketingScenarioVersion: true } })
    : null;
  const paused = Boolean(invite) && (await getAdmissionPolicy()).redemptionPaused;
  const scenario = storedMarketingScenario(invite?.marketingScenario, invite?.marketingScenarioVersion);
  return <main className="auth-shell"><section className="auth-card">
    <Logo />
    {!pilotOpen && !invite ? <>
      <div><p className="eyebrow">Free · Through your network</p><h1>{token ? "This invitation is unavailable" : "An invitation from someone you know"}</h1>
      <p>{token ? "This link is invalid, revoked, or already used. If you already created your account, sign in below." : "Jump in the Mix grows through personal connections. Each member has five invitations to share with contacts through the Jump in the Mix System Mix. Ask someone in your network to invite you."}</p></div>
      <Link className="button primary" href="/waitlist">Join the waitlist</Link>
      <p>Have a unique invitation link? Open it to create your free account.</p><Link className="button" href="/login">Sign in</Link>
    </> : paused ? <>
      <h1>Account creation is temporarily paused</h1><p>Your invitation has not been used. Please open this same link again later.</p><Link className="button" href="/login">Sign in to an existing account</Link>
    </> : <>
      <div><p className="eyebrow">{pilotOpen ? "Private owner setup" : "You’re invited"}</p><h1>Create your free account</h1><p>{pilotOpen ? "Set up the owner account for this private installation." : "Use the email address your invitation was sent to. After verification, start with one person and review every follow-up before sending."}</p>{scenario && <p>Your {scenario.label.toLowerCase()} starter will be ready to review. You can change it or skip setup.</p>}</div>
      {params.error && <Notice type="error">{params.error}</Notice>}
      <form action={registerAction} className="form-stack">
        {invite && <input type="hidden" name="invite" value={token} />}
        <label className="field"><span>Your name</span><input name="name" autoComplete="name" maxLength={120} required /></label>
        <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label className="field"><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /><small>Use at least 12 characters.</small></label>
        <button className="button primary" type="submit">Create free account</button>
      </form><p>Already have an account? <Link href="/login">Sign in</Link>.</p>
    </>}
    <PublicTrustLinks />
  </section></main>;
}
