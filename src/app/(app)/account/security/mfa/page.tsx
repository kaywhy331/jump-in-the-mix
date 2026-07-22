import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Notice } from "@/components/Notice";
import { UserMfaPanel } from "@/components/UserMfaPanel";
import { requireWorkspace } from "@/lib/auth";
import { disableUserMfaAction } from "@/lib/user-mfa-actions";
import { prepareUserMfaEnrollment, userMfaCredentialStatus, userMfaOtpAuthUri } from "@/lib/user-mfa";

export const metadata: Metadata = { title: "Multi-factor authentication" };

type SearchParams = { error?: string; disabled?: string };

export default async function UserMfaSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { user, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  if (impersonation) return <div className="page"><Notice type="info">MFA settings are private during a view-only support session.</Notice></div>;
  const status = await userMfaCredentialStatus(user.id);
  if (status.enabledAt) {
    return (
      <div className="page admin-mfa-page">
        {query.disabled && <Notice type="success">MFA was disabled.</Notice>}
        {query.error && <Notice type="error">{query.error}</Notice>}
        <header className="page-header"><div><h1>Multi-factor authentication</h1><p>Protect sign-ins with an authenticator code or one-time recovery code.</p></div><Link className="button" href="/account?section=security">Back to Security</Link></header>
        <section className="card">
          <div className="card-header"><div><h2>MFA is enabled</h2><p>New sign-ins must complete a second-factor challenge before the application or APIs are available.</p></div><span className="status-pill done">Protected</span></div>
          <dl className="account-definition-list"><div><dt>Enabled</dt><dd>{status.enabledAt.toLocaleString()}</dd></div><div><dt>Recovery codes remaining</dt><dd>{status.recoveryCodesRemaining}</dd></div></dl>
        </section>
        <section className="card danger-zone"><div className="card-header"><div><h2>Disable MFA</h2><p>Confirm your password and a current authenticator or recovery code.</p></div></div><form action={disableUserMfaAction} className="form-stack"><label className="field"><span>Current password</span><input type="password" name="currentPassword" autoComplete="current-password" required /></label><label className="field"><span>Authenticator or recovery code</span><input name="code" autoComplete="one-time-code" minLength={6} maxLength={40} required /></label><button className="button danger" type="submit">Disable MFA</button></form></section>
      </div>
    );
  }
  const enrollment = await prepareUserMfaEnrollment(user.id);
  const qrDataUrl = await QRCode.toDataURL(userMfaOtpAuthUri(user.email, enrollment.secret), { width: 220, margin: 1, errorCorrectionLevel: "M" });
  return (
    <div className="page admin-mfa-page">
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header"><div><h1>Enable multi-factor authentication</h1><p>Add an authenticator app and save one-time recovery codes.</p></div><Link className="button" href="/account?section=security">Back to Security</Link></header>
      <UserMfaPanel mode="setup" secret={enrollment.secret} qrDataUrl={qrDataUrl} />
    </div>
  );
}
