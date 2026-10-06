import Link from "next/link";
import { journeyMixMembers } from "@/lib/journey-view";
import { notFound } from "next/navigation";
import { MixEditor } from "@/components/MixEditor";
import { MixBeatPreview } from "@/components/MixBeatPreview";
import { AppIcon } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { activateMixAction, pauseMixAction, archiveMixAction } from "@/lib/mix-lifecycle-actions";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { formatDateInput, formatTimeInput } from "@/lib/mix-broadcast";
import { getPlatformStringList } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { timezoneForUser } from "@/lib/display-preferences";
import { plannedAtInput } from "@/lib/planned-step";
import { workflowEditorData } from "@/lib/mix-workflow";
import { MarketplaceNotices, MarketplaceShare } from "@/components/MarketplaceShare";
import { archiveShareEffect } from "@/lib/marketplace-service";


export type MixWorkspaceSearchParams = { view?: string; activate?: string; error?: string; at?: string; sig?: string; created?: string; updated?: string; imported?: string };

export async function MixWorkspace({ mixId, query = {}, libraryHref }: { mixId: string; query?: MixWorkspaceSearchParams; embedded?: boolean; libraryHref?: string }) {
  const { session, workspace, user, impersonation } = await requireWorkspace();
  const workflow = await workflowEditorData(workspace.id);
  const [timezone, activationPreference] = await Promise.all([timezoneForUser(user.id), prisma.userPreference.findUnique({ where: { userId: user.id }, select: { reviewMixActivation: true, locale: true } })]);
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
  const assignAllContacts = mix.audienceEveryone;


  const [members, memberCount, stages, shareEffect] = await Promise.all([
    prisma.contact.findMany({ where: { AND: [{ workspaceId: workspace.id, archivedAt: null }, journeyMixMembers(workspace.id, mix.id)] }, orderBy: [{ displayName: "asc" }, { id: "asc" }], take: 20, select: { id: true, displayName: true, jumps: { where: { workspaceId: workspace.id, mixId: mix.id, status: "PENDING" }, orderBy: { scheduledAt: "asc" }, take: 1, select: { reason: true } } } }),
    prisma.contact.count({ where: { AND: [{ workspaceId: workspace.id, archivedAt: null }, journeyMixMembers(workspace.id, mix.id)] } }),
    prisma.journeyStage.findMany({ where: { workspaceId: workspace.id, planId: mix.id, isActive: true }, select: { id: true, name: true }, orderBy: { position: "asc" } }),
    impersonation ? null : archiveShareEffect(workspace.id, mix.id)
  ]);
  // Archiving stops sharing what would have nothing to show, so the confirmation says what leaves the Marketplace.
  const archiveCopy = `This Mix stops creating new follow-ups. Completed history stays available.${shareEffect?.mix ? " It also stops being shared on the Marketplace; copies people already added stay theirs." : ""}${shareEffect?.megaMix ? ` Your shared Mega-Mix “${shareEffect.megaMix}” stops being shared too, because none of its other Mixes can be shared.` : ""}`;
  const editing = query.view === "edit" || query.activate === "1" || Boolean(query.error);
  const baseHref = libraryHref ?? `/mixes?mix=${encodeURIComponent(mix.id)}`;
  const related = workflow.configuration.rules.filter(rule => rule.source.mixId === mix.id || rule.routes.some(route => route.target?.mixId === mix.id) || rule.join?.target.mixId === mix.id);
  return <div className="mix-edit-columns">
    <section id="selected-mix" className="mix-editor-workspace" aria-label="Selected Mix">
      <header className="mix-selected-header"><div><h2>{mix.name}</h2><span className="status-pill">{mix.status.toLowerCase()}</span></div>
        <nav className="mix-view-tabs" aria-label="Mix view">{!impersonation && mix.source !== "ONE_TIME" && <MarketplaceShare kind="MIX" targetId={mix.id} targetName={mix.name} workspaceId={workspace.id} canEdit={workspace.ownerId === user.id} />}<Link className="button small" href={baseHref} aria-current={!editing ? "page" : undefined}><AppIcon name="eye" />Preview</Link>{!impersonation && <Link className="button small" href={`${baseHref}&view=edit`} aria-current={editing ? "page" : undefined}><AppIcon name="edit" />Edit</Link>}{!impersonation && mix.status === "ACTIVE" && mix.source !== "ONE_TIME" && <Link className="button small primary mix-start-action" href={`/journey?mix=${encodeURIComponent(mix.id)}&start=1`} aria-label={`Start ${mix.name} for someone`}><AppIcon name="play" />Start</Link>}</nav>
      </header>
      <MarketplaceNotices workspaceId={workspace.id} mixId={mix.id} reports={false} />
      {query.created === "manual" && <Notice type="success">Mix created.</Notice>}
      {query.updated && <Notice type="success">Mix saved.</Notice>}
      {query.imported && <Notice type="success">Your copy is ready to edit.</Notice>}
      <UrlErrorNotice params={query} viewer={session} />
      {!editing && mix.description && <p className="mix-selected-description">{mix.description}</p>}
      {editing && !impersonation ? <MixEditor reviewBeforeActivation={activationPreference?.reviewMixActivation ?? true}
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
          updatedAt: mix.updatedAt.toISOString(),
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
      /> : <MixBeatPreview steps={mix.steps} gatedStepIds={workflow.configuration.gatedStepIds} timezone={timezone} locale={activationPreference?.locale ?? "en-US"} />}
    </section>
    <aside className="mix-context-pane" aria-label="People and Journey connections">
      <section><h3><AppIcon name="clock" />Starts</h3><p>{mix.triggerMode === "MANUAL_START" ? "When you start it or a connected path arrives." : mix.triggerMode === "BROADCAST" ? "On a scheduled date." : "When its date is added."}</p>{broadcastSchedule && <p>{formatDateInput(broadcastSchedule.localDate)} · {formatTimeInput(broadcastSchedule.timeMinutes)} {broadcastSchedule.timezone}</p>}</section>
      <section><h3><AppIcon name="people" />People</h3><strong className="mix-context-count">{memberCount}</strong>{members.length ? <ul>{members.slice(0, 5).map(person => <li key={person.id}><Link href={`/contacts/${person.id}`}><strong>{person.displayName}</strong><small>{person.jumps[0]?.reason ?? "No pending Beat"}</small></Link></li>)}</ul> : <p>No one in this Mix yet.</p>}<Link className="button small" href={`/journey?mix=${mix.id}${memberCount ? "" : "&start=1"}`}><AppIcon name="people" />{memberCount ? "View people" : "Start for someone"}</Link></section>
      <section><h3><AppIcon name="journey" />Connections</h3>{related.length ? <ul>{related.map(rule => <li key={rule.id}><Link href={`/journey?mix=${mix.id}${memberCount ? "" : "&start=1"}`}><strong>{rule.name}</strong><small>{rule.source.mixId === mix.id ? "Continues from here" : "Connects into this Mix"}{!rule.enabled ? " · off" : ""}</small></Link></li>)}</ul> : <p>No connected paths yet.</p>}<Link className="button small" href={`/journey?mix=${mix.id}${memberCount ? "" : "&start=1"}`}><AppIcon name="journey" />Open Journey</Link>{stages.length > 0 && <details><summary>Contact stages</summary>{stages.map(stage => <p key={stage.id}>{stage.name}</p>)}</details>}</section>
      {!impersonation && <details className="mix-manage"><summary><AppIcon name="settings" />Manage Mix</summary><div>{mix.source !== "ONE_TIME" && mix.triggerMode !== "BROADCAST" && mix.steps.length > 0 && <a className="button small" href={`/api/mixes/${encodeURIComponent(mix.id)}/export`} download><AppIcon name="export" />Export file</a>}{mix.status === "ACTIVE" ? <form action={pauseMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="button small" type="submit"><AppIcon name="pause" />Pause Mix</button></form> : activationPreference?.reviewMixActivation !== false ? <Link className="button small" href={`${baseHref}&view=edit&activate=1`}><AppIcon name="play" />Review and start</Link> : <form action={activateMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="button small" type="submit"><AppIcon name="play" />Start Mix</button></form>}<ConfirmDialog trigger={<><AppIcon name="archive" />Archive Mix</>} title={`Archive ${mix.name}?`} description={archiveCopy} danger><form action={archiveMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="button danger" type="submit">Archive Mix</button></form></ConfirmDialog></div></details>}
    </aside>
  </div>;
}
