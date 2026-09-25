import { contactDueLabel } from "@/lib/contact-profile-view";
import { ContactProfile } from "@/components/ContactProfile";
import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { ContactSavedViewsBar } from "@/components/ContactSavedViewsBar";
import { ContactsBulkWorkspace, type ContactBulkDto } from "@/components/ContactsBulkWorkspace";
import { Notice } from "@/components/Notice";
import { AppIcon } from "@/components/AppIcon";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { restoreContactAction } from "@/lib/contact-lifecycle-actions";
import { phoneSearchDigits } from "@/lib/phone-dial";
import { requireWorkspace } from "@/lib/auth";
import { contactFollowUpSummary } from "@/lib/contact-follow-up-summary";
import { formatDateTime } from "@/lib/format";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { mergeGroupActivity } from "@/lib/group-activity";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Contacts" };

const PAGE_SIZE = 50;

type SearchParams = {
  stateUpdated?: string;
  archivedContact?: string;
  restored?: string;
  people?: string;
  person?: string;
  q?: string;
  group?: string;
  priority?: string;
  permission?: string;
  view?: string;
  page?: string;
  sort?: string;
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
  viewSaved?: string;
  defaultViewSaved?: string;
  viewDeleted?: string;
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

function savedViewValue(query: Prisma.JsonValue, key: string): string {
  if (!query || typeof query !== "object" || Array.isArray(query)) return "";
  const value = (query as Prisma.JsonObject)[key];
  return typeof value === "string" ? value : "";
}

function pageHref(input: {
  page: number;
  sort?: string;
  q: string;
  groupId: string;
  priority: string;
  permission: string;
  viewId: string;
  intent?: string;
  importBatchId: string;
}): string {
  const params = new URLSearchParams();
  if (input.sort && input.sort !== "name") params.set("sort", input.sort);
  if (input.q) params.set("q", input.q);
  if (input.groupId) params.set("group", input.groupId);
  if (input.priority) params.set("priority", input.priority);
  if (input.permission) params.set("permission", input.permission);
  if (input.viewId) params.set("view", input.viewId);
  if (input.intent) params.set("intent", input.intent);
  if (input.importBatchId) params.set("importBatch", input.importBatchId);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return `/contacts${query ? `?${query}` : ""}`;
}

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { user, workspace } = await requireWorkspace();
  const displayPreferences = await displayPreferencesForUser(user.id);
  const savedViews = await prisma.contactSavedView.findMany({
    where: { userId: user.id, workspaceId: workspace.id },
    select: { id: true, name: true, isDefault: true, query: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }]
  });
  const selectedView = params.view
    ? savedViews.find((view) => view.id === params.view) ?? null
    : null;
  const q = (params.q ?? (selectedView ? savedViewValue(selectedView.query, "q") : "")).trim().slice(0, 160);
  const groupId = (params.group ?? (selectedView ? savedViewValue(selectedView.query, "group") : "")).trim();
  const requestedPriority = (params.priority ?? (selectedView ? savedViewValue(selectedView.query, "priority") : "")).trim().toUpperCase();
  const priority = ["LOW", "NORMAL", "HIGH", "URGENT"].includes(requestedPriority) ? requestedPriority : "";
  const requestedPermission = (params.permission ?? (selectedView ? savedViewValue(selectedView.query, "permission") : "")).trim().toLowerCase();
  const permission = ["contactable", "do-not-contact"].includes(requestedPermission) ? requestedPermission : "";
  const importBatchId = params.importBatch?.trim() ?? "";
  const requestedPage = Number(params.page ?? "1");
  const requestedSort = params.sort ?? (selectedView ? savedViewValue(selectedView.query, "sort") : "last-name");
  const sort = ["last-name", "updated", "newest"].includes(requestedSort) ? requestedSort : "name";
  let page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10_000) : 1;
  const intent = params.intent === "important-date" || params.intent === "one-time-jump" || params.intent === "log-note" ? params.intent : undefined;

  const importBatch = importBatchId
    ? await prisma.contactImportBatch.findFirst({ where: { id: importBatchId, workspaceId: workspace.id }, select: { id: true, results: true, status: true } })
    : null;
  const importedContactIds = importContactIds(importBatch?.results);
  const relationshipFilters: Prisma.ContactWhereInput[] = [];
  if (priority) {
    relationshipFilters.push(priority === "NORMAL"
      ? { OR: [{ relationshipState: { is: null } }, { relationshipState: { is: { priority: "NORMAL" } } }] }
      : { relationshipState: { is: { priority: priority as "LOW" | "NORMAL" | "HIGH" | "URGENT" } } });
  }
  if (permission) {
    relationshipFilters.push(permission === "do-not-contact"
      ? { relationshipState: { is: { doNotContact: true } } }
      : { OR: [{ relationshipState: { is: null } }, { relationshipState: { is: { doNotContact: false } } }] });
  }
  const selectedPeople = [...new Set((params.people ?? "").split(",").filter(id => id && id.length <= 120))].slice(0, 50);
  // A number typed with different punctuation than it was saved with still finds the person.
  const phoneFilters: Prisma.ContactWhereInput[] = phoneSearchDigits(q).map((digits) => ({ phones: { some: { normalized: { contains: digits } } } }));
  const contactWhere: Prisma.ContactWhereInput = {
    workspaceId: workspace.id,
    archivedAt: null,
    ...((relationshipFilters.length || selectedPeople.length) ? { AND: [...relationshipFilters, ...(selectedPeople.length ? [{ id: { in: selectedPeople } }] : [])] } : {}),
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
        ...phoneFilters,
        { customFieldValues: { some: { value: { contains: q, mode: "insensitive" } } } }
      ]
    } : {})
  };

  const totalCount = await prisma.contact.count({ where: contactWhere });
  page = Math.min(page, Math.max(1, Math.ceil(totalCount / PAGE_SIZE)));
  const [contacts, rawGroups, groupStates] = await Promise.all([
    prisma.contact.findMany({
      where: contactWhere,
      include: {
        journey: { include: { stage: true } },
        emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        groupMemberships: { include: { group: true } },
        customFieldValues: { include: { definition: true } },
        jumpDates: { where: { isActive: true }, include: { dateType: true }, orderBy: { dateValue: "asc" } },
        relationshipState: { select: { preferredChannel: true, priority: true, doNotContact: true } }
      },
      orderBy: sort === "last-name" ? [{ lastName: { sort: "asc", nulls: "last" } }, { displayName: "asc" }, { id: "asc" }] : sort === "updated" ? [{ updatedAt: "desc" }, { id: "asc" }] : sort === "newest" ? [{ createdAt: "desc" }, { id: "asc" }] : [{ displayName: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.group.findMany({
      where: { workspaceId: workspace.id },
      include: { _count: { select: { memberships: true, assignments: { where: { isActive: true } } } } },
      orderBy: { name: "asc" }
    }),
    prisma.contactGroupState.findMany({
      where: { workspaceId: workspace.id },
      select: { groupId: true, isActive: true }
    })
  ]);
  const groups = mergeGroupActivity(rawGroups, groupStates);
  const activeByGroupId = new Map(groups.map((group) => [group.id, group.isActive]));
  const summaries = await contactFollowUpSummary(workspace.id, contacts.map(contact => contact.id));

  const contactDtos: ContactBulkDto[] = contacts.map((contact) => {
    const summary = summaries.get(contact.id);
    const custom = new Map(contact.customFieldValues.map((item) => [item.definition.key, item.value]));
    return {
      id: contact.id,
      displayName: contact.displayName,
      stageName: contact.journey?.stage.name ?? null,
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
      lastInteraction: summary?.lastInteraction ? formatDateTime(summary.lastInteraction, displayPreferences) : null,
      nextJump: summary?.nextJump ? contactDueLabel(summary.nextJump, new Date(), displayPreferences) : null,
      nextJumpOverdue: Boolean(summary?.nextJump && summary.nextJump < new Date()),
      relationshipType: custom.get("relationship-type") ?? custom.get("relationship") ?? null,
      preferredChannel: contact.relationshipState?.preferredChannel ?? custom.get("preferred-channel") ?? null,
      priority: contact.relationshipState?.priority ?? custom.get("priority") ?? "NORMAL",
      doNotContact: contact.relationshipState?.doNotContact ?? false
    };
  });

  const retainedSelection = params.person && !contacts.some(contact => contact.id === params.person)
    ? await prisma.contact.findFirst({ where: { AND: [contactWhere, { id: params.person.slice(0, 120) }] }, select: { id: true } }) : null;
  const selectedContactId = contacts.find(contact => contact.id === params.person)?.id ?? retainedSelection?.id ?? contacts[0]?.id;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const resultStart = totalCount ? (page - 1) * PAGE_SIZE + 1 : 0;
  const resultEnd = Math.min(page * PAGE_SIZE, totalCount);
  const resultMessage = totalCount
    ? `${totalCount.toLocaleString()} Contact${totalCount === 1 ? "" : "s"} found. Showing ${resultStart.toLocaleString()} through ${resultEnd.toLocaleString()}.`
    : `No Contacts matched${q ? ` “${q}”` : " the current filters"}.`;

  return (
    <div className="page contacts-page">
      {params.stateUpdated && <Notice type="success">Journey stage updated.</Notice>}
      {params.created && <Notice type="success">Contact added.</Notice>}
      {params.archived && <Notice type="success"><span className="notice-with-action">Contact archived.{params.archivedContact && <form action={restoreContactAction}><input type="hidden" name="contactId" value={params.archivedContact} /><input type="hidden" name="returnTo" value="/contacts" /><FormSubmitButton label="Undo" pendingLabel="Restoring…" className="button small" icon={<AppIcon name="undo" />} /></form>}</span></Notice>}
      {params.restored && <Notice type="success">Contact restored.</Notice>}
      {params.groupCreated && <Notice type="success">Tag created.</Notice>}
      {params.groupDeleted && <Notice type="success">Tag removed.</Notice>}
      {params.groupsActiveSaved && <Notice type="success">Tags saved.</Notice>}
      {params.bulkAssigned && <Notice type="success">Tag added.</Notice>}
      {params.bulkRemoved && <Notice type="success">Tag removed.</Notice>}
      {params.bulkArchived && <Notice type="success">Contacts archived.</Notice>}
      {params.viewSaved && <Notice type="success">View saved.</Notice>}
      {params.defaultViewSaved && <Notice type="success">Default view saved.</Notice>}
      {params.viewDeleted && <Notice type="success">View deleted.</Notice>}
      {importBatchId && <Notice type={importBatch ? "info" : "error"}>{importBatch ? `Showing Contacts touched by the selected ${importBatch.status.toLowerCase()} import.` : "That import batch is unavailable in your personal data."}</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <p className="sr-only" role="status" aria-live="polite">{resultMessage}</p>
      <div className="contacts-workspace"><section className="contacts-directory" aria-label="Contact directory">
      <ContactsBulkWorkspace
        savedViews={<ContactSavedViewsBar
          views={savedViews.map(({ id, name, isDefault }) => ({ id, name, isDefault }))}
          selectedViewId={selectedView?.id ?? ""}
          filters={{ q, group: groupId, priority, permission, sort }}
        />}
        contacts={contactDtos}
        totalCount={totalCount}
        initialSelected={selectedPeople}
        selectedContactId={selectedContactId}
        groups={groups.map((group) => ({ id: group.id, name: group.name, description: group.description, color: group.color, contactCount: group._count.memberships, mixCount: group._count.assignments, isActive: group.isActive }))}
        sort={sort}
        query={q}
        groupFilter={groupId}
        priorityFilter={priority}
        permissionFilter={permission}
        intent={intent}
      />
      <nav className="pagination-bar" aria-label="Contact result pages">
        <span>{resultMessage}</span>
        <div className="page-actions">
          {page > 1 && <Link className="button" href={pageHref({ page: page - 1, q, groupId, priority, permission, viewId: selectedView?.id ?? "", intent, importBatchId, sort })}>Previous</Link>}
          <span>Page {Math.min(page, totalPages)} of {totalPages}</span>
          {page < totalPages && <Link className="button" href={pageHref({ page: page + 1, q, groupId, priority, permission, viewId: selectedView?.id ?? "", intent, importBatchId, sort })}>Next</Link>}
        </div>
      </nav>
      </section>{selectedContactId && <section className="contacts-selected" aria-label="Selected contact"><ContactProfile key={selectedContactId} contactId={selectedContactId} embedded /></section>}</div>
    </div>
  );
}
