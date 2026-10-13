"use server";

import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { type ErrorViewer, withViewerError } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";
import { unshareForArchivedMix } from "@/lib/marketplace-service";
import { startDraftMix } from "@/lib/mix-start";
import { audienceStarts, peopleInMixByOtherRoutes, setStagesFromMixStarts, type MixStart } from "@/lib/mix-stage";
import { activeMixLimitRefusal } from "@/lib/plan-limits";
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

/**
 * Whether turning this Mix on moves people to its Contact stage, so Start Mix opens the review instead: a draft's whole
 * audience (UX-01), or on a paused Mix the members of the tags added while it was paused (D65).
 */
async function movesToStage(db: Pick<Prisma.TransactionClient, "contactGroupState" | "mixAssignment">, workspaceId: string, mix: { id: string; status: string; audienceEveryone: boolean; stageId: string | null }): Promise<boolean> {
  if (!mix.stageId) return false;
  if (mix.status === "DRAFT") return mix.audienceEveryone || await db.mixAssignment.count({ where: { workspaceId, mixId: mix.id, isActive: true, mode: "DYNAMIC" } }) > 0;
  const hidden = (await db.contactGroupState.findMany({ where: { workspaceId, isActive: false }, select: { groupId: true } })).map(state => state.groupId);
  return await db.mixAssignment.count({ where: { workspaceId, mixId: mix.id, isActive: true, addedWhilePaused: true, groupId: { not: null, notIn: hidden } } }) > 0;
}

export async function activateMixAction(formData: FormData): Promise<void> {
  const { session, workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) fail("Administrator support sessions are view-only.", session);
  const mixId = value(formData, "mixId");
  const mix = await prisma.mix.findFirst({
    where: { id: mixId, workspaceId: workspace.id, status: { in: ["DRAFT", "PAUSED"] }, source: { not: "ONE_TIME" } },
    select: { id: true, name: true, status: true, triggerMode: true, audienceEveryone: true, stageId: true }
  });
  if (!mix) fail("Mix not found or already active.", session);
  const preference = await prisma.userPreference.findUnique({ where: { userId: user.id }, select: { reviewMixActivation: true } });
  // A start that moves people to the Mix's stage is always reviewed first (UX-01, D65).
  if (preference?.reviewMixActivation !== false || await movesToStage(prisma, workspace.id, mix)) redirect(`/mixes/${mix.id}/edit?activate=1`);
  const outcome = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR UPDATE`;
    // Read again under the lock, and used from here on: another device may have turned the Mix on, or added a tag or a
    // stage, since (LCK-04).
    const mix = await tx.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id, status: { in: ["DRAFT", "PAUSED"] }, source: { not: "ONE_TIME" } }, select: { id: true, status: true, triggerMode: true, audienceEveryone: true, stageId: true } });
    if (!mix) return { refusal: "Mix not found or already active." };
    if (await movesToStage(tx, workspace.id, mix)) return { review: true };
    const limit = await activeMixLimitRefusal(workspace.id, { mixIds: [mix.id] }, tx);
    if (limit) return { refusal: limit };
    const now = new Date();
    await startDraftMix(tx, { workspaceId: workspace.id, mixId: mix.id, now });
    await tx.mix.update({ where: { id: mix.id }, data: { status: "ACTIVE" } });
    // Turning on a draft starts it for its whole audience; resuming a paused Mix starts the tags added while it was
    // paused (D65) and the people "Everyone" takes in below.
    const starting: MixStart[] = await audienceStarts(tx, workspace.id, mix.id, (await tx.mixAssignment.findMany({ where: { workspaceId: workspace.id, mixId: mix.id, isActive: true, ...mix.status === "DRAFT" ? {} : { addedWhilePaused: true } }, select: { id: true } })).map(item => item.id));
    await tx.mixAssignment.updateMany({ where: { workspaceId: workspace.id, mixId: mix.id, addedWhilePaused: true }, data: { addedWhilePaused: false } });
    // "Everyone" includes people added while the Mix was off, as the editor's save does (JITM-09 §2.78, EVR-01). They
    // start from now; everyone already in it keeps their start. Someone stopped in it with no place, such as someone
    // the owner removed from it, gets none (D64).
    if (mix.audienceEveryone) {
      const stopped = new Set((await tx.mixStop.findMany({ where: { workspaceId: workspace.id, mixId: mix.id }, select: { contactId: true } })).map(stop => stop.contactId));
      const people = await tx.contact.findMany({ where: { workspaceId: workspace.id, archivedAt: null }, select: { id: true } });
      const startDate = mix.triggerMode === "MANUAL_START" ? now : null;
      const already = new Set((await tx.mixAssignment.findMany({ where: { assignmentKey: { in: people.map(contact => `${workspace.id}:${mix.id}:audience:${contact.id}`) } }, select: { contactId: true } })).map(item => item.contactId));
      const contacts = people.filter(contact => already.has(contact.id) || !stopped.has(contact.id));
      await tx.mixAssignment.createMany({ data: contacts.map(contact => ({ assignmentKey: `${workspace.id}:${mix.id}:audience:${contact.id}`, workspaceId: workspace.id, mixId: mix.id, contactId: contact.id, mode: "DYNAMIC" as const, startDate })), skipDuplicates: true });
      // On a resume, people in the Mix by another route (a tag, their own start, a visit, a Journey run) keep their stage
      // (UX-04, UX-06).
      const elsewhere = mix.status === "PAUSED" ? await peopleInMixByOtherRoutes(tx, workspace.id, mix.id) : new Set<string>();
      // Everyone's starts go first, so a tag's start for the same person comes later and wins (D66).
      starting.unshift(...contacts.filter(contact => !already.has(contact.id) && !elsewhere.has(contact.id)).map(contact => ({ contactId: contact.id, mixId: mix.id, everyone: true })));
    }
    // A Mix that names a Contact stage sets it for the people it starts now (JITM-09 §2.79).
    await setStagesFromMixStarts(tx, { workspaceId: workspace.id, starts: starting, actorUserId: user.id, now });
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
    return null;
  });
  if (outcome && "review" in outcome) redirect(`/mixes/${mix.id}/edit?activate=1`);
  if (outcome) fail(outcome.refusal, session);
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
    // Tags are marked only by saves while the Mix is paused (D65), so any mark left on a Mix that was running is stale,
    // as after a rollback (RBK-01).
    prisma.mixAssignment.updateMany({ where: { workspaceId: workspace.id, mixId: mix.id, addedWhilePaused: true }, data: { addedWhilePaused: false } }),
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
