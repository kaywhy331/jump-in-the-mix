import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { cache } from "react";
import { AdminMfaPanel } from "@/components/AdminMfaPanel";
import {
  adminMfaCredentialStatus,
  adminMfaOtpAuthUri,
  adminMfaSessionIsVerified,
  prepareAdminMfaEnrollment
} from "@/lib/admin-mfa";
import { requirePlatformAdminIdentity } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { firstAdminDestination, safeAdminReturnTo } from "@/lib/admin-navigation";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";

type SearchParams = { returnTo?: string; setup?: string; verify?: string };
/** Each state's one name: its H1 and its document title (JITM-10 §2.22). */
const PAGE_NAMES = { verified: "Administrator MFA", verify: "Administrator verification", password: "Secure administrator access", setup: "Secure administrator access" } as const;

/** The staff member's MFA state, read once per request: the title and the page share it. */
const readMfaState = cache(async (verifyRequested: boolean) => {
  const identity = await requirePlatformAdminIdentity();
  const [credential, verified] = await Promise.all([
    adminMfaCredentialStatus(identity.user.id),
    adminMfaSessionIsVerified(identity.session.id, identity.user.id)
  ]);
  const state: keyof typeof PAGE_NAMES = credential.enabledAt ? (verified && !verifyRequested ? "verified" : "verify") : identity.user.passwordHash ? "setup" : "password";
  return { identity, credential, verified, state };
});

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  return { title: PAGE_NAMES[(await readMfaState(Boolean((await searchParams).verify))).state] };
}

export default async function AdminMfaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { identity: { session, user, permissions }, credential, verified, state } = await readMfaState(Boolean(params.verify));
  const displayPreferences = await displayPreferencesForUser(user.id);
  const returnTo = safeAdminReturnTo(params.returnTo, firstAdminDestination(permissions));

  if (state === "verified" && credential.enabledAt) {
    return (
      <div className="page admin-mfa-page">
        <header className="page-header"><div><h1>{PAGE_NAMES.verified}</h1></div></header>
        <section className="card admin-mfa-ready-card">
          <div className="card-header"><div><h2>This session is verified</h2><p>Browsing: up to {env.adminMfaMaxAgeMinutes} minutes. Sensitive changes: verify within 10 minutes; a password may also be required.</p></div><span className="status-pill done">Protected</span></div>
          <dl className="account-definition-list">
            <div><dt>Enabled</dt><dd>{formatDateTime(credential.enabledAt, displayPreferences)}</dd></div>
            <div><dt>Recovery codes remaining</dt><dd>{credential.recoveryCodesRemaining}</dd></div>
          </dl>
          <p>Keep unused recovery codes in a password manager. If you have lost your authenticator or have no codes left, contact an owner through your established recovery process before signing out.</p><div className="form-actions"><Link className="button primary" href={returnTo}>Continue to Admin</Link><Link className="button" href={`/account/admin-mfa?verify=1&returnTo=${encodeURIComponent(returnTo)}`}>Verify for a sensitive change</Link></div>
        </section>
      </div>
    );
  }

  if (state === "verify") {
    return (
      <div className="page admin-mfa-page">
        <header className="page-header"><div><h1>{PAGE_NAMES.verify}</h1><p>Enter your authenticator or recovery code.</p></div></header>
        <AdminMfaPanel mode="verify" returnTo={returnTo} canReturn={verified} />
      </div>
    );
  }

  if (state === "password") {
    return (
      <div className="page admin-mfa-page">
        <header className="page-header"><div><h1>{PAGE_NAMES.password}</h1><p>Set a password to enroll MFA.</p></div></header>
        <section className="card"><p>Set an account password first, then return here to enroll an authenticator.</p><Link className="button primary" href="/forgot-password">Set account password</Link></section>
      </div>
    );
  }

  const enrollment = await prepareAdminMfaEnrollment(user.id);
  const otpAuthUri = adminMfaOtpAuthUri(user.email, enrollment.secret);
  const qrDataUrl = await QRCode.toDataURL(otpAuthUri, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: "M"
  });

  return (
    <div className="page admin-mfa-page">
      <header className="page-header"><div><h1>{PAGE_NAMES.setup}</h1><p>Connect an authenticator to use administration.</p></div></header>
      <AdminMfaPanel mode="setup" returnTo={returnTo} secret={enrollment.secret} qrDataUrl={qrDataUrl} />
    </div>
  );
}
