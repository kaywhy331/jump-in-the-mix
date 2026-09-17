import { AdminRefresh } from "@/components/AdminRefresh";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { readEmailBudget } from "@/lib/email-budget";
import { formatDateTime } from "@/lib/format";
import { displayPreferencesForUser } from "@/lib/display-preferences";

export const metadata: Metadata = { title: "Admin · Email" };

export default async function AdminEmailPage() {
  const { user, permissions } = await requirePlatformAdmin("operations.read");
  const now = new Date();
  const [windows, suppressions, events, reviews, preferences] = await Promise.all([
    readEmailBudget(prisma, now), prisma.emailSuppression.groupBy({ where: { clearedAt: null }, by: ["reason"], _count: { _all: true } }),
    prisma.emailProviderEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 30, select: { id: true, type: true, providerId: true, occurredAt: true, receivedAt: true, detailsRetiredAt: true } }),
    prisma.waitlistDelivery.count({ where: { status: "REVIEW", inviteId: { not: null } } }), displayPreferencesForUser(user.id)
  ]);
  const [staffReviews, supportReviews] = await Promise.all([
    permissions.includes("staff.manage") ? prisma.waitlistDelivery.count({ where: { status: "REVIEW", staffInvitationId: { not: null } } }) : null,
    permissions.includes("support.manage") ? prisma.supportTicketMessage.count({ where: { authorType: "ADMIN", emailStatus: "FAILED" } }) : null
  ]);
  return <div className="page">
    <header className="page-header"><div><h1>Email</h1></div></header>
    <AdminRefresh observedAt={now.toISOString()} />
    <div className="admin-two-columns"><section className="card form-stack"><h2>Sending allowance</h2>
      {windows.map(window => <div key={window.name}><h3>{window.name === "day" ? "Last 24 hours" : "Last 31 days"}</h3>
        <meter aria-label={`${window.name} email allowance used`} min={0} max={window.total} value={Math.min(window.used, window.total)} />
        <p>{window.used} of {window.total} used · {window.total - window.other} reserved for account/recovery.</p>
        <p className="admin-secondary-note">Product and invitation emails: {window.otherUsed} of {window.other} attempts used.</p>
      </div>)}
      <details><summary>How limits work</summary><p>Every sending attempt counts, including retries. Cached receipts do not resend.</p><p>Queued invitations wait when capacity is reserved. The operator configures daily/monthly limits and essential-email reserves against the provider allowance before increasing traffic.</p></details>
    </section>
    <section className="card form-stack"><h2>Delivery health</h2>
      <p>Sender: {env.resendApiKey && env.emailFrom ? "Configured" : "Missing configuration"} · Signed provider events: {env.resendWebhookSecret ? "Secret configured" : "Missing signing secret"}</p>
      <p>{reviews} invitation deliveries need review.</p>
      {permissions.includes("access.read") && <Link href="/admin/access?review=1">Review invitation deliveries</Link>}
      {permissions.includes("staff.manage") && <Link href="/admin/team?view=invitations">{staffReviews} staff invitations need review</Link>}
      {permissions.includes("email.manage") && <Link href="/admin/email/suppressions">Review recipient suppression</Link>}
      {permissions.includes("email.manage") && <Link href="/admin/email/recovery">Recover invitation delivery</Link>}
      {supportReviews !== null && <Link href="/admin/support?view=all&email=review">{supportReviews} support emails need review</Link>}
      <h3>Suppression records</h3>{suppressions.length ? suppressions.map(row => <p key={row.reason}>{row.reason.replaceAll("_", " ")} · {row._count._all}</p>) : <p>No recipient suppressions recorded.</p>}
      <details><summary>Delivery and suppression rules</summary><p>A signing secret does not confirm the provider connection.</p><p>Provider bounces, complaints and suppressions stop future sends and unused invitations. Rejoining the waitlist cannot clear these records. Removing an address in the provider dashboard requires a separate local review before sending resumes.</p></details>
    </section>
    </div><details className="card form-stack"><summary>Recent provider events ({events.length}, maximum 30)</summary><p>Delivery means the recipient’s mail server accepted the message. It does not establish inbox placement or that the message was read.</p>
      {!events.length && <p>No verified events received yet. Rehearse the configured endpoint with a controlled provider test.</p>}
      {events.map(event => <article key={event.id} style={{ overflowWrap: "anywhere" }}><h3>{event.type}</h3><p>{formatDateTime(event.occurredAt, preferences)} · Received {formatDateTime(event.receivedAt, preferences)}</p><p>Event {event.id}{event.providerId ? ` · Provider record ${event.providerId}` : ""}{event.detailsRetiredAt ? " · Private provider details expired; replay protection retained." : ""}</p></article>)}
    </details>
  </div>;
}
