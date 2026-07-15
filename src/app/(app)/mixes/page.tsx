import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { activateMixAction, archiveMixAction, createStarterMixAction, pauseMixAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
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
};

function channelIcon(channel: string): string {
  if (channel === "EMAIL") return "✉";
  if (channel === "PHONE_CALL") return "☎";
  if (channel === "VOICEMAIL") return "◉";
  if (channel === "WHATSAPP") return "◌";
  return "●";
}

export default async function MixesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();
  const mixes = await prisma.mix.findMany({
    where: { workspaceId: workspace.id, status: { not: "ARCHIVED" } },
    include: {
      steps: { where: { isActive: true }, include: { stepVersion: { include: { stepTemplate: true } } }, orderBy: { sortOrder: "asc" } },
      dateType: true,
      _count: { select: { assignments: true, jumps: true } }
    },
    orderBy: { createdAt: "desc" }
  });
  const limits = PLAN_LIMITS[workspace.planTier];
  const canUseWizard = limits.aiWizard;
  const activeCount = mixes.filter((mix) => mix.status === "ACTIVE").length;

  return (
    <div className="page">
      {params.created === "starter" && <Notice type="success">Starter Mix created. Assign it to a Contact with a matching Jump Date.</Notice>}
      {params.created === "wizard" && <Notice type="success">Your AI-assisted Mix draft is ready. Review the sequence, then activate it.</Notice>}
      {params.created === "manual" && <Notice type="success">Mix created. Future pending Jumps are being reconciled automatically.</Notice>}
      {params.updated === "manual" && <Notice type="success">Mix updated. Removed or rescheduled future work is being reconciled.</Notice>}
      {params.activated && <Notice type="success">Mix activated. Matching future Jumps are being reconciled automatically.</Notice>}
      {params.paused && <Notice type="success">Mix paused. Future pending Jumps from this Mix were removed from the action queue.</Notice>}
      {params.archived && <Notice type="success">Mix archived. Completed history remains available.</Notice>}
      {params.starter === "exists" && <Notice type="info">Your simple starter Mix is already available below.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div><h1>Mixes</h1><p>Build ordered Jump sequences and control their trigger, audience, and lifecycle.</p></div>
        <div className="page-actions">
          <Link href="/settings/jumps" className="button">Manage Jumps</Link>
          {canUseWizard && <Link href="/mixes/wizard" className="button">Create with AI</Link>}
          <Link href="/mixes/new" className="button primary">+ New Mix</Link>
        </div>
      </header>
      <div className="usage-line"><span>Active Mixes</span><strong>{activeCount}/{formatPlanLimit(limits.mixes)}</strong></div>
      {!canUseWizard && <Notice type="info">Free includes up to three active Mixes. AI generation is available on Plus and Pro.</Notice>}

      {mixes.length ? (
        <div className="mix-list">
          {mixes.map((mix) => (
            <article className="mix-row mix-card" key={mix.id}>
              <div className="card-header">
                <div>
                  <h3>{mix.name}</h3>
                  <div className="mix-meta">
                    <span className={`status-pill ${mix.status === "ACTIVE" ? "done" : ""}`}>{mix.status.toLowerCase()}</span>
                    <span>{mix.triggerMode.replaceAll("_", " ").toLowerCase()}</span>
                    {mix.dateType && <span>Target Jump Date Type: {mix.dateType.name}</span>}
                    <span>{mix._count.assignments} assignments</span>
                  </div>
                </div>
                <div className="mix-card-actions">
                  <Link href={`/mixes/${mix.id}/edit`} className="button small">Edit</Link>
                  {mix.status === "ACTIVE" ? (
                    <form action={pauseMixAction}><input type="hidden" name="mixId" value={mix.id} /><button className="button small" type="submit">Pause</button></form>
                  ) : (
                    <form action={activateMixAction}><input type="hidden" name="mixId" value={mix.id} /><button className="button small primary" type="submit">Activate</button></form>
                  )}
                  <details className="destructive-confirm">
                    <summary className="button small danger">Archive…</summary>
                    <div className="destructive-confirm-panel"><p>Archive this Mix? Future pending Jumps will be canceled; completed history stays intact.</p><form action={archiveMixAction}><input type="hidden" name="mixId" value={mix.id} /><button className="button small danger" type="submit">Confirm archive</button></form></div>
                  </details>
                </div>
              </div>
              {mix.description && <p className="muted-copy">{mix.description}</p>}
              <div className="mix-sequence-preview" aria-label={`${mix.name} Jump sequence`}>
                {mix.steps.length ? mix.steps.map((step, index) => (
                  <div className="mix-sequence-item" key={step.id}><span className="mix-sequence-number">Jump #{index + 1}</span><span className="timeline-icon" aria-hidden="true">{channelIcon(step.stepVersion.stepTemplate.channel)}</span><span><strong>{step.stepVersion.stepTemplate.name}</strong><small>Day {step.dayOffset}</small></span></div>
                )) : <span className="status-pill">No Jumps added yet</span>}
              </div>
              <details className="mix-details"><summary>View prepared content</summary><div className="timeline">{mix.steps.map((step, index) => {
                const content = step.stepVersion.body ?? step.stepVersion.script ?? "No message content";
                return <div className="timeline-step" key={step.id}><div className="timeline-day">Jump #{index + 1}<small>Day {step.dayOffset}</small></div><div className="timeline-icon">{channelIcon(step.stepVersion.stepTemplate.channel)}</div><div className="timeline-content"><strong>{step.stepVersion.stepTemplate.name}</strong><span className="channel-pill">{step.stepVersion.stepTemplate.channel.replaceAll("_", " ")}</span><p>{step.stepVersion.subject && `${step.stepVersion.subject}\n`}{content}</p></div></div>;
              })}</div></details>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Create your first Mix" description="Start with a reusable Jump sequence, then choose its trigger and audience." actionHref="/mixes/new" actionLabel="Create a Mix" />
      )}

      {!mixes.length && <form action={createStarterMixAction} className="starter-mix-inline"><button className="button" type="submit">Or create the simple starter Mix</button></form>}
    </div>
  );
}
