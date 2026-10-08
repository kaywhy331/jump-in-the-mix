"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { JourneyEventType } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { type ErrorViewer, withViewerError } from "@/lib/form-errors";
import { enableJourney, recordJourneyEvent } from "@/lib/journey";
import { JOURNEY_EVENTS, type JourneyRuleFormState } from "@/lib/journey-types";
import { configureJourneyRule, JourneyConfigurationError, JourneyRuleConflict } from "@/lib/journey-configuration";
import { prisma } from "@/lib/prisma";
import { MAX_CONTACT_STAGES } from "@/lib/mix-stage-labels";
import { UserFacingError } from "@/lib/user-facing-error";

const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
async function context() { const ctx = await requireWorkspace(); if (ctx.impersonation) throw new Error("Support sessions are view-only."); return ctx; }
/** A refusal this module writes in its own words; the page shows it as it is. */
class JourneyRefusal extends Error {}
/** Known refusals keep their wording; any other error (database, network) gets the fixed sentence. */
function failure(path: string, error: unknown, viewer: ErrorViewer): never {
  redirect(withViewerError(path, error instanceof JourneyRefusal || error instanceof UserFacingError ? error.message : "The change could not be saved.", viewer));
}

export async function setJourneyEnabledAction(data: FormData) {
  const { workspace, user } = await context();
  if (value(data, "enabled") === "true") await enableJourney(workspace.id);
  else await prisma.journeyPreference.updateMany({ where: { workspaceId: workspace.id }, data: { enabled: false } });
  await prisma.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "journey.automation", entityType: "JourneyPreference", entityId: workspace.id, source: "settings.journey", afterData: { enabled: value(data, "enabled") === "true" } } });
  redirect("/settings/journey?saved=1");
}

export async function saveJourneyStageAction(data: FormData) {
  const { session, workspace, user } = await context();
  const id = value(data, "stageId"); const name = value(data, "name"); const planId = value(data, "planId") || null;
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR NO KEY UPDATE`;
      const stages = await tx.journeyStage.findMany({ where: { workspaceId: workspace.id }, include: { _count: { select: { contacts: true } } } });
      const stage = stages.find(item => item.id === id);
      if (id && !stage) throw new JourneyRefusal("Stage not found.");
      await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "journey.stage.configure", entityType: "JourneyStage", entityId: id || workspace.id, source: "settings.journey", afterData: { intent: value(data, "intent"), name, planId } } });
      if (["earlier", "later"].includes(value(data, "intent"))) {
        const ordered = stages.filter(item => item.isActive).sort((a,b) => a.position-b.position || a.id.localeCompare(b.id));
        const index = ordered.findIndex(item => item.id === id);
        const neighbor = ordered[index + (value(data, "intent") === "earlier" ? -1 : 1)];
        if (!stage || !neighbor) throw new JourneyRefusal("This stage cannot move further in that direction.");
        await tx.journeyStage.update({ where: { id }, data: { position: neighbor.position } });
        await tx.journeyStage.update({ where: { id: neighbor.id }, data: { position: stage.position } });
        return;
      }
      if (value(data, "intent") === "archive") {
        // The stage's row lock comes before the count, so a Mix start setting this stage right now finishes first and
        // is counted, and one that comes later finds the stage retired (JITM-09 §2.79). The Mixes that name it are
        // locked first, the order a placement takes them in (it shares the Everyone Mixes' rows, then the stage's), so
        // the two can't wait on each other. NO KEY UPDATE is what unlinking needs; it lets enrollments keep referring
        // to those Mixes meanwhile (LCK-02).
        if (stage) await tx.$queryRaw`SELECT id FROM "Mix" WHERE "workspaceId" = ${workspace.id} AND "stageId" = ${id} ORDER BY id FOR NO KEY UPDATE`;
        if (stage) await tx.$queryRaw`SELECT id FROM "JourneyStage" WHERE id = ${id} AND "workspaceId" = ${workspace.id} FOR UPDATE`;
        if (!stage || await tx.contactJourney.count({ where: { workspaceId: workspace.id, stageId: id } })) throw new JourneyRefusal("Move the people in this stage before retiring it.");
        if (stages.filter(item => item.isActive).length <= 1) throw new JourneyRefusal("Keep at least one stage.");
        await tx.journeyStage.update({ where: { id }, data: { isActive: false } });
        await tx.journeyRule.updateMany({ where: { workspaceId: workspace.id, OR: [{ fromStageId: id }, { toStageId: id }] }, data: { enabled: false } });
        // Mixes that named it stop setting a stage; the confirmation lists them.
        await tx.mix.updateMany({ where: { workspaceId: workspace.id, stageId: id }, data: { stageId: null } });
        return;
      }
      if (!name || name.length > 60) throw new JourneyRefusal("Use a stage name between 1 and 60 characters.");
      if (stages.some(item => item.name.toLowerCase() === name.toLowerCase() && item.id !== id)) throw new JourneyRefusal("Give each stage a different name.");
      if (!id && stages.length >= MAX_CONTACT_STAGES) throw new JourneyRefusal(`You can have up to ${MAX_CONTACT_STAGES} contact stages.`);
      if (planId && !await tx.mix.findFirst({ where: { id: planId, workspaceId: workspace.id, status: "ACTIVE", triggerMode: "MANUAL_START", source: { not: "ONE_TIME" } } })) throw new JourneyRefusal("Choose an active Mix that starts for each person.");
      if (stage) await tx.journeyStage.update({ where: { id }, data: { name, planId, isActive: true } });
      else await tx.journeyStage.create({ data: { workspaceId: workspace.id, name, planId, position: Math.max(-1, ...stages.map(item => item.position)) + 1 } });
    });
  } catch (error) { failure("/settings/journey", error, session); }
  redirect("/settings/journey?saved=1");
}

async function submitJourneyRule(data: FormData, { workspace, user }: Awaited<ReturnType<typeof context>>): Promise<JourneyRuleFormState> {
  try {
    await configureJourneyRule({ workspaceId: workspace.id, actorUserId: user.id,
      fromStageId: value(data, "fromStageId"), toStageId: value(data, "toStageId"),
      eventType: value(data, "eventType"), afterDays: Number(value(data, "afterDays")),
      expectedRule: value(data, "expectedRule"), remove: value(data, "intent") === "remove" });
  } catch (error) {
    if (error instanceof JourneyRuleConflict) return { error: error.message, conflict: { eventType: error.eventType, rule: error.rule } };
    return { error: error instanceof JourneyConfigurationError ? error.message : "This rule could not be saved. Your entries are kept. Try again." };
  }
  revalidatePath("/settings/journey");
  revalidatePath("/journey");
  return { error: "", saved: true };
}

export async function saveJourneyRuleAction(data: FormData) {
  const ctx = await context();
  const state = await submitJourneyRule(data, ctx);
  // state.error is a known refusal's wording or the rule form's fixed sentence (submitJourneyRule).
  const stage = encodeURIComponent(value(data, "fromStageId"));
  redirect(`${state.saved ? `/settings/journey?saved=1&stage=${stage}` : withViewerError(`/settings/journey?stage=${stage}`, state.error, ctx.session)}#stage-${stage}`);
}

export async function saveJourneyRuleFormAction(_state: JourneyRuleFormState, data: FormData): Promise<JourneyRuleFormState> {
  return submitJourneyRule(data, await context());
}

export async function changeContactJourneyAction(data: FormData) {
  const { session, workspace, user } = await context(); const contactId = value(data, "contactId");
  const path = `/contacts/${encodeURIComponent(contactId)}`;
  try {
    const eventType = value(data, "eventType") || "MANUAL";
    if (eventType !== "MANUAL" && !JOURNEY_EVENTS.some(item => item.value === eventType && !["TIME_IN_STAGE", "PLAN_COMPLETED", "CONTACT_RECEIVED"].includes(item.value))) throw new JourneyRefusal("Choose a business milestone.");
    await recordJourneyEvent({ workspaceId: workspace.id, contactId, eventType: eventType as JourneyEventType, eventKey: `manual:${value(data, "requestId") || randomUUID()}`, source: "Recorded by you", actorUserId: user.id, targetStageId: value(data, "stageId"), expectedVersion: Number(value(data, "version") || 0) });
  } catch (error) { failure(path, error, session); }
  revalidatePath("/contacts");
  redirect(value(data, "directory") === "true" ? `/contacts?person=${encodeURIComponent(contactId)}&stateUpdated=1` : `${path}?stateUpdated=1`);
}

export async function toggleContactJourneyAction(data: FormData) {
  const { session, workspace } = await context(); const contactId = value(data, "contactId");
  const updated = await prisma.contactJourney.updateMany({ where: { workspaceId: workspace.id, contactId, version: Number(value(data, "version")) }, data: { automatic: value(data, "automatic") === "true", version: { increment: 1 } } });
  if (!updated.count) failure(`/contacts/${encodeURIComponent(contactId)}`, new JourneyRefusal("The stage changed. Refresh before trying again."), session);
  redirect(`/contacts/${encodeURIComponent(contactId)}?stateUpdated=1`);
}
