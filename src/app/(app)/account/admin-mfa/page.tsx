import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { AdminMfaPanel } from "@/components/AdminMfaPanel";
import {
  adminMfaCredentialStatus,
  adminMfaOtpAuthUri,
  adminMfaSessionIsVerified,
  prepareAdminMfaEnrollment
} from "@/lib/admin-mfa";
import { requirePlatformAdminIdentity } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Administrator MFA" };

type SearchParams = { returnTo?: string; setup?: string; verify?: string };

function safeReturnTo(value: string | undefined): string {
  if (!value?.startsWith("/admin") || value.startsWith("//")) return "/admin";
  return value;
}

export default async function AdminMfaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { session, user }] = await Promise.all([searchParams, requirePlatformAdminIdentity()]);
  const displayPreferences = await displayPreferencesForUser(user.id);
  const returnTo = safeReturnTo(params.returnTo);
  const [credential, verified] = await Promise.all([
    adminMfaCredentialStatus(user.id),
    adminMfaSessionIsVerified(session.id, user.id)
  ]);

  if (credential.enabledAt && verified && !params.verify) {
    return (
      <div className="page admin-mfa-page">
        <header className="page-header"><div><h1>Administrator MFA</h1><p>Administrator access is protected with a verified second factor.</p></div></header>
        <section className="card admin-mfa-ready-card">
          <div className="card-header"><div><h2>This session is verified</h2><p>Step-up access remains valid for up to {env.adminMfaMaxAgeMinutes} minutes on this signed-in session.</p></div><span className="status-pill done">Protected</span></div>
          <dl className="account-definition-list">
            <div><dt>Enabled</dt><dd>{formatDateTime(credential.enabledAt, displayPreferences)}</dd></div>
            <div><dt>Recovery codes remaining</dt><dd>{credential.recoveryCodesRemaining}</dd></div>
          </dl>
          <div className="form-actions"><Link className="button primary" href={returnTo}>Continue to Admin</Link></div>
        </section>
      </div>
    );
  }

  if (credential.enabledAt) {
    return (
      <div className="page admin-mfa-page">
        <header className="page-header"><div><h1>Administrator verification</h1><p>Confirm a second factor before opening platform administration or starting a support view.</p></div></header>
        <AdminMfaPanel mode="verify" returnTo={returnTo} />
      </div>
    );
  }

  if (!user.passwordHash) {
    return (
      <div className="page admin-mfa-page">
        <header className="page-header"><div><h1>Secure administrator access</h1><p>Administrator MFA requires password reauthentication during setup.</p></div></header>
        <section className="card"><p>Set an account password first, then return here to enroll an authenticator.</p><Link className="button primary" href="/account?section=security">Set account password</Link></section>
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
      <header className="page-header"><div><h1>Secure administrator access</h1><p>Administrator MFA is required before platform controls and audited support views can be used.</p></div></header>
      <AdminMfaPanel mode="setup" returnTo={returnTo} secret={enrollment.secret} qrDataUrl={qrDataUrl} />
    </div>
  );
}
