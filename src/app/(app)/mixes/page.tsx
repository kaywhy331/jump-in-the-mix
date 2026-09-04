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
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Plans" };

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
  const broadcastByMixId = new Map(broadcastSchedules.map((schedule) => [schedule.mixId, schedule]));

  return (
    <div className="page">
      {params.created === "starter" && <Notice type="success">Starter plan created.</Notice>}
      {params.created === "manual" && <Notice type="success">Plan created.</Notice>}
      {params.updated === "manual" && <Notice type="success">Plan saved.</Notice>}
      {params.activated && <Notice type="success">Plan turned on.</Notice>}
      {params.paused && <Notice type="success">Plan paused.</Notice>}
      {params.archived && <Notice type="success">Plan archived.</Notice>}
      {params.starter === "exists" && <Notice type="info">Your starter plan is below.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div><h1>Plans</h1><p>Ready-to-use follow-ups for leads, customers, reviews, renewals, and referrals.</p></div>
        <div className="page-actions">
          <Link className="button" href="/templates">Ready-made plans</Link><Link className="button primary mobile-header-action" href="/mixes/new" aria-label="Create plan"><AppIcon name="add"/><span className="mobile-action-label">New plan</span></Link>
        </div>
      </header>
      <form className="filter-bar mix-filter-bar desktop-only" action="/mixes" method="get"><input name="q" defaultValue={q} placeholder="Search plans" aria-label="Search plans"/><select name="status" defaultValue={status} aria-label="Filter plans by status"><option value="">All statuses</option><option value="ACTIVE">On</option><option value="PAUSED">Paused</option><option value="DRAFT">Draft</option></select><button className="button" type="submit">Filter</button>{(q || status) && <Link className="button" href="/mixes">Clear</Link>}</form>
      <div className="mobile-contact-controls mobile-only"><form className="mobile-search-form" action="/mixes" method="get"><input name="q" defaultValue={q} placeholder="Search plans" aria-label="Search plans"/>{status && <input type="hidden" name="status" value={status}/>}<button className="sr-only" type="submit">Search plans</button></form><details className="mobile-filter-disclosure"><summary className={status ? "button filter-trigger active" : "button filter-trigger"}><AppIcon name="settings"/><span>Filter{status ? " 1" : ""}</span></summary><form className="mobile-filter-panel" action="/mixes" method="get"><input type="hidden" name="q" value={q}/><label className="filter-field"><span>Status</span><select name="status" defaultValue={status} aria-label="Filter plans by status"><option value="">All statuses</option><option value="ACTIVE">On</option><option value="PAUSED">Paused</option><option value="DRAFT">Draft</option></select></label><div className="mobile-filter-actions"><Link className="button" href={q ? `/mixes?q=${encodeURIComponent(q)}` : "/mixes"}>Reset</Link><button className="button primary" type="submit">Apply</button></div></form></details></div>

      {mixes.length ? (
        <div className="mix-list">
          {mixes.map((mix) => {
            const broadcast = broadcastByMixId.get(mix.id);
            const lastDay = Math.max(0, ...mix.steps.map((step) => step.dayOffset));
            const channelSequence = [...new Set(mix.steps.map((step) => step.stepVersion.stepTemplate.channel.replaceAll("_", " ").toLowerCase()))];
            return (
              <article className="mix-row mix-card" key={mix.id}>
                <div className="card-header">
                  <div>
                    <h3>{mix.name}</h3>
                    <div className="mix-meta">
                      <span className={`status-pill ${mix.status === "ACTIVE" ? "done" : ""}`}>{mix.status.toLowerCase()}</span>
                      <span className="mix-trigger">Starts: {mix.dateType ? `when ${mix.dateType.name} is added` : mix.triggerMode === "MANUAL_START" ? "when you choose" : "on one scheduled date"}</span>
                      {broadcast && <span className="mix-broadcast">Scheduled: {formatDateInput(broadcast.localDate)} · {formatTimeInput(broadcast.timeMinutes)} {broadcast.timezone}</span>}
                      <span className="mix-audience">{mix._count.assignments} {mix._count.assignments === 1 ? "person" : "people"}</span>
                      <span className="mix-timing">{mix.steps.length} follow-up{mix.steps.length === 1 ? "" : "s"} · {lastDay + 1} day{lastDay ? "s" : ""}</span>
                      <span className="mix-channels">{channelSequence.join(" → ") || "No channels yet"}</span>
                    </div>
                  </div>
                  <div className="mix-card-actions">
                    <Link href={`/mixes/${mix.id}/edit`} className="button small primary">Edit</Link>
                    <details className="mix-row-menu"><summary className="button small" aria-label={`More actions for ${mix.name}`}>More</summary><div className="mix-row-menu-panel">{mix.status === "ACTIVE" ? <form action={pauseMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="text-button" type="submit">Pause plan</button></form> : <form action={activateMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="text-button" type="submit">Turn on plan</button></form>}<ConfirmDialog trigger="Archive…" title={`Archive ${mix.name}?`} description="The plan stops creating new follow-ups. Completed history stays available." danger><form action={archiveMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="button small danger" type="submit">Archive plan</button></form></ConfirmDialog></div></details>
                  </div>
                </div>
                {mix.description && <p className="muted-copy">{mix.description}</p>}
                <div className="mix-sequence-preview" aria-label={`${mix.name} follow-up sequence`}>
                  {mix.steps.length ? mix.steps.map((step, index) => (
                    <div className="mix-sequence-item" key={step.id}><span className="mix-sequence-number">Follow-up {index + 1}</span><span className="timeline-icon"><AppIcon name={channelIcon(step.stepVersion.stepTemplate.channel)} /></span><span><strong>{step.stepVersion.stepTemplate.name}</strong><small>Day {step.dayOffset}</small></span></div>
                  )) : <span className="status-pill">No follow-ups yet</span>}
                </div>
                <details className="mix-details"><summary>View prepared content</summary><div className="timeline">{mix.steps.map((step, index) => {
                  const content = step.stepVersion.body ?? step.stepVersion.script ?? "No message content";
                  return <div className="timeline-step" key={step.id}><div className="timeline-day">Follow-up {index + 1}<small>Day {step.dayOffset}</small></div><div className="timeline-icon"><AppIcon name={channelIcon(step.stepVersion.stepTemplate.channel)} /></div><div className="timeline-content"><strong>{step.stepVersion.stepTemplate.name}</strong><span className="channel-pill">{step.stepVersion.stepTemplate.channel.replaceAll("_", " ")}</span><p>{step.stepVersion.subject && `${step.stepVersion.subject}\n`}{content}</p></div></div>;
                })}</div></details>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Choose your first plan" description="Start with a ready-made plan for your business, or build a simple one." actionHref="/mixes/new" actionLabel="Choose a plan" />
      )}

      {!mixes.length && <form action={createStarterMixAction} className="starter-mix-inline"><button className="button" type="submit">Create a basic starter plan</button></form>}
    </div>
  );
}
