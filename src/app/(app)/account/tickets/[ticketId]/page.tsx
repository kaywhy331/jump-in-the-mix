import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { SupportContext } from "@/components/SupportContext";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { requireWorkspace } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import {
  reopenSupportTicketAction,
  replyToSupportTicketFormAction
} from "@/lib/support-actions";
import {
  supportCategoryLabel,
  supportPriorityLabel,
  supportStatusLabel
} from "@/lib/support-content";
import { getRequesterSupportTicket } from "@/lib/support-service";
import { SUPPORT_RETENTION_NOTICE } from "@/lib/data-retention-policy";

export const metadata: Metadata = { title: "Support ticket" };

type SearchParams = {
  created?: string;
  replied?: string;
  reopened?: string;
  error?: string;
  at?: string;
  sig?: string;
};

export default async function SupportTicketPage({
  params,
  searchParams
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ ticketId }, query, { session, workspace, user, impersonation }] = await Promise.all([
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
    <div className="page page--content support-ticket-page">
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
      <UrlErrorNotice params={query} viewer={session} />
      <p>{SUPPORT_RETENTION_NOTICE}</p><p>Support is best effort; there is no guaranteed reply time. Check this conversation for responses. If you cannot sign in, use <Link href="/contact">public contact support</Link>.</p>
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
            <ActionForm protect action={replyToSupportTicketFormAction} className="form-stack support-user-reply">
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
              <SupportContext /><div className="form-actions"><FormSubmitButton label="Send reply" pendingLabel="Sending…" /></div>
            </ActionForm>
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
