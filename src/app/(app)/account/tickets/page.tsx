import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { supportStatusLabel } from "@/lib/support-content";

export const metadata: Metadata = { title: "Support conversations" };
const PAGE_SIZE = 15;

export default async function SupportConversationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [query, { workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
  if (env.pilotMode) redirect("/help");
  const where = { workspaceId: workspace.id, requesterUserId: user.id };
  const [total, preferences] = await Promise.all([prisma.supportTicket.count({ where }), displayPreferencesForUser(user.id)]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number(query.page ?? 1);
  const page = Math.min(pages, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const tickets = await prisma.supportTicket.findMany({ where, orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { _count: { select: { messages: true } } } });

  return <div className="page conversations-page">
    <header className="page-header"><div><h1>Support conversations</h1><p>Your questions, replies, and next steps in one place.</p></div><Link className="button primary" href="/help#contact-support">New conversation</Link></header>
    {tickets.length ? <div className="support-ticket-list">{tickets.map(ticket => <Link className="support-ticket-row card" href={`/account/tickets/${ticket.id}`} key={ticket.id}>
      <div><strong>{ticket.title}</strong><small>{ticket._count.messages} messages · Updated {formatDateTime(ticket.lastActivityAt, preferences)}</small></div>
      <span className={`status-pill ${ticket.status === "RESOLVED" ? "done" : ""}`}>{supportStatusLabel(ticket.status)}</span>
    </Link>)}</div> : <EmptyState title="No conversations yet" description="Send us a question and keep the conversation here." actionHref="/help#contact-support" actionLabel="Ask for help" />}
    {pages > 1 && <nav className="pagination-bar" aria-label="Support conversation pages"><span>{total} conversations</span><div className="page-actions">{page > 1 && <Link className="button" href={`/account/tickets?page=${page - 1}`}>Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="button" href={`/account/tickets?page=${page + 1}`}>Next</Link>}</div></nav>}
    <Link className="button support-back-link" href="/help">Back to help</Link>
  </div>;
}
