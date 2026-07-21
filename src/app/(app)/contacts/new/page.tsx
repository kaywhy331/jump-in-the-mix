import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { splitContactName } from "@/lib/quick-add-capture";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Add contact" };

type SearchParams = {
  error?: string;
  quickAddFallback?: string;
  capture?: string;
  name?: string;
  followUpDate?: string;
  reason?: string;
};

function safeDate(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export default async function NewContactPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const [rawGroups, groupStates, customFields, followUpType] = await Promise.all([
    prisma.group.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.contactCustomFieldDefinition.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] }),
    prisma.dateType.findFirst({ where: { scopeKey: "system", slug: "follow-up", isActive: true } })
  ]);
  const matchingMixes = followUpType
    ? await prisma.mix.findMany({
        where: {
          workspaceId: workspace.id,
          status: "ACTIVE",
          triggerMode: "DATE_TRIGGERED",
          dateTypeId: followUpType.id,
          source: { not: "ONE_TIME" }
        },
        select: { id: true, name: true },
        orderBy: [{ source: "asc" }, { createdAt: "asc" }]
      })
    : [];
  const groups = mergeGroupActivity(rawGroups, groupStates);
  const capture = query.capture?.slice(0, 2000);
  const name = splitContactName(query.name?.slice(0, 240));
  const contact = capture || name.firstName || name.lastName
    ? { firstName: name.firstName, lastName: name.lastName, publicNotes: capture }
    : undefined;

  return (
    <div className="page">
      <header className="page-header"><div><h1>Add a contact</h1><p>Add the essentials now, then schedule the first follow-up without returning to the Contacts list.</p></div></header>
      {query.error && <Notice type="error">{query.error}</Notice>}
      {query.quickAddFallback && <Notice type="info">Your browser does not expose the native Contact Picker. Use this compact form instead; supported browsers also offer optional voice dictation for Public Notes.</Notice>}
      {capture && <Notice type="info">We carried over the person, timing, reason, and note that Quick Add recognized. Review the details before saving.</Notice>}
      <ContactForm
        mode="create"
        contact={contact}
        groups={groups.map((group) => ({ id: group.id, name: group.name, color: group.color, isActive: group.isActive }))}
        customFields={customFields.map((field) => ({ id: field.id, name: field.name, key: field.key }))}
        followUp={followUpType ? {
          dateTypeId: followUpType.id,
          dateTypeName: followUpType.name,
          mixes: matchingMixes,
          defaultDate: safeDate(query.followUpDate),
          defaultReason: query.reason?.slice(0, 240) || "Follow up"
        } : null}
      />
    </div>
  );
}
