import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { SupportFaq } from "@/components/SupportFaq";
import { requireWorkspace } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { createSupportTicketAction } from "@/lib/support-actions";
import { SUPPORT_CATEGORIES, supportCategoryLabel, supportStatusLabel } from "@/lib/support-content";

export const metadata: Metadata = { title: "Help" };

type SearchParams = { error?: string };

function SelfHostedHelp() {
  const email = env.emailReplyTo.trim();
  return (
    <section className="support-contact-grid" id="contact-support">
      <section className="card support-contact-card">
        <div className="card-header"><div><h2>Self-hosted help</h2><p>The operator of this installation manages access, email, updates, and backups.</p></div></div>
        <div className="form-stack">
          <div><strong>Locked out?</strong><p>Ask the operator to run <code>npm run pilot:reset-password -- your@email.com</code> on the server. The command creates a short-lived recovery link without requiring email delivery.</p></div>
          <div><strong>Something is not working?</strong><p>Run <code>npm run doctor</code>, then check the local logs with <code>npm run pilot:logs</code>. Never paste customer data, passwords, keys, or session tokens into a public report.</p></div>
          <div className="page-actions">
            <a className="button primary" href="https://github.com/kaywhy331/jump-in-the-mix/blob/main/docs/PILOT_RUNBOOK.md" target="_blank" rel="noreferrer">Open operator guide</a>
            <a className="button" href="https://github.com/kaywhy331/jump-in-the-mix/issues/new/choose" target="_blank" rel="noreferrer">Report a sanitized issue</a>
            {email && <a className="button" href={`mailto:${email}`}>Email the operator</a>}
          </div>
        </div>
      </section>
    </section>
  );
}

export default async function HelpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, context] = await Promise.all([searchParams, requireWorkspace()]);
  const { workspace, user, impersonation } = context;
  const displayPreferences = await displayPreferencesForUser(user.id);

  if (env.pilotMode) {
    return (
      <div className="page help-page">
        <header className="page-header"><div><h1>Help</h1><p>Plain-language answers plus operator steps for this self-hosted installation.</p></div></header>
        <SupportFaq />
        <SelfHostedHelp />
      </div>
    );
  }

  const recentTickets = await prisma.supportTicket.findMany({
    where: { workspaceId: workspace.id, requesterUserId: user.id },
    include: { _count: { select: { messages: true } } },
    orderBy: { lastActivityAt: "desc" },
    take: 5
  });

  return (
    <div className="page help-page">
      <header className="page-header">
        <div><h1>Help</h1><p>Find a quick answer or send a private message to the support team.</p></div>
        <div className="page-actions"><Link className="button" href="/account/tickets">My conversations</Link></div>
      </header>

      {query.error && <Notice type="error">{query.error}</Notice>}
      {impersonation && <Notice type="info">This view is read-only. End the support session before submitting or replying.</Notice>}

      <SupportFaq />

      <section className="support-contact-grid" id="contact-support">
        <section className="card support-contact-card">
          <div className="card-header"><div><h2>Message support</h2><p>Tell us what you were trying to do and what happened.</p></div></div>
          <form action={createSupportTicketAction} className="form-stack">
            <label className="field"><span className="field-label">Topic</span><select name="category" defaultValue="GENERAL" disabled={Boolean(impersonation)} required>{SUPPORT_CATEGORIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
            <label className="field"><span className="field-label">Short title</span><input name="title" minLength={5} maxLength={160} placeholder="Example: An imported tag is missing" disabled={Boolean(impersonation)} required /></label>
            <label className="field"><span className="field-label">What happened?</span><textarea name="body" minLength={10} maxLength={5000} rows={8} placeholder="What did you expect, what happened instead, and which page were you on? Do not include passwords or customer information." disabled={Boolean(impersonation)} required /></label>
            <div className="support-safety-note"><strong>Keep private data out.</strong><span>Never send passwords, customer information, private keys, session tokens, or provider credentials.</span></div>
            <div className="form-actions"><button className="button primary" type="submit" disabled={Boolean(impersonation)}>Send to support</button></div>
          </form>
        </section>

        <aside className="card support-recent-card">
          <div className="card-header"><div><h2>Recent conversations</h2><p>Replies and status changes stay together.</p></div><span className="status-pill">{recentTickets.length}</span></div>
          <div className="support-ticket-list compact">
            {recentTickets.map((ticket) => (
              <Link className="support-ticket-row" href={`/account/tickets/${ticket.id}`} key={ticket.id}>
                <div><strong>{ticket.title}</strong><span>{ticket.reference} · {supportCategoryLabel(ticket.category)}</span><small>{ticket._count.messages} message{ticket._count.messages === 1 ? "" : "s"} · Updated {formatDateTime(ticket.lastActivityAt, displayPreferences)}</small></div>
                <span className={`status-pill ${ticket.status === "RESOLVED" ? "done" : ""}`}>{supportStatusLabel(ticket.status)}</span>
              </Link>
            ))}
            {!recentTickets.length && <div className="support-inline-empty"><strong>No conversations yet.</strong><span>Messages you send to support will appear here.</span></div>}
          </div>
          <Link className="button full-width" href="/account/tickets">View all conversations</Link>
        </aside>
      </section>
    </div>
  );
}
