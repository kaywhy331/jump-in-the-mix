"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { JourneyEventType } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { enableJourney, recordJourneyEvent } from "@/lib/journey";
import { JOURNEY_EVENTS, type JourneyRuleFormState } from "@/lib/journey-types";
import { configureJourneyRule, JourneyConfigurationError, JourneyRuleConflict } from "@/lib/journey-configuration";
import { prisma } from "@/lib/prisma";

const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
async function context() { const ctx = await requireWorkspace(); if (ctx.impersonation) throw new Error("Support sessions are view-only."); return ctx; }
function failure(path: string, error: unknown): never { redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "The change could not be saved.")}`); }

export async function setJourneyEnabledAction(data: FormData) {
  const { workspace, user } = await context();
  if (value(data, "enabled") === "true") await enableJourney(workspace.id);
  else await prisma.journeyPreference.updateMany({ where: { workspaceId: workspace.id }, data: { enabled: false } });
  await prisma.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "journey.automation", entityType: "JourneyPreference", entityId: workspace.id, source: "settings.journey", afterData: { enabled: value(data, "enabled") === "true" } } });
  redirect("/settings/journey?saved=1");
}

export async function saveJourneyStageAction(data: FormData) {
  const { workspace, user } = await context();
  const id = value(data, "stageId"); const name = value(data, "name"); const planId = value(data, "planId") || null;
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR NO KEY UPDATE`;
      const stages = await tx.journeyStage.findMany({ where: { workspaceId: workspace.id }, include: { _count: { select: { contacts: true } } } });
      const stage = stages.find(item => item.id === id);
      if (id && !stage) throw new Error("Stage not found.");
      await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "journey.stage.configure", entityType: "JourneyStage", entityId: id || workspace.id, source: "settings.journey", afterData: { intent: value(data, "intent"), name, planId } } });
      if (["earlier", "later"].includes(value(data, "intent"))) {
        const ordered = stages.filter(item => item.isActive).sort((a,b) => a.position-b.position || a.id.localeCompare(b.id));
        const index = ordered.findIndex(item => item.id === id);
        const neighbor = ordered[index + (value(data, "intent") === "earlier" ? -1 : 1)];
        if (!stage || !neighbor) throw new Error("This stage cannot move further in that direction.");
        await tx.journeyStage.update({ where: { id }, data: { position: neighbor.position } });
        await tx.journeyStage.update({ where: { id: neighbor.id }, data: { position: stage.position } });
        return;
      }
      if (value(data, "intent") === "archive") {
        if (!stage || stage._count.contacts) throw new Error("Move the people in this stage before retiring it.");
        if (stages.filter(item => item.isActive).length <= 1) throw new Error("Keep at least one stage.");
        await tx.journeyStage.update({ where: { id }, data: { isActive: false } });
        await tx.journeyRule.updateMany({ where: { workspaceId: workspace.id, OR: [{ fromStageId: id }, { toStageId: id }] }, data: { enabled: false } });
        return;
      }
      if (!name || name.length > 60) throw new Error("Use a stage name between 1 and 60 characters.");
      if (stages.some(item => item.name.toLowerCase() === name.toLowerCase() && item.id !== id)) throw new Error("Give each stage a different name.");
      if (!id && stages.length >= 20) throw new Error("A journey can have up to 20 stages.");
      if (planId && !await tx.mix.findFirst({ where: { id: planId, workspaceId: workspace.id, status: "ACTIVE", triggerMode: "MANUAL_START", source: { not: "ONE_TIME" } } })) throw new Error("Choose an active mix that starts for each person.");
      if (stage) await tx.journeyStage.update({ where: { id }, data: { name, planId, isActive: true } });
      else await tx.journeyStage.create({ data: { workspaceId: workspace.id, name, planId, position: Math.max(-1, ...stages.map(item => item.position)) + 1 } });
    });
  } catch (error) { failure("/settings/journey", error); }
  redirect("/settings/journey?saved=1");
}

async function submitJourneyRule(data: FormData): Promise<JourneyRuleFormState> {
  const { workspace, user } = await context();
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
  const state = await submitJourneyRule(data);
  redirect(`/settings/journey?${state.saved ? "saved=1" : `error=${encodeURIComponent(state.error)}`}&stage=${encodeURIComponent(value(data, "fromStageId"))}#stage-${encodeURIComponent(value(data, "fromStageId"))}`);
}

export async function saveJourneyRuleFormAction(_state: JourneyRuleFormState, data: FormData): Promise<JourneyRuleFormState> {
  return submitJourneyRule(data);
}

export async function changeContactJourneyAction(data: FormData) {
  const { workspace, user } = await context(); const contactId = value(data, "contactId");
  const path = `/contacts/${encodeURIComponent(contactId)}`;
  try {
    const eventType = value(data, "eventType") || "MANUAL";
    if (eventType !== "MANUAL" && !JOURNEY_EVENTS.some(item => item.value === eventType && !["TIME_IN_STAGE", "PLAN_COMPLETED", "CONTACT_RECEIVED"].includes(item.value))) throw new Error("Choose a business milestone.");
    await recordJourneyEvent({ workspaceId: workspace.id, contactId, eventType: eventType as JourneyEventType, eventKey: `manual:${value(data, "requestId") || randomUUID()}`, source: "Recorded by you", actorUserId: user.id, targetStageId: value(data, "stageId"), expectedVersion: Number(value(data, "version") || 0) });
  } catch (error) { failure(path, error); }
  redirect(`${path}?stateUpdated=1`);
}

export async function toggleContactJourneyAction(data: FormData) {
  const { workspace } = await context(); const contactId = value(data, "contactId");
  const updated = await prisma.contactJourney.updateMany({ where: { workspaceId: workspace.id, contactId, version: Number(value(data, "version")) }, data: { automatic: value(data, "automatic") === "true", version: { increment: 1 } } });
  if (!updated.count) failure(`/contacts/${encodeURIComponent(contactId)}`, new Error("The stage changed. Refresh before trying again."));
  redirect(`/contacts/${encodeURIComponent(contactId)}?stateUpdated=1`);
}
