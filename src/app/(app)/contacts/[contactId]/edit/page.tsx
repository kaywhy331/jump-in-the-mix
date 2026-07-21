import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { ContactForm } from "@/components/ContactForm";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
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
  const [contact, rawGroups, groupStates, customFields] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: contactId, workspaceId: workspace.id, archivedAt: null },
      include: { emails: true, phones: true, addresses: true, groupMemberships: true, customFieldValues: true }
    }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.contactCustomFieldDefinition.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] })
  ]);
  if (!contact) notFound();
  const groups = mergeGroupActivity(rawGroups, groupStates);

  return (
    <div className="page">
      <header className="page-header">
        <div><h1>Edit {contact.displayName}</h1><p>Primary and custom values are used to render accurate Jumps.</p></div>
        <div className="page-actions contact-detail-header-actions">
          <Link className="button mobile-header-action" href={`/contacts/${contact.id}`} aria-label="Back to Contact"><AppIcon name="arrowLeft" /><span>Back to Contact</span></Link>
        </div>
      </header>
      {query.error && <Notice type="error">{query.error}</Notice>}
      <ContactForm
        mode="edit"
        groups={groups.map((group) => ({ id: group.id, name: group.name, color: group.color, isActive: group.isActive }))}
        customFields={customFields.map((field) => ({ id: field.id, name: field.name, key: field.key }))}
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
          groupIds: contact.groupMemberships.map((membership) => membership.groupId),
          customFieldValues: contact.customFieldValues.map((item) => ({ definitionId: item.definitionId, value: item.value }))
        }}
      />
    </div>
  );
}
