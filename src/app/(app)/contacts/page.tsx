import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { archiveContactAction, createGroupAction, deleteGroupAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { initials } from "@/lib/format";
import { formatPlanLimit, PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Contacts" };

type SearchParams = {
  q?: string;
  group?: string;
  created?: string;
  archived?: string;
  groupCreated?: string;
  groupDeleted?: string;
  error?: string;
};

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();
  const q = params.q?.trim() ?? "";
  const groupId = params.group?.trim() ?? "";
  const [contacts, groups] = await Promise.all([
    prisma.contact.findMany({
      where: {
        workspaceId: workspace.id,
        archivedAt: null,
        ...(groupId ? { groupMemberships: { some: { groupId } } } : {}),
        ...(q ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { emails: { some: { email: { contains: q, mode: "insensitive" } } } },
            { phones: { some: { phone: { contains: q } } } }
          ]
        } : {})
      },
      include: {
        emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        groupMemberships: { include: { group: true } },
        jumpDates: true
      },
      orderBy: { displayName: "asc" }
    }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, include: { _count: { select: { memberships: true } } }, orderBy: { name: "asc" } })
  ]);
  const limits = PLAN_LIMITS[workspace.planTier];

  return (
    <div className="page">
      {params.created && <Notice type="success">Contact added. Add a Jump Date or assign a Mix when you are ready.</Notice>}
      {params.archived && <Notice type="success">Contact archived. Completed history remains preserved.</Notice>}
      {params.groupCreated && <Notice type="success">Contact Group created.</Notice>}
      {params.groupDeleted && <Notice type="success">Contact Group removed. Contacts were preserved.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div><h1>Contacts</h1><p>Keep relationship details, Jump Dates, and group classifications together.</p></div>
        <div className="page-actions"><details className="group-manager"><summary className="button">Manage groups</summary><div className="group-manager-panel"><div className="section-label"><h2>Contact Groups</h2><span>{groups.length}/{formatPlanLimit(limits.groups)}</span></div><form action={createGroupAction} className="group-create-form"><input name="name" placeholder="Group name" aria-label="Group name" required /><input name="description" placeholder="Optional description" aria-label="Group description" /><label className="color-input"><span>Color</span><input name="color" type="color" defaultValue="#5d4cf2" /></label><button className="button primary" type="submit">Add group</button></form>{groups.length > 0 && <div className="group-manage-list">{groups.map((group) => <div className="group-manage-row" key={group.id}><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} /><span><strong>{group.name}</strong><small>{group._count.memberships} contact{group._count.memberships === 1 ? "" : "s"}</small></span><form action={deleteGroupAction}><input type="hidden" name="groupId" value={group.id} /><button className="button small danger" type="submit">Delete</button></form></div>)}</div>}</div></details><Link href="/contacts/new" className="button primary">+ Add contact</Link></div>
      </header>

      <form className="filter-bar contact-filter-bar" action="/contacts" method="get">
        <input name="q" defaultValue={q} placeholder="Search name, company, email, or phone" aria-label="Search contacts" />
        <select name="group" defaultValue={groupId} aria-label="Filter Contacts by group"><option value="">All groups</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
        <button className="button" type="submit">Filter</button>
        {(q || groupId) && <Link className="button" href="/contacts">Clear</Link>}
      </form>

      {contacts.length ? (
        <div className="contact-list">
          {contacts.map((contact) => {
            const primaryEmail = contact.emails.find((item) => item.isPrimary) ?? contact.emails[0];
            const primaryPhone = contact.phones.find((item) => item.isPrimary) ?? contact.phones[0];
            return (
              <article className="contact-row" key={contact.id}>
                <Link href={`/contacts/${contact.id}`} className="contact-main">
                  <div className="avatar">{initials(contact.displayName) || "?"}</div>
                  <div>
                    <h3>{contact.displayName}</h3>
                    <div className="contact-meta">{contact.company && <span>{contact.company}</span>}{primaryEmail && <span>{primaryEmail.email}</span>}{primaryPhone && <span>{primaryPhone.phone}</span>}<span>{contact.jumpDates.length} Jump Date{contact.jumpDates.length === 1 ? "" : "s"}</span></div>
                    {contact.groupMemberships.length > 0 && <div className="contact-group-list">{contact.groupMemberships.slice(0, 3).map(({ group }) => <span className="group-chip" key={group.id}><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />{group.name}</span>)}{contact.groupMemberships.length > 3 && <span className="group-chip">+{contact.groupMemberships.length - 3}</span>}</div>}
                  </div>
                </Link>
                <div className="table-actions"><Link className="button small" href={`/contacts/${contact.id}/edit`}>Edit</Link><details className="destructive-confirm"><summary className="button small danger">Archive…</summary><div className="destructive-confirm-panel"><p>Archive this Contact? Their future pending Jumps will be canceled.</p><form action={archiveContactAction}><input type="hidden" name="contactId" value={contact.id} /><button className="button small danger" type="submit">Confirm archive</button></form></div></details></div>
              </article>
            );
          })}
        </div>
      ) : q || groupId ? (
        <EmptyState title="No contacts matched those filters" description="Try a different search or Contact Group." actionHref="/contacts" actionLabel="Clear filters" />
      ) : (
        <EmptyState title="Start with one person" description="Add the next person you genuinely need to remember." actionHref="/contacts/new" actionLabel="Add my first contact" />
      )}
    </div>
  );
}
