import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MixEditor } from "@/components/MixEditor";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Edit Mix" };

export default async function EditMixPage({
  params,
  searchParams
}: {
  params: Promise<{ mixId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ mixId }, query, { workspace }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const mix = await prisma.mix.findFirst({
    where: { id: mixId, workspaceId: workspace.id, status: { not: "ARCHIVED" } },
    include: {
      steps: {
        where: { isActive: true },
        include: { stepVersion: { include: { stepTemplate: true } } },
        orderBy: { sortOrder: "asc" }
      },
      assignments: { where: { isActive: true, mode: "DYNAMIC" } }
    }
  });
  if (!mix) notFound();

  const selectedTemplateIds = mix.steps.map((step) => step.stepVersion.stepTemplateId);
  const [dateTypes, groups, jumps] = await Promise.all([
    prisma.dateType.findMany({ where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null }] }, orderBy: [{ isSystem: "asc" }, { name: "asc" }] }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    prisma.stepTemplate.findMany({ where: { workspaceId: workspace.id, OR: [{ isActive: true }, { id: { in: selectedTemplateIds } }] }, orderBy: [{ channel: "asc" }, { name: "asc" }] })
  ]);
  const groupIds = mix.assignments.flatMap((assignment) => assignment.groupId ? [assignment.groupId] : []);
  const assignAllContacts = mix.assignments.some((assignment) => assignment.contactId && assignment.assignmentKey.includes(":audience:"));

  return (
    <div className="page">
      <header className="page-header"><div><h1>Edit {mix.name}</h1><p>Saving reconciles future pending Jumps without rewriting completed history.</p></div></header>
      {query.error && <Notice type="error">{query.error}</Notice>}
      <MixEditor
        dateTypes={dateTypes.map((item) => ({ id: item.id, name: item.name, isSystem: item.isSystem }))}
        groups={groups.map((item) => ({ id: item.id, name: item.name, color: item.color }))}
        jumps={jumps.map((item) => ({ id: item.id, name: item.name, channel: item.channel }))}
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
