import Link from "next/link";
import { journeyMixMembers } from "@/lib/journey-view";
import { notFound } from "next/navigation";
import { MixEditor } from "@/components/MixEditor";
import { MixLibraryNav } from "@/components/MixLibraryNav";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { formatDateInput, formatTimeInput } from "@/lib/mix-broadcast";
import { getPlatformStringList } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { timezoneForUser } from "@/lib/display-preferences";
import { plannedAtInput } from "@/lib/planned-step";
import { workflowEditorData } from "@/lib/mix-workflow";


export type MixWorkspaceSearchParams = { activate?: string; error?: string; created?: string; updated?: string; imported?: string };

export async function MixWorkspace({ mixId, query = {}, embedded = false }: { mixId: string; query?: MixWorkspaceSearchParams; embedded?: boolean }) {
  const { workspace, user } = await requireWorkspace();
  const workflow = await workflowEditorData(workspace.id);
  const [timezone, activationPreference] = await Promise.all([timezoneForUser(user.id), prisma.userPreference.findUnique({ where: { userId: user.id }, select: { reviewMixActivation: true } })]);
  const [mix, broadcastSchedule] = await Promise.all([
    prisma.mix.findFirst({
      where: { id: mixId, workspaceId: workspace.id, status: { not: "ARCHIVED" } },
      include: {
        steps: {
          where: { isActive: true },
          include: { stepVersion: { include: { stepTemplate: true, variants: true } } },
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
  const library = await prisma.mix.findMany({ where: { workspaceId: workspace.id, status: { not: "ARCHIVED" } }, select: { id: true, name: true, status: true, steps: { where: { isActive: true }, select: { dayOffset: true, anchor: true }, orderBy: { sortOrder: "asc" } } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 100 });

  const [members, memberCount, stages] = await Promise.all([
    prisma.contact.findMany({ where: { AND: [{ workspaceId: workspace.id, archivedAt: null }, journeyMixMembers(workspace.id, mix.id)] }, orderBy: [{ displayName: "asc" }, { id: "asc" }], take: 20, select: { id: true, displayName: true, jumps: { where: { workspaceId: workspace.id, mixId: mix.id, status: "PENDING" }, orderBy: { scheduledAt: "asc" }, take: 1, select: { reason: true } } } }),
    prisma.contact.count({ where: { AND: [{ workspaceId: workspace.id, archivedAt: null }, journeyMixMembers(workspace.id, mix.id)] } }),
    prisma.journeyStage.findMany({ where: { workspaceId: workspace.id, planId: mix.id, isActive: true }, select: { id: true, name: true }, orderBy: { position: "asc" } })
  ]);
  return (
    <div className={embedded ? "mix-inline-workspace" : "page mix-edit-page"}>
      <header className="page-header"><div>{embedded ? <h2>{mix.name}</h2> : <h1>Edit {mix.name}</h1>}<p>Saving updates future follow-ups without rewriting completed history.</p></div></header>
      {query.created === "manual" && <Notice type="success">Mix created. Future follow-ups are updating.</Notice>}
      {query.updated && <Notice type="success">Mix updated. Future follow-ups are updating.</Notice>}
      {query.imported && <Notice type="success">Your remix is ready. Fine-tune the beats and tempo, then start it when you’re ready.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      <div className={embedded ? "mix-edit-columns" : "mix-library-workspace"}>{!embedded && <MixLibraryNav mixes={library} selected={mix.id} />}<div className="mix-editor-workspace"><MixEditor reviewBeforeActivation={activationPreference?.reviewMixActivation ?? true}
        workflowSources={workflow.mixes.filter(item => item.status !== "ARCHIVED" && item.source !== "ONE_TIME").map(({ id, name }) => ({ id, name }))}
        workflowRevision={workflow.revision}
        completionSourceId={workflow.configuration.rules.find(rule => rule.id === `mix-start:${mix.id}`)?.source.mixId}
        dateTypes={dateTypes.map((item) => ({ id: item.id, name: item.name, isSystem: item.isSystem }))}
        groups={groups.map((item) => ({ id: item.id, name: item.name, color: item.color, isActive: item.isActive, contactCount: item._count.memberships }))}
        jumps={jumps.flatMap((item) => item.versions[0] ? [{ id: item.id, name: item.name, channel: item.channel, subject: item.versions[0].subject, body: item.versions[0].body, script: item.versions[0].script }] : [])}
        categories={categories}
        industries={industries}
        workspaceTimezone={timezone}
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
          status: query.activate === "1" ? "ACTIVE" : mix.status === "ARCHIVED" ? "DRAFT" : mix.status,
          groupIds,
          assignAllContacts,
          broadcastDate: formatDateInput(broadcastSchedule?.localDate),
          broadcastTime: formatTimeInput(broadcastSchedule?.timeMinutes),
          broadcastTimezone: broadcastSchedule?.timezone ?? timezone,
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
            sendTimeMinutes: step.sendTimeMinutes,
            plannedAt: step.plannedAt ? plannedAtInput(step.plannedAt, timezone) : null,
            anchor: step.anchor,
            offsetMinutes: step.offsetMinutes,
            variants: step.stepVersion.variants.map((variant) => ({ family: variant.family, subject: variant.subject, body: variant.body, script: variant.script }))
          }))
        }}
      /></div><aside className="mix-people-context" aria-label="People and journey usage"><h3>In this mix</h3><p>{memberCount} {memberCount === 1 ? "person" : "people"}</p>{members.length ? <ul>{members.map(person => <li key={person.id}><Link href={`/contacts/${person.id}`}><strong>{person.displayName}</strong><small>{person.jumps[0]?.reason ?? "No pending beat"}</small></Link></li>)}</ul> : <p>No one is in this mix yet.</p>}<Link className="button small" href={`/journey?mix=${mix.id}`}>View people / start for someone</Link><h3>Used in Journey</h3>{stages.length ? stages.map(stage => <p key={stage.id}><Link href={`/journey?stage=${stage.id}`}>{stage.name}</Link></p>) : <p>Independent touchpoint</p>}</aside></div>
    </div>
  );
}
