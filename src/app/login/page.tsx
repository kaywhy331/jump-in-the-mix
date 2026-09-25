import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { PasswordInput } from "@/components/PasswordInput";
import { PublicTrustLinks } from "@/components/PublicTrustLinks";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { SocialSignInOptions } from "@/components/SocialSignInOptions";
import { accountHome } from "@/lib/account-home";
import { getCurrentSession } from "@/lib/auth";
import { demoLoginAction, loginFormAction, requestMagicLinkFormAction } from "@/lib/auth-actions";
import { customerReturnPath } from "@/lib/customer-return-path";
import { env } from "@/lib/env";
import { verifiedErrorMessage } from "@/lib/form-errors";
import { pilotRegistrationOpen } from "@/lib/pilot-registration";
import { appleSignInConfigured, googleSignInConfigured } from "@/lib/social-auth";
import { transactionalEmailConfigured } from "@/lib/transactional-email";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

type SearchParams = {
  next?: string;
  reauth?: string;
  error?: string;
  sig?: string;
  firstRun?: string;
  reset?: string;
  verified?: string;
  signedOutEverywhere?: string;
  magicSent?: string;
  devToken?: string;
};

/**
 * Where a browser that is already signed in belongs instead of a second sign-in form: only a session that
 * requireWorkspace() accepts as it stands (verified when verification is required, with a workspace, not a
 * support view), so the destination can never send the person back here. Everyone else sees the form.
 */
async function signedInHome(next: string | undefined): Promise<string | null> {
  try {
    const session = await getCurrentSession();
    if (!session || session.impersonation) return null;
    if ((env.requireEmailVerification || !env.pilotMode) && !session.user.emailVerifiedAt) return null;
    const membership = session.user.memberships[0];
    if (!membership) return null;
    return await accountHome(session.user.id, membership.workspace.profile?.onboardingDone ? customerReturnPath(next) ?? "/jumps" : "/onboarding");
  } catch {
    return null;
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, registrationOpen] = await Promise.all([searchParams, pilotRegistrationOpen()]);
  // An explicit re-authentication (?reauth=…, as account deletion uses) always shows the form, so a browser
  // that is signed in can still sign in again or as another account.
  const home = params.reauth ? null : await signedInHome(params.next);
  if (home) redirect(home);
  const error = verifiedErrorMessage(params);
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Welcome back</h1>
        <p>{params.reauth === "deletion" ? "Sign in with your usual method to confirm your identity, then return to Data & privacy to complete deletion." : "Sign in and see who needs your attention today."}</p>
        {params.firstRun && registrationOpen && <Notice type="success">Installation complete. Create the private owner account to begin.</Notice>}
        {params.reset && <Notice type="success">Your password was reset. Sign in with the new password.</Notice>}
        {params.verified && <Notice type="success">Your email is verified. You can sign in securely.</Notice>}
        {params.signedOutEverywhere && <Notice type="success">All sessions were signed out.</Notice>}
        {params.magicSent && <Notice type="success">If you have an account, check your inbox for a sign-in link. It expires in 15 minutes.</Notice>}
        {params.devToken && process.env.NODE_ENV !== "production" && <Notice type="info"><Link href={`/api/auth/magic?token=${encodeURIComponent(params.devToken)}`}>Open the development sign-in link</Link>.</Notice>}
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
        <SocialSignInOptions returnTo={params.next} google={googleSignInConfigured()} apple={appleSignInConfigured()} />
        <ActionForm action={loginFormAction} className="form-stack">
          <input type="hidden" name="next" value={params.next ?? ""} />
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={env.demoMode ? env.demoEmail : ""} /></div>
          <div className="field"><label htmlFor="password">Password</label><PasswordInput id="password" name="password"  autoComplete="current-password" required defaultValue={env.demoMode ? env.demoPassword : ""} /></div>
          <div className="auth-inline-actions"><Link href="/forgot-password">Forgot password?</Link></div>
          <FormSubmitButton label="Sign in" pendingLabel="Please wait…" />
        </ActionForm>
        {transactionalEmailConfigured() && <>
          <div className="auth-divider"><span>or skip the password</span></div>
          <ActionForm action={requestMagicLinkFormAction} className="form-stack">
            <input type="hidden" name="next" value={params.next ?? ""} />
            <div className="field"><label htmlFor="magicEmail">Email me a secure sign-in link</label><input id="magicEmail" name="email" type="email" autoComplete="email" inputMode="email" required /></div>
            <FormSubmitButton label="Email sign-in link" pendingLabel="Please wait…" />
          </ActionForm>
        </>}
        <div className="auth-footer">{registrationOpen ? <>New here? <Link href="/waitlist"><strong>Join the waitlist</strong></Link></> : <>Owner setup is complete.</>}</div>
        <PublicTrustLinks />
      </section>
    </main>
  );
}
