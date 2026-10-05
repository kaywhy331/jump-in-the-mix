import { workflowContinuation } from "@/lib/workflow-continuation";
import type { Metadata } from "next";
import { DeviceContactQuickAdd } from "@/components/DeviceContactQuickAdd";
import { NewContactForm } from "@/components/NewContactForm";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { prisma } from "@/lib/prisma";
import { BackLink } from "@/components/BackLink";

export const metadata: Metadata = { title: "Add contact" };

type SearchParams = {
  error?: string;
  at?: string;
  sig?: string;
  returnTo?: string;
  quickAddFallback?: string;
  draft?: string;
};

export default async function NewContactPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { session, workspace }] = await Promise.all([searchParams, requireWorkspace()]);
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
  // Started from a Mix on the Journey: Back returns there, like Cancel and Save do.
  const continuation = workflowContinuation(query.returnTo);

  return (
    <div className="page page--form">
      <BackLink href={continuation ?? "/contacts"} label={continuation ? "Journey" : "Contacts"} /><header className="page-header"><div><h1>Add a contact</h1><p>Add the essentials now, then schedule the first follow-up without returning to the Contacts list.</p></div></header>
      <UrlErrorNotice params={query} viewer={session} />
      {query.quickAddFallback && <Notice type="info">Your browser does not expose the native Contact Picker. Use this compact form instead; supported browsers also offer optional voice dictation for Public Notes.</Notice>}
      {continuation && <Notice type="info">Save this person to return to your selected Mix. You will choose when to start it.</Notice>}
      {!continuation && !query.quickAddFallback && <DeviceContactQuickAdd placement="new-contact" />}
      <NewContactForm
        returnTo={continuation}
        draftId={query.draft?.slice(0, 100)}
        groups={groups.map((group) => ({ id: group.id, name: group.name, color: group.color, isActive: group.isActive }))}
        customFields={customFields.map((field) => ({ id: field.id, name: field.name, key: field.key }))}
        followUp={followUpType ? {
          dateTypeId: followUpType.id,
          dateTypeName: followUpType.name,
          mixes: matchingMixes,
        } : null}
      />
    </div>
  );
}
