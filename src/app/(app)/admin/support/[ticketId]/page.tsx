import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { SupportReplyComposer } from "@/components/SupportReplyComposer";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  adminRetrySupportEmailAction,
  adminUpdateSupportTicketStatusAction,
  adminUpdateSupportTicketTriageAction
} from "@/lib/support-admin-actions";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  supportCategoryLabel,
  supportEmailStatusLabel,
  supportPriorityLabel,
  supportStatusLabel
} from "@/lib/support-content";

export const metadata: Metadata = { title: "Admin · Support ticket" };

type SearchParams = {
  replied?: string;
  email?: string;
  emailRetried?: string;
  triageSaved?: string;
  statusSaved?: string;
  error?: string;
};

export default async function AdminSupportTicketPage({
  params,
  searchParams
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ ticketId }, query] = await Promise.all([params, searchParams, requirePlatformAdmin()]);
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" } } }
  });
  if (!ticket) notFound();

  const [requester, workspace, usage] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ticket.requesterUserId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true }
    }),
    prisma.workspace.findUnique({
      where: { id: ticket.workspaceId },
      select: {
        id: true,
        name: true,
        planTier: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true
      }
    }),
    Promise.all([
      prisma.contact.count({ where: { workspaceId: ticket.workspaceId, archivedAt: null } }),
      prisma.mix.count({ where: { workspaceId: ticket.workspaceId, status: "ACTIVE" } }),
      prisma.jump.count({ where: { workspaceId: ticket.workspaceId, status: "PENDING" } }),
      prisma.integrationConnection.count({ where: { workspaceId: ticket.workspaceId, status: "ACTIVE" } })
    ]).then(([contacts, mixes, pendingJumps, integrations]) => ({ contacts, mixes, pendingJumps, integrations }))
  ]);

  return (
    <div className="page admin-support-ticket-page">
      <header className="page-header">
        <div>
          <span className="support-ticket-reference">{ticket.reference}</span>
          <h1>{ticket.title}</h1>
          <p>Review the complete customer thread, account context, triage state, and reply-email delivery.</p>
        </div>
        <div className="page-actions">
          <Link className="button" href="/admin/support">Support queue</Link>
          <Link className="button" href="/admin/users">Users</Link>
        </div>
      </header>

      {query.replied && <Notice type="success">The Jump in the Mix Response was saved to the ticket.</Notice>}
      {query.email === "sent" && <Notice type="success">The response email was delivered to the transactional email provider.</Notice>}
      {query.email === "previewed" && <Notice type="info">Transactional email is not configured in this development environment. The response was saved and rendered as a local preview.</Notice>}
      {query.email === "failed" && <Notice type="error">The response is safely stored in the ticket, but the email failed. Review the message below and retry delivery.</Notice>}
      {query.emailRetried && query.email !== "failed" && <Notice type="success">The response email retry completed.</Notice>}
      {query.triageSaved && <Notice type="success">Ticket category and priority updated.</Notice>}
      {query.statusSaved && <Notice type="success">Ticket status updated.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}

      <section className="support-admin-detail-grid">
        <main className="support-admin-main-column">
          <section className="card support-thread-card">
            <div className="card-header">
              <div><h2>Conversation</h2><p>All messages use server timestamps. Administrator identity remains auditable.</p></div>
              <span className="status-pill">{ticket.messages.length}</span>
            </div>
            <div className="support-thread">
              {ticket.messages.map((message) => (
                <article className={`support-message ${message.authorType === "ADMIN" ? "admin" : "user"}`} key={message.id}>
                  <header>
                    <strong>{message.authorType === "ADMIN" ? "Jump in the Mix Response" : requester?.name ?? "Customer"}</strong>
                    <time dateTime={message.createdAt.toISOString()}>{formatDateTime(message.createdAt)}</time>
                  </header>
                  <p>{message.body}</p>
                  {message.authorType === "ADMIN" && (
                    <footer className="support-email-state">
                      <span className={`status-pill email-${message.emailStatus.toLowerCase()}`}>{supportEmailStatusLabel(message.emailStatus)}</span>
                      {message.emailSentAt && <small>Sent {formatDateTime(message.emailSentAt)}</small>}
                      {message.emailError && <small className="support-email-error">{message.emailError}</small>}
                      {["FAILED", "PREVIEWED"].includes(message.emailStatus) && (
                        <form action={adminRetrySupportEmailAction}>
                          <input type="hidden" name="ticketId" value={ticket.id} />
                          <input type="hidden" name="messageId" value={message.id} />
                          <button className="button small" type="submit">Retry email</button>
                        </form>
                      )}
                    </footer>
                  )}
                </article>
              ))}
            </div>
          </section>

          {ticket.status !== "CLOSED" ? (
            <section className="card support-admin-reply-card">
              <div className="card-header"><div><h2>Reply</h2><p>Use a prepared response as a starting point, then tailor it to this customer.</p></div></div>
              <SupportReplyComposer ticketId={ticket.id} />
            </section>
          ) : (
            <section className="card support-inline-empty">
              <strong>This ticket is closed.</strong>
              <span>Reopen it from the status controls before adding another response.</span>
            </section>
          )}
        </main>

        <aside className="support-admin-side-column">
          <section className="card">
            <div className="card-header"><div><h2>Triage</h2><p>Classification helps the queue remain actionable.</p></div></div>
            <form action={adminUpdateSupportTicketTriageAction} className="form-stack">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <label className="field">
                <span className="field-label">Category</span>
                <select name="category" defaultValue={ticket.category}>
                  {SUPPORT_CATEGORIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Priority</span>
                <select name="priority" defaultValue={ticket.priority}>
                  {SUPPORT_PRIORITIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                </select>
              </label>
              <button className="button" type="submit">Save triage</button>
            </form>
          </section>

          <section className="card">
            <div className="card-header"><div><h2>Status</h2><p>{supportStatusLabel(ticket.status)} · last activity {formatDateTime(ticket.lastActivityAt)}</p></div></div>
            <div className="support-status-actions">
              {ticket.status !== "WAITING_ON_SUPPORT" && (
                <form action={adminUpdateSupportTicketStatusAction}><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="status" value="WAITING_ON_SUPPORT" /><button className="button" type="submit">Return to support queue</button></form>
              )}
              {ticket.status !== "RESOLVED" && (
                <form action={adminUpdateSupportTicketStatusAction}><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="status" value="RESOLVED" /><button className="button primary" type="submit">Resolve ticket</button></form>
              )}
              {ticket.status !== "CLOSED" ? (
                <form action={adminUpdateSupportTicketStatusAction}><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="status" value="CLOSED" /><button className="button danger" type="submit">Close ticket</button></form>
              ) : (
                <form action={adminUpdateSupportTicketStatusAction}><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="status" value="OPEN" /><button className="button" type="submit">Reopen ticket</button></form>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header"><div><h2>Customer context</h2><p>Use this information to investigate without asking the customer to repeat basic account details.</p></div></div>
            <dl className="support-definition-list">
              <div><dt>Requester</dt><dd>{requester?.name ?? "Unavailable"}</dd></div>
              <div><dt>Email</dt><dd>{requester?.email ?? ticket.requesterUserId}</dd></div>
              <div><dt>Email verified</dt><dd>{requester?.emailVerifiedAt ? "Yes" : "No"}</dd></div>
              <div><dt>Workspace</dt><dd>{workspace?.name ?? ticket.workspaceId}</dd></div>
              <div><dt>Plan</dt><dd>{workspace?.planTier.toLowerCase() ?? "Unavailable"}</dd></div>
              <div><dt>Subscription</dt><dd>{workspace?.subscriptionStatus.toLowerCase().replaceAll("_", " ") ?? "Unavailable"}</dd></div>
              <div><dt>Contacts</dt><dd>{usage.contacts}</dd></div>
              <div><dt>Active Mixes</dt><dd>{usage.mixes}</dd></div>
              <div><dt>Incomplete Jumps</dt><dd>{usage.pendingJumps}</dd></div>
              <div><dt>Active integrations</dt><dd>{usage.integrations}</dd></div>
              <div><dt>Category</dt><dd>{supportCategoryLabel(ticket.category)}</dd></div>
              <div><dt>Priority</dt><dd>{supportPriorityLabel(ticket.priority)}</dd></div>
            </dl>
          </section>
        </aside>
      </section>
    </div>
  );
}
