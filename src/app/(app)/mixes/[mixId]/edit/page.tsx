import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MixEditor } from "@/components/MixEditor";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { formatDateInput, formatTimeInput } from "@/lib/mix-broadcast";
import { getPlatformStringList } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Edit Mix" };

type SearchParams = { error?: string; created?: string; updated?: string; imported?: string };

export default async function EditMixPage({
  params,
  searchParams
}: {
  params: Promise<{ mixId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ mixId }, query, { workspace }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const [mix, broadcastSchedule] = await Promise.all([
    prisma.mix.findFirst({
      where: { id: mixId, workspaceId: workspace.id, status: { not: "ARCHIVED" } },
      include: {
        steps: {
          where: { isActive: true },
          include: { stepVersion: { include: { stepTemplate: true } } },
          orderBy: { sortOrder: "asc" }
        },
        assignments: { where: { isActive: true, mode: "DYNAMIC" } }
      }
    }),
    prisma.mixBroadcastSchedule.findFirst({ where: { workspaceId: workspace.id, mixId } })
  ]);
  if (!mix) notFound();

  const selectedTemplateIds = mix.steps.map((step) => step.stepVersion.stepTemplateId);
  const [dateTypes, rawGroups, groupStates, jumps, categories, industries, activeContactCount, missingEmailCount, missingPhoneCount] = await Promise.all([
    prisma.dateType.findMany({ where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] }, orderBy: [{ isSystem: "asc" }, { name: "asc" }] }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, include: { _count: { select: { memberships: true } } }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.stepTemplate.findMany({ where: { workspaceId: workspace.id, OR: [{ isActive: true }, { id: { in: selectedTemplateIds } }] }, include: { versions: { orderBy: { version: "desc" }, take: 1 } }, orderBy: [{ channel: "asc" }, { name: "asc" }] }),
    getPlatformStringList("mix.categories"),
    getPlatformStringList("mix.industries"),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } }),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null, emails: { none: {} } } }),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null, phones: { none: {} } } })
  ]);
  const groups = mergeGroupActivity(rawGroups, groupStates);
  const groupIds = mix.assignments.flatMap((assignment) => assignment.groupId ? [assignment.groupId] : []);
  const assignAllContacts = mix.assignments.some((assignment) => assignment.contactId && assignment.assignmentKey.includes(":audience:"));

  return (
    <div className="page">
      <header className="page-header"><div><h1>Edit {mix.name}</h1><p>Saving reconciles future pending Jumps without rewriting completed history.</p></div></header>
      {query.created === "wizard" && <Notice type="success">The AI review created this Mix. Continue editing or review activation below.</Notice>}
      {query.created === "manual" && <Notice type="success">Mix created. Future work is being reconciled.</Notice>}
      {query.updated && <Notice type="success">Mix updated. Future pending work is being reconciled.</Notice>}
      {query.imported && <Notice type="success">Template setup completed. Review the result or activate it when ready.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      <MixEditor
        dateTypes={dateTypes.map((item) => ({ id: item.id, name: item.name, isSystem: item.isSystem }))}
        groups={groups.map((item) => ({ id: item.id, name: item.name, color: item.color, isActive: item.isActive, contactCount: item._count.memberships }))}
        jumps={jumps.flatMap((item) => item.versions[0] ? [{ id: item.id, name: item.name, channel: item.channel, subject: item.versions[0].subject, body: item.versions[0].body, script: item.versions[0].script }] : [])}
        categories={categories}
        industries={industries}
        workspaceTimezone={workspace.profile?.timezone ?? "UTC"}
        activeContactCount={activeContactCount}
        missingEmailCount={missingEmailCount}
        missingPhoneCount={missingPhoneCount}
        mix={{
          id: mix.id,
          name: mix.name,
          description: mix.description,
          framework: mix.framework,
          category: mix.category,
          industry: mix.industry,
          triggerMode: mix.triggerMode,
          dateTypeId: mix.dateTypeId,
          status: mix.status === "ARCHIVED" ? "DRAFT" : mix.status,
          groupIds,
          assignAllContacts,
          broadcastDate: formatDateInput(broadcastSchedule?.localDate),
          broadcastTime: formatTimeInput(broadcastSchedule?.timeMinutes),
          broadcastTimezone: broadcastSchedule?.timezone ?? workspace.profile?.timezone ?? "UTC",
          steps: mix.steps.map((step) => ({
            id: step.id,
            stepTemplateId: step.stepVersion.stepTemplateId,
            templateActive: step.stepVersion.stepTemplate.isActive,
            name: step.stepVersion.stepTemplate.name,
            channel: step.stepVersion.stepTemplate.channel,
            subject: step.stepVersion.subject,
            body: step.stepVersion.body,
            script: step.stepVersion.script,
            dayOffset: step.dayOffset,
            sendTimeMinutes: step.sendTimeMinutes
          }))
        }}
      />
    </div>
  );
}
