import { AdmissionImpactPreview } from "@/components/AdmissionImpactPreview";
import { transactionalEmailConfigured } from "@/lib/transactional-email";
import { integrationEncryptionConfigured } from "@/lib/integration-crypto";
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { requirePlatformAdmin } from "@/lib/auth";
import { getAdmissionSnapshot, issuanceProblem } from "@/lib/admission";
import { changeAdmissionPolicyAction, discardAdmissionDraftAction } from "@/lib/admission-admin-actions";
import { readAdmissionDraft } from "@/lib/admission-draft-cookie";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Admission" };

export default async function AdmissionPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; draft?: string; operation?: string }> }) {
  const { session, user, permissions } = await requirePlatformAdmin("settings.manage");
  const params = await searchParams;
  const snapshot = await getAdmissionSnapshot();
  const { policy, accounts, outstanding, committed, remaining } = snapshot;
  const readiness = issuanceProblem(snapshot, "WAITLIST") ?? (!transactionalEmailConfigured() || !integrationEncryptionConfigured() ? "Sending configuration needs attention before invitations can be queued." : "Capacity and sending configuration permit new invitations. Recipient eligibility and worker health are checked separately.");
  const state = await readAdmissionDraft(session.id, user.id);
  const draft = state?.kind === "draft" && state.operation === params.draft ? state : null;
  const saved = state?.kind === "saved" && state.operation === params.operation && String(state.revision) === params.saved && state.revision === policy.revision;
  const operation = draft?.operation ?? randomUUID();
  const fields = draft?.fields ?? policy;
  const conflict = draft !== null && draft.revision !== policy.revision;
  const schedule = await prisma.waitlistSchedule.findUnique({ where: { id: "default" }, select: { paused: true } });
  return <div className="page admin-control-page">
    <header className="page-header"><div><h1>Admin · Admission</h1><p>Control how quickly free accounts grow. Each unused invitation reserves room for one person.</p></div></header>
    {params.error && !conflict && <Notice type="error">{params.error}</Notice>}
    {saved && <Notice type="success">Admission controls saved.</Notice>}
    {draft && <Notice type="info">Your admission changes have not been saved. Review the restored draft, re-enter your administrator password, then select Save admission controls. Authenticator verification alone does not save changes.</Notice>}
    {params.draft && !draft && <Notice type="error">This draft expired, was replaced, or belongs to another session. The form shows the current saved settings.</Notice>}
    {(policy.accountCeiling === 0 || policy.outstandingCeiling === 0) && <Notice type="info">New invitations need configured limits. Waitlist requests and existing invitation links remain available unless paused below.</Notice>}
    {committed > policy.accountCeiling && <Notice type="info">Existing accounts and invitations exceed the current limit. New invitations will wait. Already-issued links keep their reserved access.</Notice>}
    <section className="admin-pulse" aria-label="Access capacity"><div className="admin-pulse-item"><span>Customer accounts</span><strong>{accounts}</strong><small>Includes suspended and unverified</small></div><div className="admin-pulse-item"><span>Reserved invitations</span><strong>{outstanding}</strong><small>Unused invitations hold their places</small></div><div className="admin-pulse-item"><span>Available capacity</span><strong>{remaining}</strong><small>Before pause, recipient and delivery checks</small></div></section>
    <section className="card"><h2>Effective readiness</h2><p role="status">{readiness}</p><p>Saved limits: {policy.accountCeiling} accounts and reservations · {policy.outstandingCeiling} outstanding invitations.</p>
      <dl className="support-definition-list">{[["New waitlist requests", policy.collectionPaused], ["All new customer invitations", policy.grantsPaused], ["Member referrals", policy.grantsPaused || policy.referralsPaused], ["Account creation from issued invitations", policy.redemptionPaused]].map(([label, paused]) => <div key={String(label)}><dt>{label}</dt><dd>{paused ? "Paused" : "Open"}</dd></div>)}</dl>
      <p>Suspended and unverified customer accounts count. Staff-only accounts do not. Pending and uncertain email deliveries keep their reservations until the invitation is used or revoked.</p>
      <p>Weekly waves are {!schedule ? "not configured" : schedule.paused ? "paused" : "scheduled"}. A due wave waits until its whole eligible batch fits, up to 10 people: 5 oldest confirmed requests, then 5 random remaining requests. Manual invitations also need room for the whole eligible selection.</p>
      {permissions.includes("waitlist.read") && <Link className="inline-action" href="/admin/waitlist">Manage waitlist waves</Link>}
    </section>
    <section className="card"><h2>Limits and pauses</h2>
      <form key={`${operation}:${randomUUID()}`} action={changeAdmissionPolicyAction} className="form-stack">
        <input type="hidden" name="operation" value={operation} />
        <input type="hidden" name="revision" value={policy.revision} />
        {conflict && <Notice type="error">Admission controls changed while this draft was open. Compare your draft with the current saved settings above before confirming a replacement.{params.error && <p>{params.error}</p>}</Notice>}
        <label className="field"><span>Total account and reservation limit</span><input name="accountCeiling" type="number" min={0} max={1_000_000} step={1} defaultValue={fields.accountCeiling} required /><small>Accounts plus unused invitations. Zero stops new invitations. Set a limit based on measured performance and your budget.</small></label>
        <label className="field"><span>Outstanding invitation limit</span><input name="outstandingCeiling" type="number" min={0} max={1_000_000} step={1} defaultValue={fields.outstandingCeiling} required /><small>Caps unused invitations across referrals, waves, and manual grants. Must be no greater than the total limit.</small></label>
        <label><input name="collectionPaused" type="checkbox" defaultChecked={fields.collectionPaused} /> Pause new waitlist requests</label>
        <p>Existing confirmation links and withdrawal requests continue to work.</p>
        <label><input name="grantsPaused" type="checkbox" defaultChecked={fields.grantsPaused} /> Pause all new customer invitations</label>
        <p>Stops new wave, manual, and member invitations. Previously queued emails and issued links continue.</p>
        <label><input name="referralsPaused" type="checkbox" defaultChecked={fields.referralsPaused} /> Pause new member referrals</label>
        <p>Applies only to the System Mix. A blocked attempt never spends one of the member’s five invitations.</p>
        <details className="admin-release-confirmation" open={fields.redemptionPaused}><summary>Emergency account-creation control</summary><label><input name="redemptionPaused" type="checkbox" defaultChecked={fields.redemptionPaused} /> Emergency: pause account creation from invitations</label>
        <p>Recipients can retry the same link after you resume. Existing account sign-in and staff onboarding continue.</p></details>
        <AdmissionImpactPreview accounts={accounts} outstanding={outstanding} currentRemaining={remaining} />
        <label className="field"><span>Reason for admission change</span><textarea name="reason" minLength={10} maxLength={500} required rows={3} defaultValue={draft?.fields.reason ?? ""} /></label>
        <label className="field"><span>Your administrator password</span><input name="currentPassword" type="password" autoComplete="current-password" maxLength={72} required /></label>
        <p>Saving requires your current permission, password, and authenticator verification within the last 10 minutes. Lowering a limit does not cancel existing invitations or suspend accounts.</p>
        {conflict && <label><input name="reviewedRevision" type="checkbox" value={policy.revision} required /> I reviewed the current saved settings and want to apply this draft.</label>}
        <FormSubmitButton label="Save admission controls" pendingLabel="Saving admission controls…" />
      </form>
      {draft && <form action={discardAdmissionDraftAction}><input type="hidden" name="operation" value={operation} /><button className="button" type="submit">Discard draft</button><p>Drafts expire after 30 minutes and are available only in this signed-in session. Starting another admission save replaces this draft.</p></form>}
    </section>
  </div>;
}
