"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { type ErrorViewer, withViewerError } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";
import { unshareForArchivedMix } from "@/lib/marketplace-service";
import { startDraftMix } from "@/lib/mix-start";
import { readWorkflowDefinition, saveWorkflowConfiguration } from "@/lib/mix-workflow";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string, viewer: ErrorViewer): never {
  redirect(withViewerError("/mixes", message, viewer));
}

async function queueMixReconciliation(workspaceId: string, mixId: string): Promise<void> {
  await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { mixId } } });
}

export async function activateMixAction(formData: FormData): Promise<void> {
  const { session, workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) fail("Administrator support sessions are view-only.", session);
  const mixId = value(formData, "mixId");
  const mix = await prisma.mix.findFirst({
    where: { id: mixId, workspaceId: workspace.id, status: { in: ["DRAFT", "PAUSED"] }, source: { not: "ONE_TIME" } },
    select: { id: true, name: true }
  });
  if (!mix) fail("Mix not found or already active.", session);
  const preference = await prisma.userPreference.findUnique({ where: { userId: user.id }, select: { reviewMixActivation: true } });
  if (preference?.reviewMixActivation !== false) redirect(`/mixes/${mix.id}/edit?activate=1`);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR UPDATE`;
    await startDraftMix(tx, { workspaceId: workspace.id, mixId: mix.id, now: new Date() });
    await tx.mix.update({ where: { id: mix.id }, data: { status: "ACTIVE" } });
    const definition = await readWorkflowDefinition(tx, workspace.id);
    const connectionId = `mix-start:${mix.id}`;
    if (definition.rules.some(rule => rule.id === connectionId && !rule.enabled)) await saveWorkflowConfiguration(tx, workspace.id, { rules: definition.rules.map(rule => rule.id === connectionId ? { ...rule, enabled: true } : rule), gatedStepIds: definition.gatedStepIds, intentionalEnds: definition.intentionalEnds }, definition.revision, user.id);
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.activate",
        entityType: "Mix",
        entityId: mix.id,
        source: "mixes.list"
      }
    });
  });
  await queueMixReconciliation(workspace.id, mix.id);
  redirect("/mixes?activated=1");
}

export async function pauseMixAction(formData: FormData): Promise<void> {
  const { session, workspace, user } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const mix = await prisma.mix.findFirst({
    where: { id: mixId, workspaceId: workspace.id, status: "ACTIVE", source: { not: "ONE_TIME" } },
    select: { id: true }
  });
  if (!mix) fail("Active Mix not found.", session);
  await prisma.$transaction([
    prisma.mix.update({ where: { id: mix.id }, data: { status: "PAUSED" } }),
    prisma.jump.updateMany({
      where: { mixId: mix.id, workspaceId: workspace.id, status: "PENDING", scheduledAt: { gte: new Date() } },
      data: { status: "CANCELED", completedAt: null, completionMethod: "mix_paused" }
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.pause",
        entityType: "Mix",
        entityId: mix.id,
        source: "mixes.list"
      }
    })
  ]);
  await queueMixReconciliation(workspace.id, mix.id);
  redirect("/mixes?paused=1");
}

export async function archiveMixAction(formData: FormData): Promise<void> {
  const { session, workspace, user } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const mix = await prisma.mix.findFirst({
    where: { id: mixId, workspaceId: workspace.id, status: { not: "ARCHIVED" }, source: { not: "ONE_TIME" } },
    select: { id: true }
  });
  if (!mix) fail("Mix not found.", session);
  // Interactive, so the Marketplace can see which other Mixes of its Mega-Mix are still shareable.
  const unshared = await prisma.$transaction(async tx => {
    await tx.mix.update({ where: { id: mix.id }, data: { status: "ARCHIVED" } });
    await tx.mixAssignment.updateMany({ where: { mixId: mix.id, workspaceId: workspace.id }, data: { isActive: false } });
    await tx.mixBroadcastSchedule.deleteMany({ where: { mixId: mix.id, workspaceId: workspace.id } });
    await tx.jump.updateMany({
      where: { mixId: mix.id, workspaceId: workspace.id, status: "PENDING" },
      data: { status: "CANCELED", completedAt: null, completionMethod: "mix_archived" }
    });
    // An archived Mix has nothing to show: its live share stops, and so does its Mega-Mix's when no other Mix can be shared.
    const stopped = await unshareForArchivedMix(tx, { workspaceId: workspace.id, actorUserId: user.id, mixId: mix.id });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.archive",
        entityType: "Mix",
        entityId: mix.id,
        source: "mixes.list",
        metadata: { unsharedMix: stopped.mix, unsharedMegaMix: stopped.megaMix }
      }
    });
    return stopped;
  });
  // A fixed code, not wording, so the page shows its own sentence for what stopped being shared.
  redirect(`/mixes?archived=${unshared.mix && unshared.megaMix ? "both" : unshared.mix ? "shared" : unshared.megaMix ? "mega" : "1"}`);
}
