import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAdminReturnTo, adminQuery } from "@/lib/admin-navigation";
import { ACCESS_SOURCES, accessGrantLabel } from "@/lib/admin-access-presentation";
import { WAITLIST_RETRY_WINDOW_MS } from "@/lib/waitlist-delivery";
import { emailDeliveryLabel } from "@/lib/email-status";
import { formatDateTime } from "@/lib/format";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { manageAccessInvitationAction } from "@/lib/access-admin-actions";
import { AdminDraftForm } from "@/components/AdminDraftForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Notice } from "@/components/Notice";
export const metadata = { title: "Admin · Invitation review" };
export default async function InvitationReview({ params, searchParams }: { params: Promise<{ inviteId: string }>; searchParams: Promise<{ returnTo?: string; error?: string; done?: string }> }) {
  const [{ inviteId }, query, { user, permissions }] = await Promise.all([params, searchParams, requirePlatformAdmin("access.read")]);
  const invite = await prisma.referralAccessInvite.findUnique({ where: { id: inviteId }, select: { id: true, recipientEmail: true, source: true, systemMixVersion: true, createdAt: true, acceptedAt: true, revokedAt: true, lastSentAt: true, delivery: { select: { id: true, status: true, attempts: true, firstAttemptAt: true, providerId: true, lastError: true, emailMessage: { select: { acceptedAt: true, deliveredAt: true, delayedAt: true, bouncedAt: true, complainedAt: true, suppressedAt: true, failedAt: true } } } } } });
  if (!invite) notFound();
  const [display, blocks, recipient, events] = await Promise.all([displayPreferencesForUser(user.id), prisma.emailSuppression.count({ where: { email: invite.recipientEmail, clearedAt: null } }), permissions.includes("users.read") ? prisma.user.findUnique({ where: { email: invite.recipientEmail }, select: { id: true } }) : null, prisma.platformAuditEvent.findMany({ where: { entityType: "ReferralAccessInvite", entityId: invite.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, action: true, reason: true, createdAt: true } })]);
  const returnTo = safeAdminReturnTo(query.returnTo, "/admin/access"), detailPath = adminQuery(`/admin/access/${invite.id}`, { returnTo });
  const active = !invite.acceptedAt && !invite.revokedAt;
  const retry = active && !blocks && permissions.includes("jobs.retry") && invite.delivery?.status === "REVIEW" && invite.delivery.firstAttemptAt && Date.now() - invite.delivery.firstAttemptAt.getTime() < WAITLIST_RETRY_WINDOW_MS;
  const date = (value: Date | null) => value ? formatDateTime(value, display) : "Not recorded";
  return <div className="page"><header className="page-header"><div><h1>Invitation review</h1><p>{invite.recipientEmail} · {ACCESS_SOURCES[invite.source]}</p></div><Link className="button" href={returnTo}>Back to invitations</Link></header>{query.error && <Notice type="error">{query.error}</Notice>}{query.done && <Notice>{query.done === "revoke" ? "Invitation revoked. Email already handed to the provider may still arrive with an unusable link." : "The same invitation email is queued for another attempt."}</Notice>}
    <div className="admin-detail-columns"><section className="card form-stack"><h2>Current state</h2><p><strong>Grant: {accessGrantLabel(invite)}</strong> · {active ? "One customer place remains reserved." : "No unused reservation remains."}</p><p><strong>Email: {invite.delivery?.status.toLowerCase() ?? "legacy record"}</strong>{invite.delivery?.emailMessage ? ` · ${emailDeliveryLabel(invite.delivery.emailMessage)}` : ""}</p>{Boolean(blocks) && <Notice type="info">The recipient has an active email block. Review suppression before another send.</Notice>}
      <dl className="support-definition-list"><div><dt>Created</dt><dd>{date(invite.createdAt)}</dd></div><div><dt>First delivery attempt</dt><dd>{date(invite.delivery?.firstAttemptAt ?? null)}</dd></div><div><dt>Provider accepted</dt><dd>{date(invite.lastSentAt)}</dd></div><div><dt>Joined</dt><dd>{date(invite.acceptedAt)}</dd></div><div><dt>Revoked</dt><dd>{date(invite.revokedAt)}</dd></div></dl>
      <nav className="page-actions" aria-label="Related invitation records">{permissions.includes("email.manage") && invite.delivery && <Link className="button" href={adminQuery(`/admin/email/recovery/${invite.delivery.id}`, { returnTo: detailPath })}>Review delivery evidence</Link>}{permissions.includes("email.manage") && <Link className="button" href={adminQuery("/admin/email/suppressions", { q: invite.recipientEmail })}>Recipient blocks</Link>}{recipient && <Link className="button" href={adminQuery(`/admin/users/${recipient.id}`, { returnTo: detailPath })}>Customer account</Link>}{permissions.includes("audit.read") && <Link href={adminQuery("/admin/audit", { q: invite.id })}>Audit history</Link>}</nav>
      <details><summary>Delivery diagnostics</summary><p>Invitation {invite.id} · Delivery {invite.delivery?.id ?? "Unavailable"} · {invite.delivery?.attempts ?? 0} attempts</p><p>Provider record: {invite.delivery?.providerId ?? "Not recorded"}</p>{invite.delivery?.lastError && <p>{invite.delivery.lastError}</p>}{invite.source === "REFERRAL" && <p>Invitation wording version: {invite.systemMixVersion ?? "Legacy · unavailable"}</p>}</details>
    </section>
    {active && (permissions.includes("access.revoke") || retry) && <section className="card form-stack"><h2>Manage this invitation</h2><AdminDraftForm draftKey={`access-invitation:${invite.id}`} fields={["reason"]} saved={query.done} action={manageAccessInvitationAction}><input type="hidden" name="returnTo" value={detailPath} /><input type="hidden" name="inviteId" value={invite.id} /><label className="field"><span>Reason and case reference</span><input name="reason" minLength={10} maxLength={500} required /></label><p>Revoking invalidates the link. It does not refund a member’s personal invitation allowance or put the recipient back on the waitlist.</p><div className="form-actions">{permissions.includes("access.revoke") && <FormSubmitButton label="Revoke invitation" pendingLabel="Revoking…" name="operation" value="revoke" />}{retry && <FormSubmitButton label="Retry same invitation email" pendingLabel="Queueing…" name="operation" value="retry" />}</div></AdminDraftForm></section>}
    {active && invite.delivery?.status === "REVIEW" && !retry && <p>Automatic retry is unavailable. Review delivery evidence before considering another send.</p>}
    </div><details className="card"><summary>Recent invitation changes (latest 20)</summary>{events.length ? events.map(event => <p key={event.id}>{date(event.createdAt)} · {event.action} · {event.reason}</p>) : <p>No administrator changes recorded.</p>}</details>
  </div>;
}
