import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { requirePlatformAdmin } from "@/lib/auth";
import { getAdmissionSnapshot } from "@/lib/admission";
import { changeAdmissionPolicyAction } from "@/lib/admission-admin-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Admission" };

export default async function AdmissionPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requirePlatformAdmin("settings.manage");
  const params = await searchParams;
  const { policy, accounts, outstanding, committed, remaining } = await getAdmissionSnapshot();
  const schedule = await prisma.waitlistSchedule.findUnique({ where: { id: "default" }, select: { paused: true } });
  return <div className="page admin-control-page">
    <header className="page-header"><div><h1>Admin · Admission</h1><p>Control how quickly free accounts grow. Each unused invitation reserves room for one person.</p></div></header>
    {params.error && <Notice type="error">{params.error}</Notice>}
    {params.saved && <Notice type="success">Admission controls saved.</Notice>}
    {policy.accountCeiling === 0 && <Notice type="info">New invitations need configured limits. Waitlist requests and existing invitation links remain available unless paused below.</Notice>}
    {committed > policy.accountCeiling && <Notice type="info">Existing accounts and invitations exceed the current limit. New invitations will wait. Already-issued links keep their reserved access.</Notice>}
    <section className="card"><h2>Current reservations</h2>
      <p><strong>{accounts}</strong> customer accounts · <strong>{outstanding}</strong> unused invitations · <strong>{remaining}</strong> spaces available for new invitations</p>
      <p>Suspended and unverified customer accounts count. Staff-only accounts do not. Pending and uncertain email deliveries keep their reservations until the invitation is used or revoked.</p>
      <p>Weekly waves are {schedule?.paused ? "paused" : "scheduled"}. A due wave waits until its whole eligible batch fits, up to 10 people: 5 oldest confirmed requests, then 5 random remaining requests. Manual invitations also need room for the whole eligible selection.</p>
      <Link className="inline-action" href="/admin/waitlist">Manage waitlist waves</Link>
    </section>
    <section className="card"><h2>Limits and pauses</h2>
      <form action={changeAdmissionPolicyAction} className="form-stack">
        <input type="hidden" name="revision" value={policy.revision} />
        <label className="field"><span>Total account and reservation limit</span><input name="accountCeiling" type="number" min={0} max={1_000_000} step={1} defaultValue={policy.accountCeiling} required /><small>Accounts plus unused invitations. Zero stops new invitations. Set a limit based on measured performance and your budget.</small></label>
        <label className="field"><span>Outstanding invitation limit</span><input name="outstandingCeiling" type="number" min={0} max={1_000_000} step={1} defaultValue={policy.outstandingCeiling} required /><small>Caps unused invitations across referrals, waves, and manual grants. Must be no greater than the total limit.</small></label>
        <label><input name="collectionPaused" type="checkbox" defaultChecked={policy.collectionPaused} /> Pause new waitlist requests</label>
        <p>Existing confirmation links and withdrawal requests continue to work.</p>
        <label><input name="grantsPaused" type="checkbox" defaultChecked={policy.grantsPaused} /> Pause all new customer invitations</label>
        <p>Stops new wave, manual, and member invitations. Previously queued emails and issued links continue.</p>
        <label><input name="referralsPaused" type="checkbox" defaultChecked={policy.referralsPaused} /> Pause new member referrals</label>
        <p>Applies only to the System Mix. A blocked attempt never spends one of the member’s five invitations.</p>
        <label><input name="redemptionPaused" type="checkbox" defaultChecked={policy.redemptionPaused} /> Emergency: pause account creation from invitations</label>
        <p>Recipients can retry the same link after you resume. Existing account sign-in and staff onboarding continue.</p>
        <label className="field"><span>Reason for admission change</span><textarea name="reason" minLength={10} maxLength={500} required rows={3} /></label>
        <label className="field"><span>Your administrator password</span><input name="currentPassword" type="password" autoComplete="current-password" maxLength={72} required /></label>
        <p>Saving requires your current permission, password, and authenticator verification within the last 10 minutes. Lowering a limit does not cancel existing invitations or suspend accounts.</p>
        <FormSubmitButton label="Save admission controls" pendingLabel="Saving admission controls…" />
      </form>
    </section>
  </div>;
}
