import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { SupportFaq } from "@/components/SupportFaq";
import { requireWorkspace } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { createSupportTicketAction } from "@/lib/support-actions";
import {
  SUPPORT_CATEGORIES,
  supportCategoryLabel,
  supportStatusLabel
} from "@/lib/support-content";

export const metadata: Metadata = { title: "Help & Support" };

type SearchParams = { error?: string };

export default async function HelpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { workspace, user, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  const recentTickets = await prisma.supportTicket.findMany({
    where: { workspaceId: workspace.id, requesterUserId: user.id },
    include: { _count: { select: { messages: true } } },
    orderBy: { lastActivityAt: "desc" },
    take: 5
  });

  return (
    <div className="page help-page">
      <header className="page-header">
        <div>
          <h1>Help & Support</h1>
          <p>Find a practical answer or keep a private, timestamped conversation with Jump in the Mix Support.</p>
        </div>
        <div className="page-actions">
          <Link className="button" href="/account#support">My tickets</Link>
        </div>
      </header>

      {query.error && <Notice type="error">{query.error}</Notice>}
      {impersonation && <Notice type="info">This support view is read-only. End the administrator support session before submitting or replying to a ticket.</Notice>}

      <SupportFaq />

      <section className="support-contact-grid" id="contact-support">
        <section className="card support-contact-card">
          <div className="card-header">
            <div>
              <h2>Contact Jump in the Mix Support</h2>
              <p>Describe one problem or question per ticket so the complete investigation stays easy to follow.</p>
            </div>
          </div>
          <form action={createSupportTicketAction} className="form-stack">
            <label className="field">
              <span className="field-label">Topic</span>
              <select name="category" defaultValue="GENERAL" disabled={Boolean(impersonation)} required>
                {SUPPORT_CATEGORIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Ticket title</span>
              <input
                name="title"
                minLength={5}
                maxLength={160}
                placeholder="Example: My Contact import is missing a label"
                disabled={Boolean(impersonation)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">What happened?</span>
              <textarea
                name="body"
                minLength={10}
                maxLength={5000}
                rows={8}
                placeholder="Tell us what you expected, what happened instead, the page or workflow involved, and the approximate time. Do not include passwords, card details, or provider tokens."
                disabled={Boolean(impersonation)}
                required
              />
            </label>
            <div className="support-safety-note">
              <strong>Keep secrets out of tickets.</strong>
              <span>Never send passwords, private keys, session tokens, or other secrets.</span>
            </div>
            <div className="form-actions">
              <button className="button primary" type="submit" disabled={Boolean(impersonation)}>Submit support ticket</button>
            </div>
          </form>
        </section>

        <aside className="card support-recent-card">
          <div className="card-header">
            <div><h2>Recent tickets</h2><p>Replies and status changes stay in one conversation.</p></div>
            <span className="status-pill">{recentTickets.length}</span>
          </div>
          <div className="support-ticket-list compact">
            {recentTickets.map((ticket) => (
              <Link className="support-ticket-row" href={`/account/tickets/${ticket.id}`} key={ticket.id}>
                <div>
                  <strong>{ticket.title}</strong>
                  <span>{ticket.reference} · {supportCategoryLabel(ticket.category)}</span>
                  <small>{ticket._count.messages} message{ticket._count.messages === 1 ? "" : "s"} · Updated {formatDateTime(ticket.lastActivityAt)}</small>
                </div>
                <span className={`status-pill ${ticket.status === "RESOLVED" ? "done" : ""}`}>{supportStatusLabel(ticket.status)}</span>
              </Link>
            ))}
            {!recentTickets.length && (
              <div className="support-inline-empty">
                <strong>No support tickets yet.</strong>
                <span>Your submitted conversations will appear here.</span>
              </div>
            )}
          </div>
          <Link className="button full-width" href="/account#support">View all tickets</Link>
        </aside>
      </section>
    </div>
  );
}
