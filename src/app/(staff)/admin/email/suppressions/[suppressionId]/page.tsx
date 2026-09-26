import { AdminDraftForm } from "@/components/AdminDraftForm";
import { SUPPRESSION_LABELS as labels } from "@/lib/admin-suppression-presentation";
import { safeAdminReturnTo, adminQuery } from "@/lib/admin-navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailRecipientHash } from "@/lib/email-budget";
import { suppressionReviewState } from "@/lib/email-suppression-admin";
import { clearRecipientSuppressionAction } from "@/lib/email-suppression-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Admin · Suppression review" };
export default async function SuppressionReview({ params, searchParams }: { params: Promise<{ suppressionId: string }>; searchParams: Promise<{ error?: string; at?: string; sig?: string; cleared?: string; returnTo?: string; case?: string }> }) {
  const { user, session, permissions } = await requirePlatformAdmin("email.manage");
  const { suppressionId } = await params, query = await searchParams;
  const selected = await prisma.emailSuppression.findUnique({ where: { id: suppressionId }, select: { email: true } });
  if (!selected) notFound();
  const [rows, history, preferences] = await Promise.all([
    prisma.emailSuppression.findMany({ where: { email: selected.email }, orderBy: { createdAt: "asc" } }),
    prisma.platformAuditEvent.findMany({ where: { entityType: "EmailRecipient", entityId: emailRecipientHash(selected.email), action: "email.suppression.clear" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, actorUserId: true, reason: true } }),
    displayPreferencesForUser(user.id)
  ]);
  const returnTo = safeAdminReturnTo(query.returnTo, "/admin/email/suppressions"), detailPath = adminQuery(`/admin/email/suppressions/${suppressionId}`, { returnTo, case: query.case?.slice(0,200) });
  const actors = await prisma.user.findMany({ where: { id: { in: history.flatMap(row => row.actorUserId ? [row.actorUserId] : []) } }, select: { id: true, name: true, email: true } });
  const names = new Map(actors.map(person => [person.id, `${person.name} (${person.email})`]));
  const active = rows.filter(row => !row.clearedAt && row.reason !== "INVITATION_OPTOUT");
  const optout = rows.some(row => row.reason === "INVITATION_OPTOUT" && !row.clearedAt);
  return <div className="page" style={{ overflowWrap: "anywhere" }}>
    <header className="page-header"><div><h1>Suppression review</h1><p>{selected.email}</p></div><Link className="button" href={returnTo}>Recipient queue</Link></header>
    <UrlErrorNotice params={query} viewer={session} fallback="Suppression could not be cleared. Reload the review." />
    {query.cleared && <Notice type="success">Provider blocks were cleared locally. No invitations were restored or sent. A new waitlist request requires fresh email confirmation.</Notice>}
    <div className="admin-detail-columns"><section className="card form-stack"><h2>Recipient impact</h2><p>{optout ? "Invitation opt-out controls the next step. Clearing provider blocks cannot authorize another invitation; the recipient must make and confirm a fresh request." : active.length ? `${active.length} active provider block(s) prevent email. Investigate every active reason and record the recipient’s request before local clearance.` : "No active local provider block remains. Check provider state before assuming delivery can resume."}</p><h3>Recorded blocks</h3>
      {rows.map(row => <article key={row.id}><h3>{labels[row.reason]}</h3><p>{row.clearedAt ? `Cleared locally ${formatDateTime(row.clearedAt, preferences)}` : "Active"} · First recorded {formatDateTime(row.createdAt, preferences)}</p>{row.lastTriggeredAt && <p>Latest triggering event {formatDateTime(row.lastTriggeredAt, preferences)}</p>}</article>)}
      <p>Confirm the recipient’s request and clear the provider block first. This changes local records only.</p>
      <p>Account emails may resume. Revoked grants and canceled invitations stay closed.</p>
      {optout && <Notice>The recipient’s invitation opt-out remains in place. Administrator clearance cannot reverse it.</Notice>}
    </section>
    {active.length > 0 && <section className="card form-stack"><h2>Review evidence for {active.length} provider {active.length === 1 ? "block" : "blocks"}</h2>

      <AdminDraftForm draftKey={`suppression:${suppressionId}`} fields={["reason", "providerReference", "requestReference", "providerReviewed", "recipientRequested"]} revision={suppressionReviewState(rows)} revisionField="state" saved={query.cleared} action={clearRecipientSuppressionAction}>
        <input type="hidden" name="suppressionId" value={suppressionId} /><input type="hidden" name="returnTo" value={detailPath} />
        <label className="field"><span>Reason for clearance</span><textarea name="reason" minLength={10} maxLength={500} required /></label>
        <div className="form-grid"><label className="field"><span>Provider review reference</span><input name="providerReference" minLength={5} maxLength={200} required /><small>Record ID or dated reference. No credentials.</small></label>
        <label className="field"><span>Recipient request reference</span><input name="requestReference" defaultValue={query.case?.slice(0,200) ?? ""} minLength={5} maxLength={200} required /><small>Case ID or dated consent reference.</small></label></div>
        <label><input type="checkbox" name="providerReviewed" required /> I reviewed the cause. The provider block is cleared or does not apply.</label>
        <label><input type="checkbox" name="recipientRequested" required /> The recipient explicitly requested that email resume.</label>
        <label className="field"><span>Current administrator password</span><input type="password" name="currentPassword" autoComplete="current-password" maxLength={72} required /></label>
        <p>MFA within the last 10 minutes required.</p>
        <FormSubmitButton label="Clear provider blocks locally" pendingLabel="Saving review…" />
      </AdminDraftForm>
    </section>}
    {(query.cleared || !active.length) && <section className="card form-stack"><h2>Next steps</h2><p>{optout ? "Invitation opt-out remains active. The recipient must submit and confirm a new waitlist request to rejoin." : "Check the provider’s suppression settings independently. Local clearance does not restore revoked grants or send an invitation."}</p>{permissions.includes("waitlist.read") && <Link href={adminQuery("/admin/waitlist", { q: selected.email, view: "history" })}>Review the recipient’s waitlist history</Link>}{permissions.includes("access.read") && <Link href={adminQuery("/admin/access", { q: selected.email })}>Review access invitations</Link>}</section>}
    </div><details className="card form-stack"><summary>Clearance history</summary><p>Showing the latest 20 reviews. Full records remain in the platform audit log.</p>{!history.length && <p>No operator clearances recorded.</p>}{history.map(row => <article key={row.id}><h3>{formatDateTime(row.createdAt, preferences)}</h3><p>{row.reason}</p><p>Administrator: {row.actorUserId ? names.get(row.actorUserId) ?? "Former staff member" : "System"}</p></article>)}{permissions.includes("audit.read") && <Link href={adminQuery("/admin/audit", { q: emailRecipientHash(selected.email), scope: "platform" })}>Full recipient audit history</Link>}</details>
  </div>;
}
