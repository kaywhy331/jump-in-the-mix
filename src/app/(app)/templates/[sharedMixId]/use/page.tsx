import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import { PlanApproachGuide } from "@/components/PlanApproachGuide";
import { TemplateUseForm } from "@/components/TemplateUseForm";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { prisma } from "@/lib/prisma";
import { lockLibrary } from "@/lib/library-store";
import { normalizeSharedMixSteps } from "@/lib/shared-mix";
import { timezoneForUser } from "@/lib/display-preferences";
import { salesPlanById } from "@/lib/sales-plan-library";

export const metadata: Metadata = { title: "Set up your mix" };

type SearchParams = { error?: string };

export default async function UseMixTemplatePage({ params, searchParams }: { params: Promise<{ sharedMixId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ sharedMixId }, query, { workspace, user }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const workspaceTimezone = await timezoneForUser(user.id);
  const [published, rawGroups, groupStates, activeContactCount] = await Promise.all([
    prisma.$transaction(async tx => {
      await lockLibrary(tx);
      const shared = await tx.sharedMix.findFirst({ where: { id: sharedMixId, status: "APPROVED" } });
      const metadata = await tx.sharedMixMetadata.findUnique({ where: { sharedMixId } });
      return { shared, metadata };
    }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, include: { _count: { select: { memberships: true } } }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } })
  ]);
  const { shared, metadata } = published;
  if (!shared) notFound();
  const steps = normalizeSharedMixSteps(shared.steps);
  const salesPlan = salesPlanById(shared.id);
  const groups = mergeGroupActivity(rawGroups, groupStates).filter((group) => group.isActive);
  const durationDays = Math.max(...steps.map((step) => step.dayOffset)) - Math.min(...steps.map((step) => step.dayOffset));

  return (
    <div className="page template-use-page">
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header"><div><h1>Set up your mix</h1><p>{shared.title}</p></div><Link className="button" href="/templates">Mix library</Link></header>
      <div className="template-use-grid">
        <TemplateUseForm expectedVersion={metadata?.version ?? 1} sharedMixId={shared.id} requestId={`use-${randomUUID()}`} title={shared.title} description={shared.description} triggerMode={metadata?.triggerMode ?? "MANUAL_START"} dateTypeName={metadata?.dateTypeName ?? null} stepCount={steps.length} durationDays={durationDays} groups={groups.map((group) => ({ id: group.id, name: group.name, color: group.color, contactCount: group._count.memberships }))} activeContactCount={activeContactCount} workspaceTimezone={workspaceTimezone} />
        <aside className="card template-use-reference"><p className="library-goal">Your starting point</p><h2>{shared.title}</h2><p>{shared.description}</p><p className="library-plan-facts"><span>{steps.length} beats</span><span>{durationDays} days</span></p><details className="plan-message-reference"><summary>Preview the rhythm</summary><SharedMixPreview title={shared.title} triggerMode={metadata?.triggerMode ?? "MANUAL_START"} dateTypeName={metadata?.dateTypeName ?? null} durationDays={durationDays} steps={steps} expanded /></details>{salesPlan && <PlanApproachGuide plan={salesPlan}/>}<p className="muted-copy">When someone replies, pause their mix and continue the conversation. Replies are not detected automatically.</p></aside>
      </div>
    </div>
  );
}
