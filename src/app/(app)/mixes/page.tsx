import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Notice } from "@/components/Notice";
import { Sheet } from "@/components/Sheet";
import { createStarterMixAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { formatDateInput, formatTimeInput } from "@/lib/mix-broadcast";
import { activateMixAction, archiveMixAction, pauseMixAction } from "@/lib/mix-lifecycle-actions";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

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
  page?: string;
};

function channelIcon(channel: string): AppIconName {
  if (channel === "EMAIL") return "email";
  if (channel === "PHONE_CALL" || channel === "VOICEMAIL") return "phone";
  return "message";
}

export default async function MixesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 160) : "";
  const status = ["ACTIVE", "PAUSED", "DRAFT"].includes(params.status ?? "") ? params.status : "";
  const where: Prisma.MixWhereInput = { workspaceId: workspace.id, status: status ? status as "ACTIVE" | "PAUSED" | "DRAFT" : { not: "ARCHIVED" }, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) };
  const totalCount = await prisma.mix.count({ where });
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const requestedPage = Number(params.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1;
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (nextPage > 1) query.set("page", String(nextPage));
    return `/mixes${query.size ? `?${query}` : ""}`;
  };
  const mixes = await prisma.mix.findMany({
      where,
      include: {
        steps: { where: { isActive: true }, include: { stepVersion: { include: { stepTemplate: true } } }, orderBy: { sortOrder: "asc" } },
        dateType: true,
        _count: { select: { assignments: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize
    });
  const broadcastSchedules = mixes.length ? await prisma.mixBroadcastSchedule.findMany({ where: { workspaceId: workspace.id, mixId: { in: mixes.map(mix => mix.id) } } }) : [];
  const broadcastByMixId = new Map(broadcastSchedules.map((schedule) => [schedule.mixId, schedule]));

  return (
    <div className="page">
      {params.created === "starter" && <Notice type="success">Starter mix created.</Notice>}
      {params.created === "manual" && <Notice type="success">Mix created.</Notice>}
      {params.updated === "manual" && <Notice type="success">Mix saved.</Notice>}
      {params.activated && <Notice type="success">Mix started.</Notice>}
      {params.paused && <Notice type="success">Mix paused.</Notice>}
      {params.archived && <Notice type="success">Mix archived.</Notice>}
      {params.starter === "exists" && <Notice type="info">Your starter mix is below.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div><h1>Mixes</h1><p>A mix is a follow-up campaign for the people in your circle. Build it from beats: messages and reminders at a tempo that feels right.</p></div>
        <div className="page-actions">
          <Link className="button" href="/templates">Ready-made mixes</Link><Link className="button primary mobile-header-action" href="/mixes/new" aria-label="Create a mix"><AppIcon name="add"/><span className="mobile-action-label">Create a mix</span></Link>
        </div>
      </header>
      <section className="card" aria-labelledby="system-mix-title"><p className="eyebrow">Your five personal invitations</p><h2 id="system-mix-title">Jump in the Mix System Mix</h2><p>Choose a contact, review your introduction, and send them unique access to a free account.</p><Link className="button primary" href="/mixes/system">Open System Mix</Link></section>
      <div className="mix-filter-row">
        <form className="filter-bar mix-filter-bar" action="/mixes" method="get"><input name="q" defaultValue={q} placeholder="Search mixes" aria-label="Search mixes"/>{status && <input type="hidden" name="status" value={status}/>}<button className="sr-only" type="submit">Search mixes</button></form>
        <Sheet trigger={<button className={status ? "button filter-trigger active" : "button filter-trigger"} type="button"><AppIcon name="settings"/><span>Filter{status ? " 1" : ""}</span></button>} title="Filter mixes" description="Changes apply as soon as you choose them.">
          <AutoSubmitForm className="form-stack" action="/mixes" ariaLabel="Mix filters"><input type="hidden" name="q" value={q}/><label className="field"><span>Status</span><select name="status" defaultValue={status} aria-label="Filter mixes by status"><option value="">All statuses</option><option value="ACTIVE">On</option><option value="PAUSED">Paused</option><option value="DRAFT">Draft</option></select></label></AutoSubmitForm>
          {(q || status) && <Link className="button" href="/mixes">Clear search and filters</Link>}
        </Sheet>
      </div>

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
                      <span className="mix-timing">{mix.steps.length} beat{mix.steps.length === 1 ? "" : "s"} · {lastDay + 1} day{lastDay ? "s" : ""}</span>
                      <span className="mix-channels">{channelSequence.join(" → ") || "No channels yet"}</span>
                    </div>
                  </div>
                  <div className="mix-card-actions"><Sheet trigger={<button className="button small" type="button" aria-label={`Manage ${mix.name}`}><AppIcon name="more"/><span>Manage</span></button>} title={mix.name} description="Edit this mix, change whether it is running, or archive it.">
                    <div className="sheet-actions vertical"><Link href={`/mixes/${mix.id}/edit`} className="button primary"><AppIcon name="edit"/>Edit mix</Link>{mix.status === "ACTIVE" ? <form action={pauseMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="button" type="submit">Pause mix</button></form> : <form action={activateMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="button" type="submit">Start the mix</button></form>}</div><div className="sheet-danger-zone"><ConfirmDialog trigger="Archive…" title={`Archive ${mix.name}?`} description="The mix stops creating new follow-ups. Completed history stays available." danger><form action={archiveMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="button danger" type="submit">Archive mix</button></form></ConfirmDialog></div>
                  </Sheet></div>
                </div>
                {mix.description && <p className="muted-copy">{mix.description}</p>}
                <div className="mix-sequence-preview" aria-label={`${mix.name} follow-up sequence`}>
                  {mix.steps.length ? mix.steps.map((step, index) => (
                    <div className="mix-sequence-item" key={step.id}><span className="mix-sequence-number">Beat {index + 1}</span><span className="timeline-icon"><AppIcon name={channelIcon(step.stepVersion.stepTemplate.channel)} /></span><span><strong>{step.stepVersion.stepTemplate.name}</strong><small>Day {step.dayOffset}</small></span></div>
                  )) : <span className="status-pill">No follow-ups yet</span>}
                </div>
                <details className="mix-details"><summary>Preview the rhythm</summary><div className="timeline">{mix.steps.map((step, index) => {
                  const content = step.stepVersion.body ?? step.stepVersion.script ?? "No message content";
                  return <div className="timeline-step" key={step.id}><div className="timeline-day">Beat {index + 1}<small>Day {step.dayOffset}</small></div><div className="timeline-icon"><AppIcon name={channelIcon(step.stepVersion.stepTemplate.channel)} /></div><div className="timeline-content"><strong>{step.stepVersion.stepTemplate.name}</strong><span className="channel-pill">{step.stepVersion.stepTemplate.channel.replaceAll("_", " ")}</span><p>{step.stepVersion.subject && `${step.stepVersion.subject}\n`}{content}</p></div></div>;
                })}</div></details>
              </article>
            );
          })}
        </div>
      ) : (
        q || status
          ? <EmptyState title="No mixes match these filters." description="Try a different search or clear your filters to see your mixes." actionHref="/mixes" actionLabel="Clear search and filters" />
          : <EmptyState title="Every relationship starts with a first beat." description="Create a mix to keep in touch with a customer, a friend, or someone you would like to know better." actionHref="/mixes/new" actionLabel="Create a mix" />
      )}

      {totalCount > 0 && <nav className="today-pagination" aria-label="Mix result pages">
        <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} {totalCount === 1 ? "mix" : "mixes"}</span>
        <div className="page-actions">
          {page > 1 && <Link className="button" href={pageHref(page - 1)}>Previous</Link>}
          <span>Page {page} of {totalPages}</span>
          {page < totalPages && <Link className="button" href={pageHref(page + 1)}>Next</Link>}
        </div>
      </nav>}
      {!totalCount && !q && !status && <form action={createStarterMixAction} className="starter-mix-inline"><button className="button" type="submit">Create a basic starter mix</button></form>}
    </div>
  );
}
