import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { activateMixAction, createStarterMixAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plans";

export const metadata: Metadata = { title: "Mixes" };

export default async function MixesPage({ searchParams }: { searchParams: Promise<{ created?: string; activated?: string; starter?: string; error?: string }> }) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();
  const mixes = await prisma.mix.findMany({
    where: { workspaceId: workspace.id, status: { not: "ARCHIVED" } },
    include: { steps: { include: { stepVersion: { include: { stepTemplate: true } } }, orderBy: { sortOrder: "asc" } }, dateType: true, _count: { select: { assignments: true, jumps: true } } },
    orderBy: { createdAt: "desc" }
  });
  const canUseWizard = PLAN_LIMITS[workspace.planTier].aiWizard;

  return (
    <div className="page">
      {params.created === "starter" && <Notice type="success">Starter Mix created and activated. Assign it to a contact with a matching Follow-up date.</Notice>}
      {params.created === "wizard" && <Notice type="success">Your AI-assisted Mix draft is ready. Review the timeline, then activate it.</Notice>}
      {params.activated && <Notice type="success">Mix activated. Assigned contacts can now receive scheduled Jumps.</Notice>}
      {params.starter === "exists" && <Notice type="info">Your simple starter Mix is already available below.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div><h1>Mixes</h1><p>Follow-up plans that turn an Important Date into a clear sequence of actions.</p></div>
        <div className="page-actions">{canUseWizard && <Link href="/mixes/wizard" className="button primary">Create with AI</Link>}<form action={createStarterMixAction}><button className={canUseWizard ? "button" : "button primary"} type="submit">Create simple starter</button></form></div>
      </header>
      {!canUseWizard && <Notice type="info">Your Free plan includes simple Mixes. The guided AI Mix Wizard becomes available on Plus and Pro.</Notice>}

      {mixes.length ? (
        <div className="mix-list">
          {mixes.map((mix) => (
            <article className="mix-row" key={mix.id} style={{ alignItems: "stretch", display: "grid" }}>
              <div className="card-header"><div><h3>{mix.name}</h3><div className="mix-meta"><span className="status-pill">{mix.status.toLowerCase()}</span><span>{mix.triggerMode.replaceAll("_", " ").toLowerCase()}</span>{mix.dateType && <span>Trigger: {mix.dateType.name}</span>}<span>{mix._count.assignments} assignments</span></div></div>{mix.status !== "ACTIVE" && <form action={activateMixAction}><input type="hidden" name="mixId" value={mix.id} /><button className="button small primary" type="submit">Activate</button></form>}</div>
              {mix.description && <p style={{ color: "var(--muted)", marginTop: 0 }}>{mix.description}</p>}
              <div className="timeline">
                {mix.steps.map((step) => {
                  const content = step.stepVersion.body ?? step.stepVersion.script ?? "No message content";
                  return (
                    <div className="timeline-step" key={step.id}><div className="timeline-day">Day {step.dayOffset}</div><div className="timeline-icon">{step.stepVersion.stepTemplate.channel === "EMAIL" ? "@" : step.stepVersion.stepTemplate.channel === "PHONE_CALL" ? "☎" : "↗"}</div><div className="timeline-content"><strong>{step.stepVersion.stepTemplate.name}</strong><span className="channel-pill">{step.stepVersion.stepTemplate.channel.replaceAll("_", " ")}</span><p>{step.stepVersion.subject && `${step.stepVersion.subject}\n`}{content}</p></div></div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Create your first follow-up plan" description="Start with a simple three-touch Mix. You can edit and expand it after seeing how the workflow feels." actionHref={canUseWizard ? "/mixes/wizard" : "/mixes"} actionLabel={canUseWizard ? "Open the Mix Wizard" : "Use the starter button above"} />
      )}
    </div>
  );
}
