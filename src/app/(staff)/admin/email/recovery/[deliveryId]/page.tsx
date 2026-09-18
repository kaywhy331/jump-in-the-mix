import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAdminReturnTo, adminQuery } from "@/lib/admin-navigation";
import { invitationRepeatEligibility } from "@/lib/invitation-receipt-recovery";
import { waitlistSendingReady } from "@/lib/waitlist";
import { Notice } from "@/components/Notice";
import { AdminDraftForm } from "@/components/AdminDraftForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { recoverInvitationReceiptAction, repeatInvitationDeliveryAction } from "@/lib/email-suppression-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
export const metadata = { title: "Admin · Delivery review" };
export default async function DeliveryReview({ params, searchParams }: { params: Promise<{ deliveryId: string }>; searchParams: Promise<{ returnTo?: string; error?: string; recovered?: string; queued?: string; case?: string }> }) {
  const [{ deliveryId }, query, { user, permissions }] = await Promise.all([params, searchParams, requirePlatformAdmin("email.manage")]);
  const row = await prisma.waitlistDelivery.findUnique({ where: { id: deliveryId }, select: { id: true, status: true, generation: true, generationStartedAt: true, updatedAt: true, firstAttemptAt: true, providerId: true, attempts: true, payloadPurgedAt: true, leaseId: true, lockedAt: true, inviteId: true, staffInvitationId: true, lastError: true, emailMessage: { select: { firstAttemptAt: true, bouncedAt: true, complainedAt: true, suppressedAt: true, failedAt: true, acceptedAt: true, deliveredAt: true } }, invite: { select: { id: true, recipientEmail: true, acceptedAt: true, revokedAt: true } }, staffInvitation: { select: { id: true, email: true, expiresAt: true, acceptedAt: true, revokedAt: true } }, history: { orderBy: { generation: "desc" }, take: 5, select: { generation: true, emailMessageId: true, status: true, attempts: true, firstAttemptAt: true, providerId: true } } } });
  if (!row || !(row.staffInvitationId ? permissions.includes("staff.manage") : permissions.includes("access.read"))) notFound();
  const email = row.invite?.recipientEmail ?? row.staffInvitation?.email;
  if (!email) notFound();
  const returnTo = safeAdminReturnTo(query.returnTo, "/admin/email/recovery"), detailPath = adminQuery(`/admin/email/recovery/${row.id}`, { returnTo, case: query.case?.slice(0,200) });
  const preferences = await displayPreferencesForUser(user.id);
  const eligibility = await prisma.$transaction(tx => invitationRepeatEligibility(tx, row, row.emailMessage, email));
  const available = !row.payloadPurgedAt && !row.leaseId && !row.lockedAt;
  const canRecover = available && row.status === "REVIEW";
  const canRepeat = available && ["REVIEW", "SENT"].includes(row.status) && (Boolean(row.staffInvitation) || permissions.includes("jobs.retry")) && waitlistSendingReady();
  const historicalReceipts = await prisma.emailMessage.findMany({ where: { id: { in: row.history.map(item => item.emailMessageId) } }, select: { id: true, providerId: true, acceptedAt: true } });
  const receipts = new Map(historicalReceipts.map(item => [item.id, item]));
  const grant = row.invite ?? row.staffInvitation;
  return <div className="page"><header className="page-header"><div><h1>Delivery review</h1><p>{email} · {row.staffInvitation ? "Staff invitation" : "Customer invitation"}</p></div><Link className="button" href={returnTo}>Back to related record</Link></header>
    {query.error && <Notice type="error">{query.error}</Notice>}{query.recovered && <Notice>Provider acceptance recovered. No email was sent.</Notice>}{query.queued && <Notice>The same invitation is queued again. Its access grant is unchanged.</Notice>}
    <div className="admin-detail-columns"><section className="card form-stack"><h2>Recipient impact</h2><p>{grant?.acceptedAt ? "This invitation was already accepted. No replacement email is needed." : grant?.revokedAt ? "This invitation no longer grants access. A resend cannot restore it." : row.emailMessage?.deliveredAt ? "The recipient’s mail server accepted this email. Ask the recipient to check for the existing invitation before considering another copy." : row.status === "REVIEW" ? "Email delivery is unconfirmed. Recover the provider receipt first; another email could duplicate the first." : row.status === "SENT" ? "The provider accepted the email. The existing invitation may already be available; acceptance does not establish inbox delivery." : "The invitation has not completed delivery. Review its current queue state before taking another action."}</p><h3>Delivery status</h3><p>Grant: {grant?.acceptedAt ? "Accepted" : grant?.revokedAt ? "Revoked" : row.staffInvitation && row.staffInvitation.expiresAt <= new Date() ? "Expired" : "Unused"} · Email: {row.status.toLowerCase()} · Delivery generation {row.generation}</p><p>First attempt: {row.firstAttemptAt ? formatDateTime(row.firstAttemptAt, preferences) : "Not recorded"}. {row.attempts} worker attempts.</p>{row.lastError && <p>{row.lastError}</p>}
      <p role="status">{!available ? "This delivery is locked or its private content has expired. Actions are unavailable." : eligibility.available ? "Eligible for resend review. Rechecked on save." : eligibility.reason}</p><p>Earliest resend review: {formatDateTime(eligibility.availableAt, preferences)}.</p>{!waitlistSendingReady() && <p>Sending configuration is unavailable in this environment.</p>}{query.case && <p>Case reference: {query.case.slice(0,200)}</p>}
      <nav className="page-actions" aria-label="Related delivery records">{row.invite && permissions.includes("access.read") && <Link href={adminQuery(`/admin/access/${row.invite.id}`, { returnTo: detailPath })}>Access invitation</Link>}{row.staffInvitation && <Link href={adminQuery("/admin/team", { view: "invitations", q: email })}>Staff offer</Link>}<Link href={adminQuery("/admin/email/suppressions", { q: email })}>Recipient blocks</Link>{permissions.includes("audit.read") && <Link href={adminQuery("/admin/audit", { q: row.id })}>Audit history</Link>}</nav>
      <details><summary>Identifiers and previous deliveries (latest five)</summary><p>Delivery {row.id} · Provider record {row.providerId ?? "Not recorded"}</p>{row.history.map(item => <p key={item.generation}>Delivery {item.generation}: {item.status === "SENT" || receipts.get(item.emailMessageId)?.acceptedAt ? "Provider acceptance recorded" : "Acceptance unconfirmed"} · {item.attempts} attempts · {item.firstAttemptAt ? formatDateTime(item.firstAttemptAt, preferences) : "No attempt recorded"} · Provider {receipts.get(item.emailMessageId)?.providerId ?? item.providerId ?? "Not recorded"}</p>)}</details>
    </section><section className="card form-stack"><h2>Recovery actions</h2><p>Recover the receipt first. Resending needs recipient consent and may duplicate the email.</p>
      {canRecover && <>
        <AdminDraftForm draftKey={`receipt:${row.id}`} fields={["reason", "providerId"]} revision={row.updatedAt.toISOString()} revisionField="updatedAt" saved={query.recovered} action={recoverInvitationReceiptAction}><input type="hidden" name="deliveryId" value={row.id} /><input type="hidden" name="returnTo" value={detailPath} />
          <label className="field"><span>Recovery reason</span><input name="reason" minLength={10} maxLength={500} required /></label><FormSubmitButton label="Recover recorded acceptance" pendingLabel="Checking receipt…" />
        </AdminDraftForm>
        <details><summary>Check provider record</summary><AdminDraftForm draftKey={`provider-receipt:${row.id}`} fields={["reason", "providerId"]} revision={row.updatedAt.toISOString()} revisionField="updatedAt" saved={query.recovered} action={recoverInvitationReceiptAction}><input type="hidden" name="deliveryId" value={row.id} /><input type="hidden" name="returnTo" value={detailPath} />
          <p>This makes a read-only provider lookup. Unavailable, mismatched or adverse records stay in review. No email is sent.</p>
          <label className="field"><span>Provider email record ID</span><input name="providerId" minLength={36} maxLength={36} required autoComplete="off" /></label>
          <label className="field"><span>Provider check reason</span><input name="reason" minLength={10} maxLength={500} required /></label><FormSubmitButton label="Verify and recover provider receipt" pendingLabel="Verifying provider record…" />
        </AdminDraftForm></details>
      </>}
      {(canRepeat && eligibility.available) && <details><summary>Review sending this invitation again</summary><AdminDraftForm draftKey={`repeat:${row.id}:${row.generation}`} fields={["reason", "providerReference", "requestReference", "providerReviewed", "recipientRequested", "duplicateRiskAccepted"]} revision={row.updatedAt.toISOString()} revisionField="updatedAt" saved={query.queued} action={repeatInvitationDeliveryAction}><input type="hidden" name="deliveryId" value={row.id} /><input type="hidden" name="returnTo" value={detailPath} />
        <p>Another copy may arrive even if the first email was delivered. This sends the original invitation to its original recipient, and uses normal email capacity. It cannot renew an expired or revoked invitation.</p>
        <label className="field"><span>Reason for another email</span><textarea name="reason" minLength={10} maxLength={500} required /></label>
        <label className="field"><span>Provider investigation reference</span><input name="providerReference" minLength={5} maxLength={200} required /></label>
        <label className="field"><span>Recipient request reference</span><input name="requestReference" defaultValue={query.case?.slice(0,200)} minLength={5} maxLength={200} required /></label>
        <label><input type="checkbox" name="providerReviewed" required /> I investigated the original delivery with the provider.</label>
        <label><input type="checkbox" name="recipientRequested" required /> The recipient requested another invitation email.</label>
        <label><input type="checkbox" name="duplicateRiskAccepted" required /> I understand the recipient may receive more than one copy.</label>
        <label className="field"><span>Current administrator password</span><input type="password" name="currentPassword" maxLength={72} autoComplete="current-password" required /></label>
        <FormSubmitButton label="Queue the same invitation again" pendingLabel="Recording review…" />
      </AdminDraftForm></details>}
    {!canRecover && !(canRepeat && eligibility.available) && <p>No recovery or resend action is currently available. Use the related grant or recipient record to resolve the blocker.</p>}</section>
  </div></div>;
}
