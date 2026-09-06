import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import {
  reopenSupportTicketAction,
  replyToSupportTicketAction
} from "@/lib/support-actions";
import {
  supportCategoryLabel,
  supportPriorityLabel,
  supportStatusLabel
} from "@/lib/support-content";
import { getRequesterSupportTicket } from "@/lib/support-service";

export const metadata: Metadata = { title: "Support ticket" };

type SearchParams = {
  created?: string;
  replied?: string;
  reopened?: string;
  error?: string;
};

export default async function SupportTicketPage({
  params,
  searchParams
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ ticketId }, query, { workspace, user, impersonation }] = await Promise.all([
    params,
    searchParams,
    requireWorkspace()
  ]);
  const ticket = await getRequesterSupportTicket({
    ticketId,
    workspaceId: workspace.id,
    requesterUserId: user.id
  });
  if (!ticket) notFound();
  const displayPreferences = await displayPreferencesForUser(user.id);
  const replyAllowed = ticket.status !== "CLOSED" && !impersonation;

  return (
    <div className="page support-ticket-page">
      <header className="page-header">
        <div>
          <span className="support-ticket-reference">{ticket.reference}</span>
          <h1>{ticket.title}</h1>
          <p>Your conversation with support. Replies and next steps stay together.</p>
        </div>
        <div className="page-actions">
          <Link className="button" href="/help">Help & FAQ</Link>
          <Link className="button" href="/account/tickets">All tickets</Link>
        </div>
      </header>

      {query.created && <Notice type="success">Your ticket was submitted to Jump in the Mix Support.</Notice>}
      {query.replied && <Notice type="success">Your reply was added to the ticket.</Notice>}
      {query.reopened && <Notice type="success">The ticket was reopened and returned to the support queue.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      {impersonation && <Notice type="info">This is a view-only administrator support session. Ticket replies and status changes are unavailable.</Notice>}

      <section className="support-ticket-layout">
        <main className="card support-thread-card">
          <div className="support-thread">
            {ticket.messages.map((message) => (
              <article className={`support-message ${message.authorType === "ADMIN" ? "admin" : "user"}`} key={message.id}>
                <header>
                  <strong>{message.authorType === "ADMIN" ? "Jump in the Mix Response" : "You"}</strong>
                  <time dateTime={message.createdAt.toISOString()}>{formatDateTime(message.createdAt, displayPreferences)}</time>
                </header>
                <p>{message.body}</p>
              </article>
            ))}
          </div>

          {ticket.status === "RESOLVED" && !impersonation && (
            <section className="support-resolution-panel">
              <div><strong>Is this still unresolved?</strong><span>Reopening returns the same conversation to the support queue.</span></div>
              <form action={reopenSupportTicketAction}>
                <input type="hidden" name="ticketId" value={ticket.id} />
                <button className="button" type="submit">Reopen ticket</button>
              </form>
            </section>
          )}

          {replyAllowed && (
            <form action={replyToSupportTicketAction} className="form-stack support-user-reply">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <label className="field">
                <span className="field-label">Reply to this ticket</span>
                <textarea
                  name="body"
                  minLength={2}
                  maxLength={5000}
                  rows={6}
                  placeholder="Add the result of the last step, answer a support question, or provide another relevant detail…"
                  required
                />
              </label>
              <div className="form-actions"><button className="button primary" type="submit">Send reply</button></div>
            </form>
          )}

          {ticket.status === "CLOSED" && (
            <div className="support-inline-empty">
              <strong>This ticket is closed.</strong>
              <span>Open a new ticket for another issue so the conversations remain clear.</span>
              <Link className="button" href="/help#contact-support">Open a new ticket</Link>
            </div>
          )}
        </main>

        <aside className="card support-ticket-summary">
          <div className="card-header"><div><h2>Ticket details</h2><p>The latest information about your conversation.</p></div></div>
          <dl className="support-definition-list">
            <div><dt>Status</dt><dd><span className={`status-pill ${ticket.status === "RESOLVED" ? "done" : ""}`}>{supportStatusLabel(ticket.status)}</span></dd></div>
            <div><dt>Category</dt><dd>{supportCategoryLabel(ticket.category)}</dd></div>
            <div><dt>Priority</dt><dd>{supportPriorityLabel(ticket.priority)}</dd></div>
            <div><dt>Opened</dt><dd>{formatDateTime(ticket.createdAt, displayPreferences)}</dd></div>
            <div><dt>Last activity</dt><dd>{formatDateTime(ticket.lastActivityAt, displayPreferences)}</dd></div>
            <div><dt>Messages</dt><dd>{ticket.messages.length}</dd></div>
          </dl>
        </aside>
      </section>
    </div>
  );
}
