import type { Metadata } from "next";
import { MixEditor } from "@/components/MixEditor";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { getPlatformStringList } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Create Mix" };

export default async function NewMixPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [query, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const [dateTypes, rawGroups, groupStates, jumps, categories, industries] = await Promise.all([
    prisma.dateType.findMany({ where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] }, orderBy: [{ isSystem: "asc" }, { name: "asc" }] }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.stepTemplate.findMany({ where: { workspaceId: workspace.id, isActive: true }, orderBy: [{ channel: "asc" }, { name: "asc" }] }),
    getPlatformStringList("mix.categories"),
    getPlatformStringList("mix.industries")
  ]);
  const groups = mergeGroupActivity(rawGroups, groupStates);

  return (
    <div className="page">
      <header className="page-header"><div><h1>Create a Mix</h1><p>Build a follow-up plan from reusable Action Templates.</p></div></header>
      {query.error && <Notice type="error">{query.error}</Notice>}
      <MixEditor
        dateTypes={dateTypes.map((item) => ({ id: item.id, name: item.name, isSystem: item.isSystem }))}
        groups={groups.map((item) => ({ id: item.id, name: item.name, color: item.color, isActive: item.isActive }))}
        jumps={jumps.map((item) => ({ id: item.id, name: item.name, channel: item.channel }))}
        categories={categories}
        industries={industries}
        workspaceTimezone={workspace.profile?.timezone ?? "UTC"}
      />
    </div>
  );
}
