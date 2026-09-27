import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { SystemMixInviteForm } from "@/components/SystemMixInviteForm";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revokeSystemInviteAction } from "@/lib/system-mix-actions";
import { REFERRAL_INVITE_LIMIT, SystemMixError } from "@/lib/system-mix";
import { getAdmissionPolicy } from "@/lib/admission";
import { getPublishedSystemMix } from "@/lib/system-mix-store";

export const metadata: Metadata = { title: "Invite people" };

type Invite = { acceptedAt: Date | null; revokedAt: Date | null; lastSentAt: Date | null; manualDelivery: boolean; reminder: { status: string } | null; delivery: { status: string } | null };
/** The invitation's state as [label, status-pill tone]. */
function inviteStatus(invite: Invite): [string, string] {
  if (invite.acceptedAt) return ["Accepted", "done"];
  if (invite.revokedAt) return ["Revoked", ""];
  if (invite.manualDelivery) return invite.reminder?.status === "DONE" ? ["Marked sent by you", "done"] : invite.reminder?.status === "SKIPPED" ? ["Reminder skipped · link still available", ""] : ["Ready to send · not sent yet", "email-pending"];
  if (invite.lastSentAt) return ["Invitation sent", "done"];
  return invite.delivery?.status === "QUEUED" || invite.delivery?.status === "SENDING" ? ["Invitation queued", "email-pending"] : ["Delivery needs review · contact support", "email-failed"];
}

export default async function SystemMixPage({ searchParams }: { searchParams: Promise<{ error?: string; at?: string; sig?: string; revoked?: string; welcome?: string }> }) {
  const { session, workspace, user, impersonation } = await requireWorkspace();
  const params = await searchParams;
  if (impersonation) return <div className="page"><Notice type="info">Personal invitations are unavailable in view-only support sessions.</Notice></div>;
  const [owner, invites] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { referralInvitesIssued: true } }),
    prisma.referralAccessInvite.findMany({ where: { inviterUserId: user.id, workspaceId: workspace.id }, select: { id: true, contactId: true, recipientEmail: true, acceptedAt: true, revokedAt: true, lastSentAt: true, recipientPhone: true, manualDelivery: true, reminder: { select: { id: true, status: true } }, delivery: { select: { status: true } }, contact: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } })
  ]);
  const remaining = Math.max(0, REFERRAL_INVITE_LIMIT - owner.referralInvitesIssued);
  const policy = await getAdmissionPolicy();
  const admissionProblem = policy.grantsPaused || policy.referralsPaused ? "New invitations are paused. Your remaining invitations are unchanged." : null;
  let published = null, contentProblem = "";
  if (remaining > 0 && !admissionProblem) {
    try { published = await getPublishedSystemMix(); }
    catch (error) { if (!(error instanceof SystemMixError)) throw error; contentProblem = error.message; }
  }
  return <div className="page page--form invite-page">
    <header className="page-header"><div><h1>Invite people</h1><p>Give free access to people you know. Every member has three personal invitations.</p></div></header>
    {params.welcome && <Notice type="success">Your setup is ready. Invite someone you know, or go to <Link href="/jumps">Today</Link> for your follow-ups.</Notice>}
    {params.revoked && <Notice type="success">The invitation can no longer be used.</Notice>}
    <UrlErrorNotice params={params} viewer={session} />
    {contentProblem && <Notice type="info">{contentProblem}</Notice>}
    <section className="invite-compose" aria-labelledby="invite-allowance">
      <div className="invite-allowance">
        <h2 id="invite-allowance">{remaining} of {REFERRAL_INVITE_LIMIT} invitations remaining</h2>
        <span className="invite-slots" aria-hidden="true">{Array.from({ length: REFERRAL_INVITE_LIMIT }, (_, index) => <span key={index} className={index < remaining ? "is-open" : undefined} />)}</span>
      </div>
      {remaining > 0 && admissionProblem ? <Notice type="info">{admissionProblem}</Notice> : remaining > 0 ? <>
        <p className="invite-lede">Invitations aren’t emailed for you. Each one goes to Today, ready for you to send from your own email or text app.</p>
        <ol className="invite-steps" aria-label="How inviting works">
          <li><span aria-hidden="true">1</span>Add people below</li>
          <li><span aria-hidden="true">2</span>Open each one in Today</li>
          <li><span aria-hidden="true">3</span>Send it from your email or text app</li>
        </ol>
        {published ? <SystemMixInviteForm key={published.version} sender={user.name} remaining={remaining} version={published.version} content={published.content} invitedContactIds={invites.flatMap(invite => invite.contactId ? [invite.contactId] : [])} /> : <p>Invitation wording is temporarily unavailable.</p>}
      </> : <p className="invite-lede">You’ve used your three invitations. You can still see their status below.</p>}
    </section>
    {invites.length > 0 && <section className="invite-sent" aria-labelledby="invite-sent-heading"><h2 id="invite-sent-heading">Your invitations</h2><ul className="invite-list">{invites.map(invite => {
      const [status, tone] = inviteStatus(invite), name = invite.contact?.displayName ?? "Deleted contact", address = invite.recipientEmail ?? invite.recipientPhone;
      return <li key={invite.id} className="invite-list-row">
        <span className="invite-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "?"}</span>
        <span className="invite-person"><h3>{name}</h3><small>{address}</small></span>
        <span className={`status-pill${tone ? ` ${tone}` : ""}`}>{status}</span>
        {!invite.acceptedAt && !invite.revokedAt && <span className="invite-list-actions">
          {invite.reminder && <Link className={`button small${invite.reminder.status === "PENDING" ? " primary" : ""}`} href={`/jumps?range=all&jump=${invite.reminder.id}#jump-${invite.reminder.id}`} aria-label={`${invite.reminder.status === "PENDING" ? "Send" : "Open"} the invitation for ${name} in Today`}>{invite.reminder.status === "PENDING" ? "Send now" : "Open in Today"}</Link>}
          <ConfirmDialog trigger="Revoke invitation…" triggerClassName="text-button" title={`Revoke invitation for ${address}?`} description="The signup link will stop working and its pending reminder will be removed. This permanently used slot will not be returned." danger><form action={revokeSystemInviteAction}><input type="hidden" name="id" value={invite.id} /><button className="button danger">Confirm revocation</button></form></ConfirmDialog>
        </span>}
      </li>;
    })}</ul><p className="invite-footnote">Revoking an invitation disables its link and removes its pending reminder. It does not restore an invitation slot.</p></section>}
  </div>;
}
