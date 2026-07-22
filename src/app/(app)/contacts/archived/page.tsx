import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { restoreContactAction } from "@/lib/contact-lifecycle-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Archived Contacts" };

type SearchParams = { q?: string; page?: string; restored?: string; error?: string };
const PAGE_SIZE = 50;

export default async function ArchivedContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const q = query.q?.trim() ?? "";
  const page = Math.max(Number.parseInt(query.page ?? "1", 10) || 1, 1);
  const where = {
    workspaceId: workspace.id,
    archivedAt: { not: null as null },
    ...(q ? { OR: [{ displayName: { contains: q, mode: "insensitive" as const } }, { company: { contains: q, mode: "insensitive" as const } }, { emails: { some: { email: { contains: q, mode: "insensitive" as const } } } }, { phones: { some: { phone: { contains: q } } } }] } : {})
  };
  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({ where, include: { emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, _count: { select: { jumps: true, jumpDates: true } } }, orderBy: [{ archivedAt: "desc" }, { displayName: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.contact.count({ where })
  ]);
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const href = (nextPage: number) => `/contacts/archived?${new URLSearchParams({ ...(q ? { q } : {}), page: String(nextPage) }).toString()}`;

  return (
    <div className="page archived-contacts-page">
      {query.restored && <Notice type="success">Contact restored. Eligible future Jumps are being reconciled.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header"><div><h1>Archived Contacts</h1><p>Restore a relationship without losing its notes, dates, communication history, or assignments.</p></div><Link className="button" href="/contacts"><AppIcon name="arrowLeft" /> Active Contacts</Link></header>
      <form className="filter-bar live-search-form" action="/contacts/archived" method="get"><input name="q" type="search" defaultValue={q} placeholder="Search archived name, email, phone, or company" aria-label="Search archived Contacts" autoComplete="off" />{q && <Link className="button" href="/contacts/archived">Clear</Link>}</form>
      <p className="sr-only" role="status" aria-live="polite">{total} archived Contact{total === 1 ? "" : "s"} found.</p>
      {contacts.length ? <div className="contact-list">{contacts.map((contact) => { const email = contact.emails[0]?.email; const phone = contact.phones[0]?.phone; return <article className="contact-row" key={contact.id}><div className="contact-main"><div className="avatar">{contact.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div><div><h3>{contact.displayName}</h3><p>{contact.company || [email, phone].filter(Boolean).join(" · ") || "No company or primary method"}</p><small>Archived {contact.archivedAt?.toLocaleString()} · {contact._count.jumpDates} Important Date{contact._count.jumpDates === 1 ? "" : "s"} · {contact._count.jumps} historical Jump{contact._count.jumps === 1 ? "" : "s"}</small></div></div><div className="table-actions"><form action={restoreContactAction}><input type="hidden" name="contactId" value={contact.id} /><button className="button small primary" type="submit">Restore Contact</button></form></div></article>; })}</div> : <EmptyState title={q ? "No archived Contacts matched" : "No archived Contacts"} description={q ? "Try a broader search." : "Archived relationships will remain available here for restoration."} actionHref="/contacts" actionLabel="Return to Contacts" />}
      {pages > 1 && <nav className="pagination" aria-label="Archived Contacts pagination">{page > 1 ? <Link className="button" href={href(page - 1)}>Previous</Link> : <span /> }<span>Page {page} of {pages}</span>{page < pages ? <Link className="button" href={href(page + 1)}>Next</Link> : <span />}</nav>}
    </div>
  );
}
