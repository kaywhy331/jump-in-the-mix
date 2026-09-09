import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Notice } from "@/components/Notice";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { recoverInvitationReceiptAction, repeatInvitationDeliveryAction } from "@/lib/email-suppression-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Admin · Email recovery" };
export default async function EmailRecoveryPage({ searchParams }: { searchParams: Promise<{ page?: string; error?: string; recovered?: string; queued?: string; status?: string; q?: string }> }) {
  const { user, permissions } = await requirePlatformAdmin("email.manage"), params = await searchParams;
  const page = typeof params.page === "string" && /^\d{1,4}$/.test(params.page) ? Math.max(1, Number(params.page)) : 1;
  const status = params.status === "SENT" ? "SENT" : "REVIEW";
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase().slice(0, 254) : "";
  const scope = [...(permissions.includes("access.read") ? [{ inviteId: { not: null }, ...(q ? { invite: { recipientEmail: { contains: q } } } : {}) }] : []), ...(permissions.includes("staff.manage") ? [{ staffInvitationId: { not: null }, ...(q ? { staffInvitation: { email: { contains: q } } } : {}) }] : [])];
  const rows = scope.length ? await prisma.waitlistDelivery.findMany({ where: { status, payloadPurgedAt: null, OR: scope }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], skip: (page - 1) * 50, take: 51, select: { id: true, generation: true, generationStartedAt: true, updatedAt: true, firstAttemptAt: true, providerId: true, attempts: true, invite: { select: { recipientEmail: true } }, staffInvitation: { select: { email: true } }, history: { orderBy: { generation: "desc" }, take: 5, select: { generation: true, emailMessageId: true, attempts: true, firstAttemptAt: true, providerId: true, status: true } } } }) : [];
  const historicalReceipts = await prisma.emailMessage.findMany({ where: { id: { in: rows.flatMap(row => row.history.map(item => item.emailMessageId)) } }, select: { id: true, providerId: true } });
  const receipts = new Map(historicalReceipts.map(row => [row.id, row.providerId]));
  const preferences = await displayPreferencesForUser(user.id);
  const pageUrl = (next: number) => `/admin/email/recovery?${new URLSearchParams({ page: String(next), status, ...(q ? { q } : {}) })}`;
  return <div className="page" style={{ overflowWrap: "anywhere" }}>
    <header className="page-header"><div><h1>Email recovery</h1><p>Check invitation receipts and review recipient-requested resends.</p></div><Link className="button" href="/admin/email/suppressions">Recipient suppression</Link></header>
    {params.error && <Notice type="error">{params.error}</Notice>}
    {params.recovered && <Notice type="success">The matching provider acceptance was recovered. No email was sent and no invitation slot was used.</Notice>}
    {params.queued && <Notice type="success">The same invitation is queued for another email, subject to delivery checks and email capacity. Its access URL and invitation slot are unchanged.</Notice>}
    <section className="card form-stack"><h2>Invitation receipts</h2><p>First check the local send ledger. If the receipt is missing, use the provider’s email record ID to verify the exact recipient, frozen content and original attempt window.</p><p>Recovery records provider acceptance, not inbox delivery. A deliberate resend needs a provider investigation, a recipient request, your password and recent authenticator verification. At least 24 hours must pass after the current delivery began.</p><p>Unusable invitations whose private content has expired are omitted from recovery.</p></section>
    <form method="get" className="card form-stack"><label className="field"><span>Recipient email</span><input type="search" name="q" defaultValue={q} maxLength={254} /></label><label className="field"><span>Delivery status</span><select name="status" defaultValue={status}><option value="REVIEW">Needs review</option><option value="SENT">Accepted by provider</option></select></label><button className="button" type="submit">Find invitations</button></form>
    {!rows.length && <section className="card"><p>No matching invitation deliveries are visible with your current permissions.</p></section>}
    {rows.slice(0, 50).map(row => <section className="card form-stack" key={row.id}>
      <h2>{row.invite?.recipientEmail ?? row.staffInvitation?.email}</h2><p>{row.staffInvitation ? "Staff invitation" : "Customer invitation"} · Delivery {row.generation} · {row.attempts} worker attempts</p><p>First attempted: {row.firstAttemptAt ? formatDateTime(row.firstAttemptAt, preferences) : "Not recorded"}</p><p>Delivery record: {row.id}</p>{row.providerId && <p>Provider record: {row.providerId}</p>}
      {status === "REVIEW" && <>
        <form action={recoverInvitationReceiptAction} className="form-stack"><input type="hidden" name="deliveryId" value={row.id} /><input type="hidden" name="updatedAt" value={row.updatedAt.toISOString()} />
          <label className="field"><span>Recovery reason</span><input name="reason" minLength={10} maxLength={500} required /></label><FormSubmitButton label="Recover recorded acceptance" pendingLabel="Checking receipt…" />
        </form>
        <details><summary>Check provider record</summary><form action={recoverInvitationReceiptAction} className="form-stack"><input type="hidden" name="deliveryId" value={row.id} /><input type="hidden" name="updatedAt" value={row.updatedAt.toISOString()} />
          <p>This makes a read-only provider lookup. Unavailable, mismatched or adverse records stay in review. No email is sent.</p>
          <label className="field"><span>Provider email record ID</span><input name="providerId" minLength={36} maxLength={36} required autoComplete="off" /></label>
          <label className="field"><span>Provider check reason</span><input name="reason" minLength={10} maxLength={500} required /></label><FormSubmitButton label="Verify and recover provider receipt" pendingLabel="Verifying provider record…" />
        </form></details>
      </>}
      {(row.staffInvitation || permissions.includes("jobs.retry")) && <details><summary>Review sending this invitation again</summary><form action={repeatInvitationDeliveryAction} className="form-stack"><input type="hidden" name="deliveryId" value={row.id} /><input type="hidden" name="updatedAt" value={row.updatedAt.toISOString()} />
        <p>Another copy may arrive even if the first email was delivered. This sends the original invitation to its original recipient, and uses normal email capacity. It cannot renew an expired or revoked invitation.</p>
        <label className="field"><span>Reason for another email</span><textarea name="reason" minLength={10} maxLength={500} required /></label>
        <label className="field"><span>Provider investigation reference</span><input name="providerReference" minLength={5} maxLength={200} required /></label>
        <label className="field"><span>Recipient request reference</span><input name="requestReference" minLength={5} maxLength={200} required /></label>
        <label><input type="checkbox" name="providerReviewed" required /> I investigated the original delivery with the provider.</label>
        <label><input type="checkbox" name="recipientRequested" required /> The recipient requested another invitation email.</label>
        <label><input type="checkbox" name="duplicateRiskAccepted" required /> I understand the recipient may receive more than one copy.</label>
        <label className="field"><span>Current administrator password</span><input type="password" name="currentPassword" maxLength={72} autoComplete="current-password" required /></label>
        <FormSubmitButton label="Queue the same invitation again" pendingLabel="Recording review…" />
      </form></details>}
      {!!row.history.length && <details><summary>Previous deliveries · latest five</summary><ul>{row.history.map(item => <li key={item.generation}>Delivery {item.generation}: {item.status === "SENT" || receipts.get(item.emailMessageId) ? "Provider acceptance recorded" : "Acceptance unconfirmed"}; {item.attempts} worker attempts. First attempt: {item.firstAttemptAt ? formatDateTime(item.firstAttemptAt, preferences) : "Not recorded"}. Provider record: {receipts.get(item.emailMessageId) ?? item.providerId ?? "Not recorded"}.</li>)}</ul></details>}
    </section>)}
    <nav className="page-actions" aria-label="Email recovery pages">{page > 1 && <Link href={pageUrl(page - 1)}>Previous</Link>}<span>Page {page}</span>{rows.length > 50 && <Link href={pageUrl(page + 1)}>Next</Link>}</nav>
  </div>;
}
