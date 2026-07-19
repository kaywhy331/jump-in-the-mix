import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Notice } from "@/components/Notice";
import { createStarterMixAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { formatDateInput, formatTimeInput } from "@/lib/mix-broadcast";
import { activateMixAction, archiveMixAction, pauseMixAction } from "@/lib/mix-lifecycle-actions";
import { formatPlanLimit, PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Mixes" };

type SearchParams = {
  created?: string;
  updated?: string;
  activated?: string;
  paused?: string;
  archived?: string;
  starter?: string;
  error?: string;
  q?: string;
  status?: string;
};

function channelIcon(channel: string): AppIconName {
  if (channel === "EMAIL") return "email";
  if (channel === "PHONE_CALL" || channel === "VOICEMAIL") return "phone";
  return "message";
}

export default async function MixesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();
  const q = params.q?.trim() ?? "";
  const status = ["ACTIVE", "PAUSED", "DRAFT"].includes(params.status ?? "") ? params.status : "";
  const [mixes, broadcastSchedules] = await Promise.all([
    prisma.mix.findMany({
      where: { workspaceId: workspace.id, status: status ? status as "ACTIVE" | "PAUSED" | "DRAFT" : { not: "ARCHIVED" }, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
      include: {
        steps: { where: { isActive: true }, include: { stepVersion: { include: { stepTemplate: true } } }, orderBy: { sortOrder: "asc" } },
        dateType: true,
        _count: { select: { assignments: true, jumps: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.mixBroadcastSchedule.findMany({ where: { workspaceId: workspace.id } })
  ]);
  const mixIds = mixes.map((mix) => mix.id);
  const sharingRows = mixIds.length
    ? await prisma.sharedMixMetadata.findMany({
        where: { publisherWorkspaceId: workspace.id, publisherMixId: { in: mixIds } }
      })
    : [];
  const sharingByMixId = new Map(sharingRows.map((item) => [item.publisherMixId, item]));
  const broadcastByMixId = new Map(broadcastSchedules.map((schedule) => [schedule.mixId, schedule]));
  const limits = PLAN_LIMITS[workspace.planTier];
  const canUseWizard = limits.aiWizard;
  const activeCount = mixes.filter((mix) => mix.status === "ACTIVE").length;

  return (
    <div className="page">
      {params.created === "starter" && <Notice type="success">Starter Mix created. Assign it to a Contact with a matching Important Date.</Notice>}
      {params.created === "wizard" && <Notice type="success">Your AI-assisted Mix draft is ready. Review the sequence, then activate it.</Notice>}
      {params.created === "manual" && <Notice type="success">Mix created. Future pending Jumps are being reconciled automatically.</Notice>}
      {params.updated === "manual" && <Notice type="success">Mix updated. Removed or rescheduled future work is being reconciled.</Notice>}
      {params.activated && <Notice type="success">Mix activated. Matching future Jumps are being reconciled automatically.</Notice>}
      {params.paused && <Notice type="success">Mix paused. Future pending Jumps from this Mix were removed from the action queue.</Notice>}
      {params.archived && <Notice type="success">Mix archived. Incomplete Jumps were removed while completed history remains available.</Notice>}
      {params.starter === "exists" && <Notice type="info">Your simple starter Mix is already available below.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div><h1>Mixes</h1><p>Mixes are follow-up plans: a timed sequence of actions for the people and moments that matter.</p></div>
        <div className="page-actions">
          <details className="mix-create-menu"><summary className="button primary">New Mix</summary><div className="mix-create-menu-panel"><Link href="/templates"><strong>Start from template</strong><small>Use a reviewed plan</small></Link><Link href="/mixes/new"><strong>Build manually</strong><small>Control every action</small></Link>{canUseWizard && <Link href="/mixes/wizard"><strong>Create with AI</strong><small>Generate a reviewable draft</small></Link>}<form action={createStarterMixAction}><button className="text-button" type="submit"><strong>Simple starter</strong><small>Create a warm three-step plan</small></button></form></div></details>
        </div>
      </header>
      <form className="filter-bar mix-filter-bar" action="/mixes" method="get"><input name="q" defaultValue={q} placeholder="Search Mixes" aria-label="Search Mixes"/><select name="status" defaultValue={status} aria-label="Filter Mixes by status"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="DRAFT">Draft</option></select><button className="button" type="submit">Filter</button>{(q || status) && <Link className="button" href="/mixes">Clear</Link>}</form>
      <div className="usage-line"><span>Active Mixes</span><strong>{activeCount}/{formatPlanLimit(limits.mixes)}</strong></div>
      {!canUseWizard && <Notice type="info">Free includes up to three active Mixes. AI generation is available on Plus and Pro.</Notice>}

      {mixes.length ? (
        <div className="mix-list">
          {mixes.map((mix) => {
            const broadcast = broadcastByMixId.get(mix.id);
            const sharing = sharingByMixId.get(mix.id);
            const lastDay = Math.max(0, ...mix.steps.map((step) => step.dayOffset));
            const channelSequence = [...new Set(mix.steps.map((step) => step.stepVersion.stepTemplate.channel.replaceAll("_", " ").toLowerCase()))];
            return (
              <article className="mix-row mix-card" key={mix.id}>
                <div className="card-header">
                  <div>
                    <h3>{mix.name}</h3>
                    <div className="mix-meta">
                      <span className={`status-pill ${mix.status === "ACTIVE" ? "done" : ""}`}>{mix.status.toLowerCase()}</span>
                      <span>Starts when: {mix.dateType ? `${mix.dateType.name} occurs` : mix.triggerMode === "MANUAL_START" ? "you start it" : "a broadcast is scheduled"}</span>
                      {broadcast && <span>Broadcast: {formatDateInput(broadcast.localDate)} · {formatTimeInput(broadcast.timeMinutes)} {broadcast.timezone}</span>}
                      <span>Audience: {mix._count.assignments} Contact{mix._count.assignments === 1 ? "" : "s"}</span>
                      <span>Timing: {mix.steps.length} action{mix.steps.length === 1 ? "" : "s"} over {lastDay + 1} day{lastDay ? "s" : ""}</span>
                      <span>Channels: {channelSequence.join(" → ") || "None yet"}</span>
                    </div>
                  </div>
                  <div className="mix-card-actions">
                    <Link href={`/mixes/${mix.id}/edit`} className="button small primary">Edit</Link>
                    <details className="mix-row-menu"><summary className="button small" aria-label={`More actions for ${mix.name}`}>More</summary><div className="mix-row-menu-panel"><Link href={`/mixes/${mix.id}/share`}>{sharing ? "Manage sharing" : "Share Mix"}</Link>{mix.status === "ACTIVE" ? <form action={pauseMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="text-button" type="submit">Pause Mix</button></form> : <form action={activateMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="text-button" type="submit">Activate Mix</button></form>}<ConfirmDialog trigger="Archive…" title={`Archive ${mix.name}?`} description="The Mix leaves active workflows while completed Jump history remains available." danger><form action={archiveMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="button small danger" type="submit">Confirm archive</button></form></ConfirmDialog></div></details>
                  </div>
                </div>
                {mix.description && <p className="muted-copy">{mix.description}</p>}
                <div className="mix-sequence-preview" aria-label={`${mix.name} Jump sequence`}>
                  {mix.steps.length ? mix.steps.map((step, index) => (
                    <div className="mix-sequence-item" key={step.id}><span className="mix-sequence-number">Jump #{index + 1}</span><span className="timeline-icon"><AppIcon name={channelIcon(step.stepVersion.stepTemplate.channel)} /></span><span><strong>{step.stepVersion.stepTemplate.name}</strong><small>Day {step.dayOffset}</small></span></div>
                  )) : <span className="status-pill">No Jumps added yet</span>}
                </div>
                <details className="mix-details"><summary>View prepared content</summary><div className="timeline">{mix.steps.map((step, index) => {
                  const content = step.stepVersion.body ?? step.stepVersion.script ?? "No message content";
                  return <div className="timeline-step" key={step.id}><div className="timeline-day">Jump #{index + 1}<small>Day {step.dayOffset}</small></div><div className="timeline-icon"><AppIcon name={channelIcon(step.stepVersion.stepTemplate.channel)} /></div><div className="timeline-content"><strong>{step.stepVersion.stepTemplate.name}</strong><span className="channel-pill">{step.stepVersion.stepTemplate.channel.replaceAll("_", " ")}</span><p>{step.stepVersion.subject && `${step.stepVersion.subject}\n`}{content}</p></div></div>;
                })}</div></details>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Create your first follow-up plan" description="Start from a reviewed Mix template or build a sequence for an Important Date and audience." actionHref="/templates" actionLabel="Browse Mix Templates" />
      )}

      {!mixes.length && <form action={createStarterMixAction} className="starter-mix-inline"><button className="button" type="submit">Or create the simple starter Mix</button></form>}
    </div>
  );
}
