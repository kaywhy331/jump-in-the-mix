import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MixEditor } from "@/components/MixEditor";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { getPlatformStringList } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { timezoneForUser } from "@/lib/display-preferences";
import { workflowEditorData } from "@/lib/mix-workflow";

export const metadata: Metadata = { title: "Create a mix" };

export default async function NewMixPage({ searchParams }: { searchParams: Promise<{ error?: string; custom?: string }> }) {
  const [query, { workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
  const [timezone, activationPreference] = await Promise.all([timezoneForUser(user.id), prisma.userPreference.findUnique({ where: { userId: user.id }, select: { reviewMixActivation: true } })]);
  if (query.custom !== "1" && !query.error) redirect("/templates");
  const [dateTypes, rawGroups, groupStates, jumps, categories, industries, activeContactCount, missingEmailCount, missingPhoneCount] = await Promise.all([
    prisma.dateType.findMany({ where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] }, orderBy: [{ isSystem: "asc" }, { name: "asc" }] }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, include: { _count: { select: { memberships: true } } }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.stepTemplate.findMany({ where: { workspaceId: workspace.id, isActive: true }, include: { versions: { orderBy: { version: "desc" }, take: 1 } }, orderBy: [{ channel: "asc" }, { name: "asc" }] }),
    getPlatformStringList("mix.categories"),
    getPlatformStringList("mix.industries"),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } }),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null, emails: { none: {} } } }),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null, phones: { none: {} } } })
  ]);
  const groups = mergeGroupActivity(rawGroups, groupStates);
  const workflow = await workflowEditorData(workspace.id);

  return (
    <div className="page">
      <header className="page-header"><div><h1>Create a mix</h1><p>Every relationship starts with a first beat. Add messages and reminders, then set the tempo.</p></div></header>
      {query.error && <Notice type="error">{query.error}</Notice>}
      <MixEditor reviewBeforeActivation={activationPreference?.reviewMixActivation ?? true}
        workflowSources={workflow.mixes.filter(item => item.status !== "ARCHIVED" && item.source !== "ONE_TIME").map(({ id, name }) => ({ id, name }))}
        workflowRevision={workflow.revision}
        dateTypes={dateTypes.map((item) => ({ id: item.id, name: item.name, isSystem: item.isSystem }))}
        groups={groups.map((item) => ({ id: item.id, name: item.name, color: item.color, isActive: item.isActive, contactCount: item._count.memberships }))}
        jumps={jumps.flatMap((item) => item.versions[0] ? [{ id: item.id, name: item.name, channel: item.channel, subject: item.versions[0].subject, body: item.versions[0].body, script: item.versions[0].script }] : [])}
        categories={categories}
        industries={industries}
        workspaceTimezone={timezone}
        activeContactCount={activeContactCount}
        missingEmailCount={missingEmailCount}
        missingPhoneCount={missingPhoneCount}
      />
    </div>
  );
}
