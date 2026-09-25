import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { ContactForm } from "@/components/ContactForm";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { CONTACT_REVISION_INCLUDE, contactRevision } from "@/lib/contact-revision";
import { mergeGroupActivity } from "@/lib/group-activity";
import { prisma } from "@/lib/prisma";
import { customerReturnPath } from "@/lib/customer-return-path";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({
  params,
  searchParams
}: {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const [{ contactId }, query, { workspace }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const [contact, rawGroups, groupStates, customFields] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: contactId, workspaceId: workspace.id, archivedAt: null },
      include: CONTACT_REVISION_INCLUDE
    }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.contactCustomFieldDefinition.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] })
  ]);
  if (!contact) notFound();
  const todayReturn = customerReturnPath(query.returnTo);
  const returnTo = todayReturn?.startsWith("/jumps") ? todayReturn : null;
  const groups = mergeGroupActivity(rawGroups, groupStates);

  return (
    <div className="page page--form">
      <header className="page-header">
        <div><h1>Edit {contact.displayName}</h1><p>Primary contact details are used in prepared follow-ups.</p></div>
        <div className="page-actions contact-detail-header-actions">
          <Link className="button mobile-header-action" href={returnTo ?? `/contacts/${contact.id}`} aria-label={returnTo ? "Back to follow-up" : "Back to Contact"}><AppIcon name="chevronLeft" /><span>{returnTo ? "Back to follow-up" : "Back to Contact"}</span></Link>
        </div>
      </header>
      {query.error && <Notice type="error">{query.error}</Notice>}
      <ContactForm
        mode="edit"
        revision={contactRevision(contact)}
        returnTo={returnTo}
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
