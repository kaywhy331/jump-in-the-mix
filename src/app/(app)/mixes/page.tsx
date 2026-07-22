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

type SearchParams = { created?: string; updated?: string; activated?: string; paused?: string; archived?: string; starter?: string; error?: string; q?: string; status?: string };

function channelIcon(channel: string): AppIconName {
  if (channel === "EMAIL") return "email";
  if (channel === "PHONE_CALL" || channel === "VOICEMAIL") return "phone";
  return "message";
}

export default async function MixesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();
  const q = params.q?.trim() ?? "";
  const status = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"].includes(params.status ?? "") ? params.status! : "";
  const [mixes, activeCount] = await Promise.all([
    prisma.mix.findMany({
      where: { workspaceId: workspace.id, ...(status ? { status: status as "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" } : { status: { not: "ARCHIVED" } }), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }] } : {}) },
      include: { steps: { where: { isActive: true }, include: { stepVersion: { include: { stepTemplate: true } } }, orderBy: { sortOrder: "asc" } }, assignments: { where: { isActive: true } }, broadcastSchedule: true, _count: { select: { jumps: true } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    }),
    prisma.mix.count({ where: { workspaceId: workspace.id, status: "ACTIVE" } })
  ]);
  const limit = PLAN_LIMITS[workspace.planTier].mixes;

  return (
    <div className="page">
      {params.created && <Notice type="success">Mix created. Review its trigger, audience, and actions before activation.</Notice>}
      {params.updated && <Notice type="success">Mix updated. Future pending Jumps are being reconciled.</Notice>}
      {params.activated && <Notice type="success">Mix activated. Eligible future Jumps are being prepared.</Notice>}
      {params.paused && <Notice type="success">Mix paused. Pending future work was removed from the queue.</Notice>}
      {params.archived && <Notice type="success">Mix archived. Completed history remains preserved.</Notice>}
      {params.starter === "exists" && <Notice type="info">A starter Mix already exists.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header"><div><h1>Mixes</h1><p>Follow-up plans that turn an Important Date or assignment into a clear action sequence.</p></div><div className="page-actions"><Link className="button" href="/templates">Templates</Link>{PLAN_LIMITS[workspace.planTier].aiWizard && <Link className="button" href="/mixes/wizard">AI review</Link>}<Link className="button primary" href="/mixes/new"><AppIcon name="add" /> Create plan</Link></div></header>
      <div className="mix-limit"><span>{activeCount} of {formatPlanLimit(limit)} active Mixes</span><progress max={Number.isFinite(limit) ? limit : Math.max(activeCount, 1)} value={activeCount} /></div>
      <form className="filter-bar" action="/mixes" method="get"><input name="q" defaultValue={q} placeholder="Search Mixes" aria-label="Search Mixes"/><select name="status" defaultValue={status} aria-label="Filter by status"><option value="">Current Mixes</option><option value="DRAFT">Drafts</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="ARCHIVED">Archived</option></select><button className="button" type="submit">Apply</button>{(q || status) && <Link className="button" href="/mixes">Clear</Link>}</form>

      {mixes.length ? <div className="mix-list">{mixes.map((mix) => {
        const groupAssignments = mix.assignments.filter((item) => item.groupId).length;
        const contactAssignments = mix.assignments.filter((item) => item.contactId).length;
        const triggerDescription = mix.triggerMode === "DATE_TRIGGERED" ? "Important Date" : mix.triggerMode === "BROADCAST" ? `${formatDateInput(mix.broadcastSchedule?.localDate)} ${formatTimeInput(mix.broadcastSchedule?.timeMinutes)} ${mix.broadcastSchedule?.timezone ?? ""}` : "Manual start";
        return <article className="card mix-card" key={mix.id}><Link className="mix-card-main" href={`/mixes/${mix.id}/edit`}><div className="mix-card-heading"><div><h2>{mix.name}</h2><p>{mix.description || "No description"}</p></div><span className={`status-pill ${mix.status === "ACTIVE" ? "done" : ""}`}>{mix.status.toLowerCase()}</span></div><div className="jump-meta"><span>{triggerDescription}</span><span>{mix.steps.length} action{mix.steps.length === 1 ? "" : "s"}</span><span>{mix.durationDays ?? 0} day span</span><span>{mix._count.jumps} stored Jumps</span></div><div className="mix-channel-row">{[...new Set(mix.steps.map((step) => step.stepVersion.stepTemplate.channel))].map((channel) => <span key={channel}><AppIcon name={channelIcon(channel)} />{channel.replaceAll("_", " ").toLowerCase()}</span>)}</div><small>{groupAssignments} Group assignment{groupAssignments === 1 ? "" : "s"} · {contactAssignments} direct Contact assignment{contactAssignments === 1 ? "" : "s"}</small></Link><details className="mix-card-menu"><summary className="button small">More</summary><div className="mix-card-menu-panel"><Link href={`/mixes/${mix.id}/edit`}>Edit</Link><Link href={`/mixes/${mix.id}/share`}>Share</Link>{mix.status === "DRAFT" || mix.status === "PAUSED" ? <form action={activateMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="text-button" type="submit">Review & activate</button></form> : mix.status === "ACTIVE" ? <form action={pauseMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="text-button" type="submit">Pause</button></form> : null}<ConfirmDialog trigger="Archive…" title={`Archive ${mix.name}?`} description="Future pending Jumps will be canceled. Completed history remains preserved." danger><form action={archiveMixAction}><input type="hidden" name="mixId" value={mix.id}/><button className="button small danger" type="submit">Confirm archive</button></form></ConfirmDialog></div></details></article>;
      })}</div> : <EmptyState title="Create your first follow-up plan" description="Write actions directly, use a reviewed template, or generate one final AI review." actionHref="/mixes/new" actionLabel="Create a follow-up plan" />}
      {!mixes.length && <form action={createStarterMixAction} className="starter-mix-inline"><button className="button" type="submit">Or create the simple starter Mix</button></form>}
    </div>
  );
}
