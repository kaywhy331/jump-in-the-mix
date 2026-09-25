import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { PasswordInput } from "@/components/PasswordInput";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { registerFormAction } from "@/lib/auth-actions";
import { hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { verifiedErrorMessage } from "@/lib/form-errors";
import { pilotRegistrationOpen } from "@/lib/pilot-registration";
import { prisma } from "@/lib/prisma";
import { validAccessToken } from "@/lib/referral-access";
import { getAdmissionPolicy } from "@/lib/admission";
import { PublicTrustLinks } from "@/components/PublicTrustLinks";
import { storedMarketingScenario } from "@/lib/marketing-scenarios";

export const metadata: Metadata = { title: "Your invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; sig?: string; invite?: string }> }) {
  const params = await searchParams;
  const error = verifiedErrorMessage(params);
  const token = params.invite ?? "";
  const pilotOpen = env.pilotMode && await pilotRegistrationOpen();
  const invite = !env.pilotMode && validAccessToken(token)
    ? await prisma.referralAccessInvite.findFirst({ where: { tokenHash: hashAuthToken(token), acceptedAt: null, revokedAt: null }, select: { id: true, recipientEmail: true, recipientPhone: true, marketingScenario: true, marketingScenarioVersion: true } })
    : null;
  const paused = Boolean(invite) && (await getAdmissionPolicy()).redemptionPaused;
  const scenario = storedMarketingScenario(invite?.marketingScenario, invite?.marketingScenarioVersion);
  // An email invitation is tied to one address; a text invitation lets the person choose and confirm one.
  const invitedEmail = invite?.recipientEmail ?? null;
  const textInvitation = Boolean(invite && !invitedEmail && invite.recipientPhone);
  return <main className="auth-shell"><section className="auth-card">
    <Logo />
    {!pilotOpen && !invite ? <>
      <div><h1>{token ? "This invitation is unavailable" : "An invitation from someone you know"}</h1>
      <p>{token ? "This link is invalid, revoked, or already used. If you already created your account, sign in below." : "Jump in the Mix grows through personal connections. Each member has three invitations to share with contacts by text or email. Ask someone in your network to invite you."}</p></div>
      <Link className="button primary" href="/waitlist">Join the waitlist</Link>
      <p>Have a unique invitation link? Open it to create your free account.</p><Link className="button" href="/login">Sign in</Link>
    </> : paused ? <>
      <h1>Account creation is temporarily paused</h1><p>Your invitation has not been used. Please open this same link again later.</p><Link className="button" href="/login">Sign in to an existing account</Link>
    </> : <>
      <div><h1>Create your free account</h1><p>{pilotOpen ? "Set up the owner account for this private installation." : textInvitation ? "Choose your email address to create an account. Verify it to start with one person and review every follow-up before sending." : "Your account uses the email address your invitation was sent to. After verification, start with one person and review every follow-up before sending."}</p>{scenario && <p>Your {scenario.label.toLowerCase()} starter will be ready to review. You can change it or skip setup.</p>}</div>
      {error && <Notice type="error">{error}</Notice>}
      <ActionForm action={registerFormAction} className="form-stack">
        {invite && <input type="hidden" name="invite" value={token} />}
        <label className="field"><span>Your name</span><input name="name" autoComplete="name" maxLength={120} required /></label>
        {invitedEmail
          ? <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={invitedEmail} readOnly required /><small>Invitation sent to {invitedEmail}</small></label>
          : <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
        {textInvitation && <label className="field"><span>Confirm email</span><input name="confirmEmail" type="email" autoComplete="off" maxLength={254} required /></label>}
        <label className="field"><span>Password</span><PasswordInput aria-label="Password" name="password"  autoComplete="new-password" minLength={12} maxLength={72} required /><small>Use at least 12 characters.</small></label>
        <FormSubmitButton label="Create free account" pendingLabel="Please wait…" />
      </ActionForm><p>Already have an account? <Link href="/login">Sign in</Link>.</p>
    </>}
    <p><Link href="/contact">Get help with an invitation or account</Link>.</p>
    <PublicTrustLinks />
  </section></main>;
}
