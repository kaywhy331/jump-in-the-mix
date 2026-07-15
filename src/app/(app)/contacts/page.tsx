import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { archiveContactAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { initials } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; created?: string; archived?: string }> }) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();
  const q = params.q?.trim() ?? "";
  const contacts = await prisma.contact.findMany({
    where: {
      workspaceId: workspace.id,
      archivedAt: null,
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" } },
              { company: { contains: q, mode: "insensitive" } },
              { emails: { some: { email: { contains: q, mode: "insensitive" } } } },
              { phones: { some: { phone: { contains: q } } } }
            ]
          }
        : {})
    },
    include: { emails: true, phones: true, groupMemberships: { include: { group: true } }, jumpDates: true },
    orderBy: { displayName: "asc" }
  });

  return (
    <div className="page">
      {params.created && <Notice type="success">Contact added. Add an Important Date or apply a Mix when you are ready.</Notice>}
      {params.archived && <Notice type="success">Contact archived. Their history remains preserved.</Notice>}
      <header className="page-header"><div><h1>Contacts</h1><p>Keep only the details needed to follow through.</p></div><div className="page-actions"><Link href="/contacts/new" className="button primary">Add contact</Link></div></header>
      <form className="filter-bar" action="/contacts" method="get"><input name="q" defaultValue={q} placeholder="Search name, company, email, or phone" aria-label="Search contacts" /><button className="button" type="submit">Search</button>{q && <Link className="button" href="/contacts">Clear</Link>}</form>
      {contacts.length ? (
        <div className="contact-list">
          {contacts.map((contact) => {
            const primaryEmail = contact.emails.find((item) => item.isPrimary) ?? contact.emails[0];
            const primaryPhone = contact.phones.find((item) => item.isPrimary) ?? contact.phones[0];
            return (
              <article className="contact-row" key={contact.id}>
                <Link href={`/contacts/${contact.id}`} className="contact-main"><div className="avatar">{initials(contact.displayName) || "?"}</div><div><h3>{contact.displayName}</h3><div className="contact-meta">{contact.company && <span>{contact.company}</span>}{primaryEmail && <span>{primaryEmail.email}</span>}{primaryPhone && <span>{primaryPhone.phone}</span>}<span>{contact.jumpDates.length} important date{contact.jumpDates.length === 1 ? "" : "s"}</span></div></div></Link>
                <div className="table-actions"><form action={archiveContactAction}><input type="hidden" name="contactId" value={contact.id} /><button className="button small danger" type="submit">Archive</button></form></div>
              </article>
            );
          })}
        </div>
      ) : q ? (
        <EmptyState title="No contacts matched that search" description="Try a different name, company, email, or phone number." actionHref="/contacts" actionLabel="Clear search" />
      ) : (
        <EmptyState title="Start with one person" description="You do not need to import an entire database. Add the next person you genuinely need to remember." actionHref="/contacts/new" actionLabel="Add my first contact" />
      )}
    </div>
  );
}
