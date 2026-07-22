import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import { TemplateUseForm } from "@/components/TemplateUseForm";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { prisma } from "@/lib/prisma";
import { normalizeSharedMixSteps } from "@/lib/shared-mix";

export const metadata: Metadata = { title: "Use Mix Template" };

type SearchParams = { error?: string };

export default async function UseMixTemplatePage({ params, searchParams }: { params: Promise<{ sharedMixId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ sharedMixId }, query, { workspace }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const [shared, metadata, rawGroups, groupStates, activeContactCount] = await Promise.all([
    prisma.sharedMix.findFirst({ where: { id: sharedMixId, status: "APPROVED" } }),
    prisma.sharedMixMetadata.findUnique({ where: { sharedMixId } }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, include: { _count: { select: { memberships: true } } }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } })
  ]);
  if (!shared || (shared.publisherWorkspaceId !== null && !metadata?.isPlatform)) notFound();
  const steps = normalizeSharedMixSteps(shared.steps);
  const groups = mergeGroupActivity(rawGroups, groupStates).filter((group) => group.isActive);
  const durationDays = Math.max(...steps.map((step) => step.dayOffset)) - Math.min(...steps.map((step) => step.dayOffset));

  return (
    <div className="page template-use-page">
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header"><div><h1>Use {shared.title}</h1><p>Choose the name, trigger timing, audience, and lifecycle in one setup screen.</p></div></header>
      <div className="template-use-grid">
        <section className="card template-use-preview"><p>{shared.description}</p><SharedMixPreview title={shared.title} triggerMode={metadata?.triggerMode ?? "MANUAL_START"} dateTypeName={metadata?.dateTypeName ?? null} durationDays={durationDays} steps={steps} expanded /></section>
        <TemplateUseForm sharedMixId={shared.id} requestId={`use-${randomUUID()}`} title={shared.title} description={shared.description} triggerMode={metadata?.triggerMode ?? "MANUAL_START"} dateTypeName={metadata?.dateTypeName ?? null} stepCount={steps.length} durationDays={durationDays} groups={groups.map((group) => ({ id: group.id, name: group.name, color: group.color, contactCount: group._count.memberships }))} activeContactCount={activeContactCount} workspaceTimezone={workspace.profile?.timezone ?? "UTC"} activationAvailable />
      </div>
    </div>
  );
}
