import { Prisma, type JourneyEventType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_JOURNEY_STAGES, journeyEventLabel } from "@/lib/journey-types";

type Tx = Prisma.TransactionClient;
export type JourneyEventInput = { workspaceId: string; contactId: string; eventKey: string; eventType: JourneyEventType; source: string; actorUserId?: string; now?: Date; targetStageId?: string; expectedVersion?: number; maintenance?: boolean };

export async function enableJourney(workspaceId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
    const existing = await tx.journeyPreference.findUnique({ where: { workspaceId } });
    if (existing) return tx.journeyPreference.update({ where: { workspaceId }, data: { enabled: true } });
    const stages = await Promise.all(DEFAULT_JOURNEY_STAGES.map((name, position) => tx.journeyStage.create({ data: { workspaceId, name, position } })));
    await tx.journeyRule.createMany({ data: [
      { workspaceId, fromStageId: stages[0].id, toStageId: stages[1].id, eventType: "CONVERSATION_STARTED" },
      { workspaceId, fromStageId: stages[0].id, toStageId: stages[1].id, eventType: "MEETING_SCHEDULED" },
      { workspaceId, fromStageId: stages[0].id, toStageId: stages[2].id, eventType: "SALE_CONFIRMED" },
      { workspaceId, fromStageId: stages[0].id, toStageId: stages[3].id, eventType: "WORK_COMPLETED" },
      { workspaceId, fromStageId: stages[1].id, toStageId: stages[3].id, eventType: "WORK_COMPLETED" },
      { workspaceId, fromStageId: stages[1].id, toStageId: stages[2].id, eventType: "SALE_CONFIRMED" },
      { workspaceId, fromStageId: stages[2].id, toStageId: stages[3].id, eventType: "WORK_COMPLETED" }
    ] });
    return tx.journeyPreference.create({ data: { workspaceId } });
  });
}

async function changeManagedPlan(tx: Tx, input: JourneyEventInput, previousAssignmentId: string | null, targetPlanId: string | null, now: Date) {
  const previous = previousAssignmentId ? await tx.mixAssignment.findFirst({ where: { id: previousAssignmentId, workspaceId: input.workspaceId, contactId: input.contactId } }) : null;
  if (previous && previous.mixId === targetPlanId && previous.isActive) return previous.id;
  if (previous?.isActive) {
    await tx.mixAssignment.update({ where: { id: previous.id }, data: { isActive: false } });
    await tx.mixStop.upsert({ where: { workspaceId_mixId_contactId: { workspaceId: input.workspaceId, mixId: previous.mixId, contactId: input.contactId } }, create: { workspaceId: input.workspaceId, mixId: previous.mixId, contactId: input.contactId, reason: "journey.stage.exit" }, update: {} });
    await tx.jump.updateMany({ where: { workspaceId: input.workspaceId, contactId: input.contactId, mixId: previous.mixId, status: "PENDING" }, data: { status: "CANCELED", completionMethod: "journey_stage_changed" } });
  }
  if (!targetPlanId) return null;
  const [plan, state, stop, assignment] = await Promise.all([
    tx.mix.findFirst({ where: { id: targetPlanId, workspaceId: input.workspaceId, status: "ACTIVE", triggerMode: "MANUAL_START", source: { not: "ONE_TIME" } } }),
    tx.contactRelationshipState.findUnique({ where: { contactId: input.contactId } }),
    tx.mixStop.findUnique({ where: { workspaceId_mixId_contactId: { workspaceId: input.workspaceId, mixId: targetPlanId, contactId: input.contactId } } }),
    tx.mixAssignment.findFirst({ where: { workspaceId: input.workspaceId, mixId: targetPlanId, contactId: input.contactId, isActive: true } })
  ]);
  // Never take over an independently assigned plan, resume a manual stop, or bypass DNC.
  if (!plan || state?.doNotContact || assignment?.isActive || (stop && stop.reason !== "journey.stage.exit")) return null;
  if (stop) await tx.mixStop.delete({ where: { id: stop.id } });
  const created = await tx.mixAssignment.upsert({
    where: { assignmentKey: `${input.workspaceId}:${targetPlanId}:${input.contactId}` },
    create: { workspaceId: input.workspaceId, contactId: input.contactId, mixId: targetPlanId, assignmentKey: `${input.workspaceId}:${targetPlanId}:${input.contactId}`, startDate: now, isActive: true },
    update: { startDate: now, isActive: true }
  });
  await tx.job.create({ data: { workspaceId: input.workspaceId, task: "generate-jumps", payload: { contactId: input.contactId, mixId: targetPlanId } } });
  return created.id;
}

// The caller may include this in its own transaction, so an event and its business
// action either both commit or neither does. One contact lock serializes transitions.
export async function applyJourneyEvent(tx: Tx, input: JourneyEventInput) {
  const now = input.now ?? new Date();
  await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${input.workspaceId} FOR NO KEY UPDATE`;
  const contacts = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Contact" WHERE id = ${input.contactId} AND "workspaceId" = ${input.workspaceId} AND "archivedAt" IS NULL FOR NO KEY UPDATE`;
  if (!contacts.length) throw new Error("Contact not found.");
  const duplicate = await tx.journeyEvent.findUnique({ where: { workspaceId_eventKey: { workspaceId: input.workspaceId, eventKey: input.eventKey } } });
  if (duplicate) {
    if (duplicate.contactId !== input.contactId || duplicate.eventType !== input.eventType) throw new Error("That event identifier was already used for a different event.");
    return { stageId: duplicate.resultingStageId, changed: false, duplicate: true };
  }
  const preference = await tx.journeyPreference.findUnique({ where: { workspaceId: input.workspaceId } });
  const current = await tx.contactJourney.findUnique({ where: { contactId: input.contactId }, include: { stage: true } });
  if (input.expectedVersion !== undefined && input.expectedVersion !== (current?.version ?? 0)) throw new Error("This customer’s stage changed. Refresh before trying again.");
  if (input.eventType === "MANUAL" && !input.targetStageId) throw new Error("Choose a destination stage.");
  let targetId = input.eventType === "MANUAL" ? input.targetStageId : undefined;
  if (!targetId && preference?.enabled && (!current || current.automatic)) {
    if (!current) {
      const first = await tx.journeyStage.findFirst({ where: { workspaceId: input.workspaceId, isActive: true }, orderBy: [{ position: "asc" }, { id: "asc" }] });
      if (first) {
        // An existing person joins only through an explicit event or manual choice;
        // background initialization is limited to contacts created after enablement.
        targetId = first.id;
        if (input.eventType !== "TIME_IN_STAGE" && input.eventType !== "PLAN_COMPLETED") {
          const initialRule = await tx.journeyRule.findFirst({ where: { workspaceId: input.workspaceId, fromStageId: first.id, eventType: input.eventType, enabled: true, toStage: { isActive: true } } });
          if (initialRule) targetId = initialRule.toStageId;
        }
      }
    } else {
      const rule = await tx.journeyRule.findFirst({ where: { workspaceId: input.workspaceId, fromStageId: current.stageId, eventType: input.eventType, enabled: true, toStage: { isActive: true } } });
      if (rule && (input.eventType !== "TIME_IN_STAGE" || (rule.afterDays !== null && now.getTime() - current.stageSince.getTime() >= rule.afterDays * 86_400_000))) targetId = rule.toStageId;
    }
  }
  const target = targetId ? await tx.journeyStage.findFirst({ where: { id: targetId, workspaceId: input.workspaceId, isActive: true } }) : null;
  if (targetId && !target) throw new Error("Choose an available stage in this business.");
  const changed = Boolean(target && target.id !== current?.stageId);
  if (target && changed) {
    const managedAssignmentId = await changeManagedPlan(tx, input, current?.managedAssignmentId ?? null, target.planId, now);
    await tx.contactJourney.upsert({ where: { contactId: input.contactId }, create: { workspaceId: input.workspaceId, contactId: input.contactId, stageId: target.id, stageSince: now, managedAssignmentId }, update: { stageId: target.id, stageSince: now, lastCheckedAt: now, managedAssignmentId, version: { increment: 1 } } });
    await tx.contactActivity.create({ data: { workspaceId: input.workspaceId, contactId: input.contactId, actorUserId: input.actorUserId, kind: "SYSTEM", visibility: "WORKSPACE", summary: `${current ? `${current.stage.name} → ` : "Joined "}${target.name}. ${journeyEventLabel(input.eventType)}${input.eventType === "MANUAL" ? " by you" : ` · ${input.source}`}.${managedAssignmentId ? " The stage’s follow-up mix is assigned." : ""}`, metadata: { eventType: input.eventType, previousStageId: current?.stageId ?? null, stageId: target.id, source: input.source } } });
  }
  // A worker may have selected this person just before a pause or rule edit.
  // Leave a no-op retryable so resume and a later due time still work.
  if (input.maintenance && !changed) return { stageId: current?.stageId ?? null, changed: false, duplicate: false };
  await tx.journeyEvent.create({ data: { workspaceId: input.workspaceId, contactId: input.contactId, eventKey: input.eventKey, eventType: input.eventType, source: input.source, resultingStageId: target?.id ?? current?.stageId ?? null, occurredAt: now } });
  return { stageId: target?.id ?? current?.stageId ?? null, changed, duplicate: false };
}

export function recordJourneyEvent(input: JourneyEventInput) { return prisma.$transaction(tx => applyJourneyEvent(tx, input), { timeout: 15_000 }); }

export async function runJourneyMaintenance({ now = new Date(), limit = 25 }: { now?: Date; limit?: number } = {}) {
  let initialized = 0; let advanced = 0;
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const fresh = await prisma.$queryRaw<Array<{ id: string; workspaceId: string }>>`SELECT c.id, c."workspaceId" FROM "Contact" c JOIN "JourneyPreference" p ON p."workspaceId" = c."workspaceId" LEFT JOIN "ContactJourney" j ON j."contactId" = c.id WHERE p.enabled = true AND c."archivedAt" IS NULL AND j."contactId" IS NULL AND c."createdAt" >= p."enabledAt" AND EXISTS (SELECT 1 FROM "JourneyStage" s WHERE s."workspaceId" = c."workspaceId" AND s."isActive" = true) ORDER BY c."createdAt", c.id LIMIT ${safeLimit}`;
  for (const contact of fresh) {
    const result = await recordJourneyEvent({ workspaceId: contact.workspaceId, contactId: contact.id, eventType: "CONTACT_RECEIVED", eventKey: `journey-new:${contact.id}`, source: "New contact", now, maintenance: true });
    if (result.changed) initialized++;
  }
  const due = await prisma.contactJourney.findMany({ where: { automatic: true, contact: { archivedAt: null }, workspace: { journeyPreference: { enabled: true } }, stage: { outgoingRules: { some: { enabled: true, eventType: { in: ["TIME_IN_STAGE", "PLAN_COMPLETED"] } } } } }, include: { stage: { include: { outgoingRules: { where: { enabled: true } } } } }, orderBy: [{ lastCheckedAt: "asc" }, { contactId: "asc" }], take: safeLimit });
  for (const person of due) {
    await prisma.contactJourney.updateMany({ where: { contactId: person.contactId, version: person.version }, data: { lastCheckedAt: now } });
    const timer = person.stage.outgoingRules.find(rule => rule.eventType === "TIME_IN_STAGE" && rule.afterDays !== null && now.getTime() - person.stageSince.getTime() >= rule.afterDays * 86_400_000);
    let eventType: JourneyEventType | null = timer ? "TIME_IN_STAGE" : null;
    if (!eventType && person.managedAssignmentId && person.stage.outgoingRules.some(rule => rule.eventType === "PLAN_COMPLETED")) {
      const assignment = await prisma.mixAssignment.findFirst({ where: { id: person.managedAssignmentId, workspaceId: person.workspaceId, contactId: person.contactId, isActive: true } });
      if (!assignment) continue;
      const stop = await prisma.mixStop.findUnique({ where: { workspaceId_mixId_contactId: { workspaceId: person.workspaceId, mixId: assignment.mixId, contactId: person.contactId } } });
      if (stop) continue;
      const [steps, completed] = await Promise.all([
        prisma.mixStep.findMany({ where: { mixId: assignment.mixId, isActive: true }, select: { id: true } }),
        prisma.jump.findMany({ where: { workspaceId: person.workspaceId, contactId: person.contactId, mixId: assignment.mixId, status: { in: ["DONE", "SKIPPED"] }, completedAt: { gte: person.stageSince } }, distinct: ["mixStepId"], select: { mixStepId: true } })
      ]);
      if (steps.length && steps.every(step => completed.some(jump => jump.mixStepId === step.id))) eventType = "PLAN_COMPLETED";
    }
    if (!eventType) continue;
    try {
      const result = await recordJourneyEvent({ workspaceId: person.workspaceId, contactId: person.contactId, eventType, eventKey: `journey:${person.contactId}:${person.version}:${eventType}`, expectedVersion: person.version, maintenance: true, source: eventType === "TIME_IN_STAGE" ? "Time in stage" : "Follow-up mix", now });
      if (result.changed) advanced++;
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("stage changed"))) throw error;
    }
  }
  return { initialized, advanced };
}
