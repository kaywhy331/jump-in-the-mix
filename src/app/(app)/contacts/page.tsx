import type { Metadata } from "next";
import Link from "next/link";
import { ContactsBulkWorkspace, type ContactBulkDto } from "@/components/ContactsBulkWorkspace";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { formatPlanLimit, PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Contacts" };

type SearchParams = {
  q?: string;
  group?: string;
  created?: string;
  archived?: string;
  groupCreated?: string;
  groupInactive?: string;
  groupDeleted?: string;
  groupsActiveSaved?: string;
  bulkAssigned?: string;
  bulkRemoved?: string;
  bulkArchived?: string;
  error?: string;
  intent?: string;
};

function dateValue(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();
  const q = params.q?.trim() ?? "";
  const groupId = params.group?.trim() ?? "";
  const intent = params.intent === "important-date" || params.intent === "one-time-jump" ? params.intent : undefined;
  const [contacts, rawGroups, groupStates, jumps, customFields] = await Promise.all([
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
            { phones: { some: { phone: { contains: q } } } },
            { customFieldValues: { some: { value: { contains: q, mode: "insensitive" } } } }
          ]
        } : {})
      },
      include: {
        emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        groupMemberships: { include: { group: true } },
        customFieldValues: { include: { definition: true } },
        jumpDates: { include: { dateType: true }, orderBy: { dateValue: "asc" } }
      },
      orderBy: { displayName: "asc" }
    }),
    prisma.group.findMany({
      where: { workspaceId: workspace.id },
      include: { _count: { select: { memberships: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.contactGroupState.findMany({
      where: { workspaceId: workspace.id },
      select: { groupId: true, isActive: true }
    }),
    prisma.stepTemplate.findMany({
      where: { workspaceId: workspace.id, isActive: true },
      select: { id: true, name: true, channel: true },
      orderBy: [{ channel: "asc" }, { name: "asc" }]
    }),
    prisma.contactCustomFieldDefinition.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, key: true },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }]
    })
  ]);
  const groups = mergeGroupActivity(rawGroups, groupStates);
  const activeByGroupId = new Map(groups.map((group) => [group.id, group.isActive]));
  const contactJumps = contacts.length ? await prisma.jump.findMany({ where: { workspaceId: workspace.id, contactId: { in: contacts.map((contact) => contact.id) }, status: { not: "CANCELED" } }, select: { contactId: true, scheduledAt: true, completedAt: true, status: true }, orderBy: { scheduledAt: "asc" } }) : [];
  const jumpsByContact = new Map<string, typeof contactJumps>();
  for (const jump of contactJumps) jumpsByContact.set(jump.contactId, [...(jumpsByContact.get(jump.contactId) ?? []), jump]);

  const contactDtos: ContactBulkDto[] = contacts.map((contact) => {
    const state = jumpsByContact.get(contact.id) ?? [];
    const last = [...state].filter((jump) => jump.completedAt).sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];
    const next = state.find((jump) => ["PENDING", "COPIED"].includes(jump.status));
    const custom = new Map(contact.customFieldValues.map((item) => [item.definition.key, item.value]));
    return ({
    id: contact.id,
    displayName: contact.displayName,
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    publicNotes: contact.publicNotes,
    emails: contact.emails.map((item) => ({ email: item.email, isPrimary: item.isPrimary })),
    phones: contact.phones.map((item) => ({ phone: item.phone, isPrimary: item.isPrimary })),
    addresses: contact.addresses.map((item) => ({
      street1: item.street1,
      street2: item.street2,
      city: item.city,
      state: item.state,
      postalCode: item.postalCode,
      country: item.country,
      isPrimary: item.isPrimary
    })),
    groups: contact.groupMemberships.map(({ group }) => group.name),
    groupDetails: contact.groupMemberships.map(({ group }) => ({
      id: group.id,
      name: group.name,
      color: group.color,
      isActive: activeByGroupId.get(group.id) !== false
    })),
    customFields: contact.customFieldValues.map((item) => ({ key: item.definition.key, name: item.definition.name, value: item.value })),
    jumpDateCount: contact.jumpDates.length,
    jumpDates: contact.jumpDates.map((item) => ({
      type: item.dateType.name,
      label: item.label,
      date: dateValue(item.dateValue),
      recurrence: item.recurrence.toLowerCase()
    })),
    lastInteraction: last?.completedAt ? formatDateTime(last.completedAt) : null,
    nextJump: next ? formatDateTime(next.scheduledAt) : null,
    nextJumpOverdue: Boolean(next && next.scheduledAt < new Date()),
    relationshipType: custom.get("relationship-type") ?? custom.get("relationship") ?? null,
    preferredChannel: custom.get("preferred-channel") ?? null,
    priority: custom.get("priority") ?? null
  }); });

  return (
    <div className="page">
      {params.created && <Notice type="success">Contact added. Add an Important Date or assign a Mix when you are ready.</Notice>}
      {params.archived && <Notice type="success">Contact archived. Completed history remains preserved.</Notice>}
      {params.groupCreated && <Notice type="success">Contact Group created.</Notice>}
      {params.groupInactive && <Notice type="info">The new group was preserved as inactive because your active-group allowance is already full. Choose the groups that should remain active from Manage groups.</Notice>}
      {params.groupDeleted && <Notice type="success">Contact Group removed. Contacts were preserved.</Notice>}
      {params.groupsActiveSaved && <Notice type="success">Active Contact Groups updated. Existing memberships are preserved and future Jumps are being reconciled.</Notice>}
      {params.bulkAssigned && <Notice type="success">Assigned {params.bulkAssigned} selected Contact{params.bulkAssigned === "1" ? "" : "s"} to the group.</Notice>}
      {params.bulkRemoved && <Notice type="success">Removed the group from {params.bulkRemoved} selected Contact{params.bulkRemoved === "1" ? "" : "s"}.</Notice>}
      {params.bulkArchived && <Notice type="success">Archived {params.bulkArchived} Contact{params.bulkArchived === "1" ? "" : "s"}. Completed history remains preserved.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <ContactsBulkWorkspace
        contacts={contactDtos}
        groups={groups.map((group) => ({ id: group.id, name: group.name, description: group.description, color: group.color, contactCount: group._count.memberships, isActive: group.isActive }))}
        jumps={jumps.map((jump) => ({ id: jump.id, name: jump.name, channel: jump.channel }))}
        customFields={customFields}
        groupLimit={formatPlanLimit(PLAN_LIMITS[workspace.planTier].groups)}
        query={q}
        groupFilter={groupId}
        intent={intent}
      />
    </div>
  );
}
