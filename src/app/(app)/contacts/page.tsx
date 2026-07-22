import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { ContactsBulkWorkspace, type ContactBulkDto } from "@/components/ContactsBulkWorkspace";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { mergeGroupActivity } from "@/lib/group-activity";
import { formatPlanLimit, PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Contacts" };

const PAGE_SIZE = 50;

type SearchParams = {
  q?: string;
  group?: string;
  page?: string;
  importBatch?: string;
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

function importContactIds(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const contactId = (item as Record<string, unknown>).contactId;
    return typeof contactId === "string" && contactId ? [contactId] : [];
  }))];
}

function pageHref(input: { page: number; q: string; groupId: string; intent?: string; importBatchId: string }): string {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.groupId) params.set("group", input.groupId);
  if (input.intent) params.set("intent", input.intent);
  if (input.importBatchId) params.set("importBatch", input.importBatchId);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return `/contacts${query ? `?${query}` : ""}`;
}

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();
  const q = params.q?.trim().slice(0, 160) ?? "";
  const groupId = params.group?.trim() ?? "";
  const importBatchId = params.importBatch?.trim() ?? "";
  const requestedPage = Number(params.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10_000) : 1;
  const intent = params.intent === "important-date" || params.intent === "one-time-jump" ? params.intent : undefined;

  const importBatch = importBatchId
    ? await prisma.contactImportBatch.findFirst({ where: { id: importBatchId, workspaceId: workspace.id }, select: { id: true, results: true, status: true } })
    : null;
  const importedContactIds = importContactIds(importBatch?.results);
  const contactWhere: Prisma.ContactWhereInput = {
    workspaceId: workspace.id,
    archivedAt: null,
    ...(importBatchId ? { id: { in: importedContactIds.length ? importedContactIds : ["__no-imported-contacts__"] } } : {}),
    ...(groupId ? { groupMemberships: { some: { groupId } } } : {}),
    ...(q ? {
      OR: [
        { displayName: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { publicNotes: { contains: q, mode: "insensitive" } },
        { privateNotes: { contains: q, mode: "insensitive" } },
        { emails: { some: { email: { contains: q, mode: "insensitive" } } } },
        { phones: { some: { phone: { contains: q } } } },
        { customFieldValues: { some: { value: { contains: q, mode: "insensitive" } } } }
      ]
    } : {})
  };

  const [totalCount, contacts, rawGroups, groupStates, jumps, customFields] = await Promise.all([
    prisma.contact.count({ where: contactWhere }),
    prisma.contact.findMany({
      where: contactWhere,
      include: {
        emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        groupMemberships: { include: { group: true } },
        customFieldValues: { include: { definition: true } },
        jumpDates: { where: { isActive: true }, include: { dateType: true }, orderBy: { dateValue: "asc" } }
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
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
  const contactJumps = contacts.length ? await prisma.jump.findMany({
    where: { workspaceId: workspace.id, contactId: { in: contacts.map((contact) => contact.id) }, status: { not: "CANCELED" } },
    select: { contactId: true, scheduledAt: true, completedAt: true, status: true },
    orderBy: [{ contactId: "asc" }, { scheduledAt: "asc" }]
  }) : [];
  const jumpsByContact = new Map<string, typeof contactJumps>();
  for (const jump of contactJumps) jumpsByContact.set(jump.contactId, [...(jumpsByContact.get(jump.contactId) ?? []), jump]);

  const contactDtos: ContactBulkDto[] = contacts.map((contact) => {
    const state = jumpsByContact.get(contact.id) ?? [];
    const last = [...state].filter((jump) => jump.completedAt).sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];
    const next = state.find((jump) => ["PENDING", "COPIED"].includes(jump.status));
    const custom = new Map(contact.customFieldValues.map((item) => [item.definition.key, item.value]));
    return {
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
    };
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const resultStart = totalCount ? (page - 1) * PAGE_SIZE + 1 : 0;
  const resultEnd = Math.min(page * PAGE_SIZE, totalCount);
  const resultMessage = totalCount
    ? `${totalCount.toLocaleString()} Contact${totalCount === 1 ? "" : "s"} found. Showing ${resultStart.toLocaleString()} through ${resultEnd.toLocaleString()}.`
    : `No Contacts matched${q ? ` “${q}”` : " the current filters"}.`;

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
      {importBatchId && <Notice type={importBatch ? "info" : "error"}>{importBatch ? `Showing Contacts touched by the selected ${importBatch.status.toLowerCase()} import.` : "That import batch is unavailable in this workspace."}</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <p className="sr-only" role="status" aria-live="polite">{resultMessage}</p>
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
      <nav className="pagination-bar" aria-label="Contact result pages">
        <span>{resultMessage}</span>
        <div className="page-actions">
          {page > 1 && <Link className="button" href={pageHref({ page: page - 1, q, groupId, intent, importBatchId })}>Previous</Link>}
          <span>Page {Math.min(page, totalPages)} of {totalPages}</span>
          {page < totalPages && <Link className="button" href={pageHref({ page: page + 1, q, groupId, intent, importBatchId })}>Next</Link>}
        </div>
      </nav>
    </div>
  );
}
