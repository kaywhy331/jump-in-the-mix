import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactForm } from "@/components/ContactForm";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({
  params,
  searchParams
}: {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ contactId }, query, { workspace }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const [contact, groups] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: contactId, workspaceId: workspace.id, archivedAt: null },
      include: { emails: true, phones: true, addresses: true, groupMemberships: true }
    }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } })
  ]);
  if (!contact) notFound();

  return (
    <div className="page">
      <header className="page-header"><div><h1>Edit {contact.displayName}</h1><p>Primary values are used for one-tap email, SMS, and phone actions.</p></div></header>
      {query.error && <Notice type="error">{query.error}</Notice>}
      <ContactForm
        mode="edit"
        groups={groups.map((group) => ({ id: group.id, name: group.name, color: group.color }))}
        contact={{
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          company: contact.company,
          publicNotes: contact.publicNotes,
          privateNotes: contact.privateNotes,
          emails: contact.emails,
          phones: contact.phones,
          addresses: contact.addresses,
          groupIds: contact.groupMemberships.map((membership) => membership.groupId)
        }}
      />
    </div>
  );
}
