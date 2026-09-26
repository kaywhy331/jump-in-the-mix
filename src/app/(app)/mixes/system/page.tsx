import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { SystemMixInviteForm } from "@/components/SystemMixInviteForm";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revokeSystemInviteAction } from "@/lib/system-mix-actions";
import { REFERRAL_INVITE_LIMIT, SYSTEM_MIX_NAME, SystemMixError } from "@/lib/system-mix";
import { getAdmissionPolicy } from "@/lib/admission";
import { getPublishedSystemMix } from "@/lib/system-mix-store";

export const metadata: Metadata = { title: "Your three invitations" };
export default async function SystemMixPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; at?: string; sig?: string; revoked?: string; welcome?: string }> }) {
  const { session, workspace, user, impersonation } = await requireWorkspace();
  const params = await searchParams;
  if (impersonation) return <div className="page"><Notice type="info">Personal invitations are unavailable in view-only support sessions.</Notice></div>;
  const q = params.q?.trim().slice(0, 120) ?? "";
  const [owner, invites, contacts] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { referralInvitesIssued: true } }),
    prisma.referralAccessInvite.findMany({ where: { inviterUserId: user.id, workspaceId: workspace.id }, select: { id: true, contactId: true, recipientEmail: true, acceptedAt: true, revokedAt: true, lastSentAt: true, recipientPhone: true, manualDelivery: true, reminder: { select: { id: true, status: true } }, delivery: { select: { status: true } }, contact: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.contact.findMany({ where: { workspaceId: workspace.id, archivedAt: null, OR: [{ emails: { some: {} } }, { phones: { some: {} } }], ...(q ? { displayName: { contains: q, mode: "insensitive" } } : {}) }, select: { id: true, displayName: true, emails: { select: { email: true }, orderBy: { isPrimary: "desc" } }, phones: { select: { phone: true }, orderBy: { isPrimary: "desc" } } }, orderBy: { displayName: "asc" }, take: 50 })
  ]);
  const remaining = Math.max(0, REFERRAL_INVITE_LIMIT - owner.referralInvitesIssued);
  const policy = await getAdmissionPolicy();
  const admissionProblem = policy.grantsPaused || policy.referralsPaused ? "New invitations are paused. Your remaining invitations are unchanged." : null;
  const available = contacts.filter(contact => !invites.some(invite => invite.contactId === contact.id));
  let published = null, contentProblem = "";
  if (remaining > 0 && !admissionProblem) {
    try { published = await getPublishedSystemMix(); }
    catch (error) { if (!(error instanceof SystemMixError)) throw error; contentProblem = error.message; }
  }
  return <div className="page">
    <header className="page-header"><div><h1>{SYSTEM_MIX_NAME}</h1><p>Make a personal introduction. Share free access with someone already in your circle.</p></div><Link className="button" href="/jumps">Go to Today</Link></header>
    {params.welcome && <Notice type="success">Your setup is ready. Try your first networking mix, or go to Today for your follow-ups.</Notice>}
    {params.revoked && <Notice type="success">The invitation can no longer be used.</Notice>}
    <UrlErrorNotice params={params} viewer={session} />
    {contentProblem && <Notice type="info">{contentProblem}</Notice>}
    <section className="card"><h2>{remaining} of {REFERRAL_INVITE_LIMIT} invitations remaining</h2><p>Every member gets three personal invitations in total. Add one to three email addresses or text numbers. We prepare a single-use signup link for each person and add a reminder to Today.</p>
      {remaining > 0 && admissionProblem ? <Notice type="info">{admissionProblem}</Notice> : remaining > 0 ? <>
        {published ? <SystemMixInviteForm key={published.version} contacts={available} sender={user.name} remaining={remaining} version={published.version} content={published.content} /> : <p>Invitation wording is temporarily unavailable.</p>}
        <Link className="inline-action" href="/contacts/new">Add someone to your circle</Link>
      </> : <p>You’ve used your three invitations. You can still see their status below.</p>}
    </section>
    {invites.length > 0 && <section className="card"><h2>Your invitations</h2>{invites.map(invite => <article key={invite.id}>
      <h3>{invite.contact?.displayName ?? "Deleted contact"}</h3><p>{invite.recipientEmail ?? invite.recipientPhone}</p>
      <p>{invite.acceptedAt ? "Accepted" : invite.revokedAt ? "Revoked" : invite.manualDelivery ? invite.reminder?.status === "DONE" ? "Marked sent by you" : invite.reminder?.status === "SKIPPED" ? "Reminder skipped · link still available" : "Ready in Today" : invite.lastSentAt ? "Invitation sent" : invite.delivery?.status === "QUEUED" || invite.delivery?.status === "SENDING" ? "Invitation queued" : "Delivery needs review · contact support"}</p>
      {!invite.acceptedAt && !invite.revokedAt && <div className="form-actions">
        {invite.reminder && <Link className="button" href={`/jumps?range=all&jump=${invite.reminder.id}#jump-${invite.reminder.id}`}>Open this invitation reminder</Link>}<ConfirmDialog trigger="Revoke invitation…" title={`Revoke invitation for ${invite.recipientEmail ?? invite.recipientPhone}?`} description="The signup link will stop working and its pending reminder will be removed. This permanently used slot will not be returned." danger><form action={revokeSystemInviteAction}><input type="hidden" name="id" value={invite.id} /><button className="button danger">Confirm revocation</button></form></ConfirmDialog>
      </div>}
    </article>)}<p>Revoking an invitation disables its link and removes its pending reminder. It does not restore an invitation slot.</p></section>}
  </div>;
}
