import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailRecipientHash } from "@/lib/email-budget";
import { suppressionReviewState } from "@/lib/email-suppression-admin";
import { clearRecipientSuppressionAction } from "@/lib/email-suppression-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Admin · Suppression review" };
const labels = { HARD_BOUNCE: "Permanent bounce", COMPLAINT: "Spam complaint", PROVIDER_SUPPRESSION: "Provider suppression", INVITATION_OPTOUT: "Recipient invitation opt-out" };
export default async function SuppressionReview({ params, searchParams }: { params: Promise<{ suppressionId: string }>; searchParams: Promise<{ error?: string; cleared?: string }> }) {
  const { user } = await requirePlatformAdmin("email.manage");
  const { suppressionId } = await params, query = await searchParams;
  const selected = await prisma.emailSuppression.findUnique({ where: { id: suppressionId }, select: { email: true } });
  if (!selected) notFound();
  const [rows, history, preferences] = await Promise.all([
    prisma.emailSuppression.findMany({ where: { email: selected.email }, orderBy: { createdAt: "asc" } }),
    prisma.platformAuditEvent.findMany({ where: { entityType: "EmailRecipient", entityId: emailRecipientHash(selected.email), action: "email.suppression.clear" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, actorUserId: true, reason: true } }),
    displayPreferencesForUser(user.id)
  ]);
  const active = rows.filter(row => !row.clearedAt && row.reason !== "INVITATION_OPTOUT");
  const optout = rows.some(row => row.reason === "INVITATION_OPTOUT" && !row.clearedAt);
  return <div className="page" style={{ overflowWrap: "anywhere" }}>
    <header className="page-header"><div><h1>Suppression review</h1><p>{selected.email}</p></div><Link className="button" href="/admin/email/suppressions">Recipient queue</Link></header>
    {query.error && <Notice type="error">{query.error}</Notice>}
    {query.cleared && <Notice type="success">Provider blocks were cleared locally. No invitations were restored or sent. A new waitlist request requires fresh email confirmation.</Notice>}
    <section className="card form-stack"><h2>Recorded blocks</h2>
      {rows.map(row => <article key={row.id}><h3>{labels[row.reason]}</h3><p>{row.clearedAt ? `Cleared locally ${formatDateTime(row.clearedAt, preferences)}` : "Active"} · First recorded {formatDateTime(row.createdAt, preferences)}</p>{row.lastTriggeredAt && <p>Latest triggering event {formatDateTime(row.lastTriggeredAt, preferences)}</p>}</article>)}
      {optout && <Notice>The recipient’s invitation opt-out remains in place. Administrator clearance cannot reverse it.</Notice>}
    </section>
    {active.length > 0 && <section className="card form-stack"><h2>Clear {active.length} provider {active.length === 1 ? "block" : "blocks"}</h2>
      <p>First investigate the bounce or complaint, confirm the recipient wants email again, and review suppression in the provider dashboard. This action changes local records only; it does not change the provider’s settings.</p>
      <p>Account emails may resume after clearance. Existing grants stay revoked, queued invitations stay canceled, and nobody is added to a wave by this action.</p>
      <form action={clearRecipientSuppressionAction} className="form-stack">
        <input type="hidden" name="suppressionId" value={suppressionId} /><input type="hidden" name="state" value={suppressionReviewState(rows)} />
        <label className="field"><span>Reason for clearance</span><textarea name="reason" minLength={10} maxLength={500} required /></label>
        <label className="field"><span>Provider review reference</span><input name="providerReference" minLength={5} maxLength={200} required /><small>A record number or dated review reference. Do not paste credentials or email content.</small></label>
        <label className="field"><span>Recipient request reference</span><input name="requestReference" minLength={5} maxLength={200} required /><small>A support case or dated consent reference; keep the private message in its original system.</small></label>
        <label><input type="checkbox" name="providerReviewed" required /> I reviewed the cause and confirmed the provider block has been removed or does not apply.</label>
        <label><input type="checkbox" name="recipientRequested" required /> The recipient explicitly requested that email resume.</label>
        <label className="field"><span>Current administrator password</span><input type="password" name="currentPassword" autoComplete="current-password" maxLength={72} required /></label>
        <p>Requires administrator verification from the last 10 minutes.</p>
        <FormSubmitButton label="Clear provider blocks locally" pendingLabel="Saving review…" />
      </form>
    </section>}
    <section className="card form-stack"><h2>Clearance history</h2><p>Showing the latest 20 reviews. Full records remain in the platform audit log.</p>{!history.length && <p>No operator clearances recorded.</p>}{history.map(row => <article key={row.id}><h3>{formatDateTime(row.createdAt, preferences)}</h3><p>{row.reason}</p><p>Administrator record: {row.actorUserId ?? "Unavailable"}</p></article>)}</section>
  </div>;
}
