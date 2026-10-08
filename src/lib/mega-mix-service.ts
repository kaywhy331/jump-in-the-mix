import { tailorMegaMix, validateJourneySetup, type JourneySetupValues } from "@/lib/journey-preferences";
import { saveJourneySetup } from "@/lib/journey-preference-service";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { megaMixById, megaMixConfiguration, megaMixStageOf } from "@/lib/mega-mixes";
import { addStageLabels } from "@/lib/mix-stage";
import { readWorkflowDefinition, saveWorkflowConfiguration, workflowJson } from "@/lib/mix-workflow";
import { availableMegaMixName, cleanMegaMixName } from "@/lib/mega-mix-pipeline-service";
import { activeMixLimitRefusal } from "@/lib/plan-limits";
import { UserFacingError } from "@/lib/user-facing-error";

export async function installMegaMix(input: {
  workspaceId: string; actorUserId: string; blueprintId: string; expectedVersion: number;
  /** The Mega-Mix name; the ready-made name (numbered if taken) when omitted. */
  name?: string;
  setup?: JourneySetupValues;
  /** Add the Mega-Mix's stage labels to Contact stages and let its Mixes set them (JITM-09 §2.79, P8). */
  addStages?: boolean;
  onboarding?: { timezone: string; company: string; smsSignature: string; userName: string };
}) {
  const original = megaMixById(input.blueprintId);
  if (input.setup) { const error = validateJourneySetup(input.setup); if (error) throw new UserFacingError(error); }
  const blueprint = original && input.setup ? tailorMegaMix(original, input.setup) : original;
  if (!blueprint || blueprint.version !== input.expectedVersion) throw new UserFacingError("This Mega-Mix has changed. Reload its preview before adding it.");
  return prisma.$transaction(async db => {
    // Share the Journey writer lock: concurrent installs/edits must merge the latest graph.
    await db.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${input.workspaceId} FOR UPDATE`;
    const owner = await db.workspace.findFirst({ where: { id: input.workspaceId, ownerId: input.actorUserId }, select: { id: true } });
    if (!owner) throw new UserFacingError("This workspace is unavailable.");
    const finishOnboarding = async () => {
      if (input.onboarding) {
        const setup = input.onboarding;
        const profile = { industry: blueprint.industry, company: setup.company || null, smsSignature: setup.smsSignature,
          primaryGoal: `${blueprint.name} Mega-Mix`, onboardingStep: 5, onboardingDone: true, useCases: ["business"] };
        await db.workspaceProfile.upsert({ where: { workspaceId: input.workspaceId }, create: { workspaceId: input.workspaceId, ...profile, emailSignature: setup.userName }, update: profile });
        await db.userPreference.upsert({ where: { userId: input.actorUserId }, create: { userId: input.actorUserId, timezone: setup.timezone }, update: { timezone: setup.timezone } });
        if (setup.company) await db.workspace.update({ where: { id: input.workspaceId }, data: { name: setup.company } });
      }
    };
    const existing = await db.megaMixInstallation.findUnique({ where: { workspaceId_blueprintId: { workspaceId: input.workspaceId, blueprintId: blueprint.id } } });
    if (existing) { await finishOnboarding(); return { id: existing.id, repeated: true, mixIds: existing.mixIds as Record<string, string> }; }
    // The whole Mega-Mix takes one place among the plan's active Mixes.
    const limit = await activeMixLimitRefusal(input.workspaceId, { newUnits: 1 }, db);
    if (limit) throw new UserFacingError(limit);

    if (input.setup) await saveJourneySetup(db, input.workspaceId, input.actorUserId, input.setup);
    // Labels first, so each Mix is created naming its stage. Adding them starts no one (§2.43).
    const stageIds = input.addStages && blueprint.stages.length ? await addStageLabels(db, input.workspaceId, blueprint.stages.map(stage => stage.name)) : null;
    const id = randomUUID(), mixIds: Record<string, string> = {};
    for (const node of blueprint.nodes) {
      const mix = await db.mix.create({ data: {
        workspaceId: input.workspaceId, name: node.name, description: node.purpose,
        industry: blueprint.industry, category: "Customer journey", framework: "Mega-mix",
        triggerMode: "MANUAL_START", status: "ACTIVE", source: `MEGA_MIX:${blueprint.id}:${node.key}`,
        durationDays: Math.max(...node.steps.map(step => step.dayOffset)), includeFutureGroupMembers: false,
        stageId: stageIds?.get(megaMixStageOf(blueprint, node.key) ?? "") ?? null
      } });
      mixIds[node.key] = mix.id;
      for (const [index, step] of node.steps.entries()) {
        const template = await db.stepTemplate.create({ data: {
          workspaceId: input.workspaceId, name: step.name, channel: step.channel, isActive: false,
          versions: { create: { version: 1, subject: step.subject, body: step.body, script: step.script } }
        }, include: { versions: true } });
        await db.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id,
          dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes, sortOrder: index + 1 } });
      }
    }
    const current = await readWorkflowDefinition(db, input.workspaceId);
    const addition = megaMixConfiguration(blueprint, mixIds, id);
    await saveWorkflowConfiguration(db, input.workspaceId, {
      rules: [...current.rules, ...addition.rules], gatedStepIds: current.gatedStepIds,
      intentionalEnds: [...current.intentionalEnds, ...addition.intentionalEnds]
    }, current.revision, input.actorUserId);
    await db.megaMixInstallation.create({ data: { id, workspaceId: input.workspaceId, blueprintId: blueprint.id, version: blueprint.version, mixIds: workflowJson(mixIds) } });
    const name = await availableMegaMixName(db, input.workspaceId, input.name?.trim() ? cleanMegaMixName(input.name) : blueprint.name);
    await db.megaMixPipeline.create({ data: { id, workspaceId: input.workspaceId, name, description: blueprint.description, origin: `BLUEPRINT:${blueprint.id}`, createdById: input.actorUserId,
      members: { create: blueprint.nodes.map((node, position) => ({ mixId: mixIds[node.key], position })) } } });
    await db.auditLog.create({ data: { workspaceId: input.workspaceId, actorType: "USER", actorUserId: input.actorUserId,
      action: "mega-mix.install", entityType: "MegaMixInstallation", entityId: id, source: input.onboarding ? "onboarding" : "templates.journeys",
      metadata: { blueprintId: blueprint.id, version: blueprint.version, mixCount: blueprint.nodes.length, enrolledContacts: 0, stageLabels: stageIds ? [...stageIds.keys()] : [] } } });
    await finishOnboarding();
    // No assignment or workflow instance is created by installation. Starting people is explicit.
    return { id, repeated: false, mixIds };
  }, { timeout: 30_000 });
}
