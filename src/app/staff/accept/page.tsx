import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { peekStaffInvitation } from "@/lib/staff-invitations";
import { acceptStaffInvitationAction } from "@/lib/staff-invitation-actions";
import { ADMIN_PERMISSIONS, effectiveAdminPermissions } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up staff access", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AcceptStaffPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  const token = params.token ?? "";
  const invitation = await peekStaffInvitation(token);
  return <main className="auth-shell"><section className="auth-card"><Logo />
    <h1>Set up your staff access</h1>
    {params.error && <Notice type="error">{params.error.slice(0, 500)}</Notice>}
    {!invitation ? <><p>This invitation is unavailable. Ask a Jump in the Mix Owner for a new invitation or access to your existing account.</p><Link href="/login">Sign in to an existing account</Link></> : <>
      <p>You’ve been invited as {invitation.role.toLowerCase()}. Create your staff account, then set up an authenticator to open the admin tools.</p>
      <details><summary>Review the access offered</summary><ul>{effectiveAdminPermissions({ ...invitation, status: "ACTIVE" }).map(permission => <li key={permission}>{ADMIN_PERMISSIONS[permission]}</li>)}</ul></details>
      <p>Invitation expires {invitation.expiresAt.toISOString().slice(0, 16).replace("T", " ")} UTC.</p>
      <form action={acceptStaffInvitationAction} className="form-stack">
        <input type="hidden" name="token" value={token} />
        <label className="field"><span>Your name</span><input name="name" autoComplete="name" minLength={2} maxLength={120} required /></label>
        <label className="field"><span>Invited email</span><input type="email" name="email" autoComplete="email" maxLength={254} required /><small>Use the email address that received this invitation.</small></label>
        <label className="field"><span>Create a password</span><input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={72} required /><small>Use at least 12 characters.</small></label>
        <label className="field"><span>Confirm password</span><input type="password" name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
        <button className="button primary" type="submit">Create staff account</button>
      </form>
      <p>Already have an account? Ask an Owner to add staff access to that verified account.</p>
      <Link href="/waitlist/leave">Stop invitation emails</Link>
    </>}
  </section></main>;
}
