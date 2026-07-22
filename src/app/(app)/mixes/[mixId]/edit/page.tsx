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

type SearchParams = { error?: string; created?: string; saved?: string };

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
  const [dateTypes, rawGroups, groupStates, jumps, categories, industries] = await Promise.all([
    prisma.dateType.findMany({ where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] }, orderBy: [{ isSystem: "asc" }, { name: "asc" }] }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.stepTemplate.findMany({ where: { workspaceId: workspace.id, OR: [{ isActive: true }, { id: { in: selectedTemplateIds } }] }, orderBy: [{ channel: "asc" }, { name: "asc" }] }),
    getPlatformStringList("mix.categories"),
    getPlatformStringList("mix.industries")
  ]);
  const groups = mergeGroupActivity(rawGroups, groupStates);
  const groupIds = mix.assignments.flatMap((assignment) => assignment.groupId ? [assignment.groupId] : []);
  const assignAllContacts = mix.assignments.some((assignment) => assignment.contactId && assignment.assignmentKey.includes(":audience:"));

  return (
    <div className="page">
      <header className="page-header"><div><h1>Edit {mix.name}</h1><p>Saving reconciles future pending Jumps without rewriting completed history.</p></div></header>
      {query.created === "wizard" && <Notice type="success">Your AI-assisted Mix Draft is now a normal editable Mix. Review the trigger, audience, schedule, and every Jump before activation.</Notice>}
      {query.saved && <Notice type="success">Mix saved. Future incomplete Jumps are being reconciled while completed history remains unchanged.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      <MixEditor
        dateTypes={dateTypes.map((item) => ({ id: item.id, name: item.name, isSystem: item.isSystem }))}
        groups={groups.map((item) => ({ id: item.id, name: item.name, color: item.color, isActive: item.isActive }))}
        jumps={jumps.map((item) => ({ id: item.id, name: item.name, channel: item.channel }))}
        categories={categories}
        industries={industries}
        workspaceTimezone={workspace.profile?.timezone ?? "UTC"}
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
            dayOffset: step.dayOffset,
            sendTimeMinutes: step.sendTimeMinutes
          }))
        }}
      />
    </div>
  );
}
