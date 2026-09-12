import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { SystemMixInviteForm } from "@/components/SystemMixInviteForm";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revokeSystemInviteAction } from "@/lib/system-mix-actions";
import { REFERRAL_INVITE_LIMIT, SYSTEM_MIX_NAME, SystemMixError } from "@/lib/system-mix";
import { getAdmissionSnapshot, issuanceProblem } from "@/lib/admission";
import { getPublishedSystemMix } from "@/lib/system-mix-store";

export const metadata: Metadata = { title: "Your five invitations" };
export default async function SystemMixPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; sent?: string; queued?: string; revoked?: string; welcome?: string }> }) {
  const { workspace, user, impersonation } = await requireWorkspace();
  const params = await searchParams;
  if (impersonation) return <div className="page"><Notice type="info">Personal invitations are unavailable in view-only support sessions.</Notice></div>;
  const q = params.q?.trim().slice(0, 120) ?? "";
  const [owner, invites, contacts] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { referralInvitesIssued: true } }),
    prisma.referralAccessInvite.findMany({ where: { inviterUserId: user.id, workspaceId: workspace.id }, select: { id: true, contactId: true, recipientEmail: true, acceptedAt: true, revokedAt: true, lastSentAt: true, delivery: { select: { status: true } }, contact: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.contact.findMany({ where: { workspaceId: workspace.id, archivedAt: null, emails: { some: {} }, ...(q ? { displayName: { contains: q, mode: "insensitive" } } : {}) }, select: { id: true, displayName: true, emails: { select: { email: true }, orderBy: { isPrimary: "desc" } } }, orderBy: { displayName: "asc" }, take: 50 })
  ]);
  const remaining = Math.max(0, REFERRAL_INVITE_LIMIT - owner.referralInvitesIssued);
  const admissionProblem = issuanceProblem(await getAdmissionSnapshot(), "REFERRAL");
  const available = contacts.filter(contact => !invites.some(invite => invite.contactId === contact.id));
  let published = null, contentProblem = "";
  if (remaining > 0 && !admissionProblem) {
    try { published = await getPublishedSystemMix(); }
    catch (error) { if (!(error instanceof SystemMixError)) throw error; contentProblem = error.message; }
  }
  return <div className="page">
    <header className="page-header"><div><h1>{SYSTEM_MIX_NAME}</h1><p>Make a personal introduction. Share free access with someone already in your circle.</p></div><Link className="button" href="/jumps">Go to Today</Link></header>
    {params.welcome && <Notice type="success">Your setup is ready. Try your first networking mix, or go to Today for your follow-ups.</Notice>}
    {params.queued && <Notice type="success">Your invitation is queued. We’ll email your contact their personal link. You can check its status below.</Notice>}
    {params.sent && <Notice type="success">Your invitation was accepted by our email provider. Your contact can use the unique link in their email to create an account.</Notice>}
    {params.revoked && <Notice type="success">The invitation can no longer be used.</Notice>}
    {params.error && <Notice type="error">{params.error}</Notice>}
    {contentProblem && <Notice type="info">{contentProblem}</Notice>}
    <section className="card"><h2>{remaining} of 5 invitations remaining</h2><p>Every member gets five personal invitations in total. Each link is for one contact and one new account. Invitations are created and sent only through this System Mix.</p>
      {remaining > 0 && admissionProblem ? <Notice type="info">{admissionProblem}</Notice> : remaining > 0 ? <><form className="filter-bar" method="get"><input name="q" aria-label="Find a contact to invite" placeholder="Find a contact by name" defaultValue={q} /><button className="button">Find contact</button></form>
        {available.length && published ? <SystemMixInviteForm key={published.version} contacts={available} sender={user.name} remaining={remaining} version={published.version} content={published.content} /> : <p>No matching contacts with an email available to invite.</p>}
        <Link className="inline-action" href="/contacts/new">Add someone to your circle</Link>
      </> : <p>You’ve used your five invitations. You can still see their status below.</p>}
    </section>
    {invites.length > 0 && <section className="card"><h2>Your invitations</h2>{invites.map(invite => <article key={invite.id}>
      <h3>{invite.contact?.displayName ?? "Deleted contact"}</h3><p>{invite.recipientEmail}</p>
      <p>{invite.acceptedAt ? "Accepted" : invite.revokedAt ? "Revoked" : invite.lastSentAt ? "Invitation sent" : invite.delivery?.status === "QUEUED" || invite.delivery?.status === "SENDING" ? "Invitation queued" : "Delivery needs review · contact support"}</p>
      {!invite.acceptedAt && !invite.revokedAt && <div className="form-actions">
        <form action={revokeSystemInviteAction}><input type="hidden" name="id" value={invite.id} /><button className="button">Revoke invitation</button></form>
      </div>}
    </article>)}<p>Revoking an invitation does not restore a slot. Queued emails retry automatically with the same invitation. An email already being sent may still arrive after revocation, but its link will not work.</p></section>}
  </div>;
}
