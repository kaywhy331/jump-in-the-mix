import { Prisma, type JourneyEventType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_JOURNEY_STAGES, journeyEventLabel } from "@/lib/journey-types";
import { UserFacingError } from "@/lib/user-facing-error";

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
    // Only the journey's own enrollment ends here. A follow-up bound to one of the person's
    // appointments belongs to that appointment and is left alone.
    await tx.jump.updateMany({ where: { workspaceId: input.workspaceId, contactId: input.contactId, mixId: previous.mixId, status: "PENDING", appointmentBindingId: null }, data: { status: "CANCELED", completionMethod: "journey_stage_changed" } });
  }
  if (!targetPlanId) return null;
  const [plan, state, stop, assignment] = await Promise.all([
    tx.mix.findFirst({ where: { id: targetPlanId, workspaceId: input.workspaceId, status: "ACTIVE", triggerMode: "MANUAL_START", source: { not: "ONE_TIME" } } }),
    tx.contactRelationshipState.findUnique({ where: { contactId: input.contactId } }),
    tx.mixStop.findUnique({ where: { workspaceId_mixId_contactId: { workspaceId: input.workspaceId, mixId: targetPlanId, contactId: input.contactId } } }),
    tx.mixAssignment.findFirst({ where: { workspaceId: input.workspaceId, mixId: targetPlanId, contactId: input.contactId, isActive: true, appointmentBinding: null } })
  ]);
  // Never take over an independently assigned plan, resume a manual stop, or bypass DNC. An
  // enrollment scoped to an appointment is not the plan running on its own; both proceed.
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

/** The stage someone with no stage yet joins on this event: the first active stage, or where its switched-on rule for the event leads. */
async function initialStageId(db: Pick<Tx, "journeyStage" | "journeyRule">, workspaceId: string, eventType: JourneyEventType): Promise<string | undefined> {
  const first = await db.journeyStage.findFirst({ where: { workspaceId, isActive: true }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  if (!first) return undefined;
  if (eventType === "TIME_IN_STAGE" || eventType === "PLAN_COMPLETED") return first.id;
  const initialRule = await db.journeyRule.findFirst({ where: { workspaceId, fromStageId: first.id, eventType, enabled: true, toStage: { isActive: true } } });
  return initialRule?.toStageId ?? first.id;
}

/**
 * The Contact stage a newly added person joins, and the Mix that stage starts for them, if any. It is what the "Contact
 * received" event does on Add a contact and Quick Add, and what the worker's stage pass does minutes later for imported
 * and phone contacts. The New contacts Mix is not added on top of that Mix by default (JITM-09 §2.78).
 */
export async function newContactStage(db: Pick<Tx, "journeyPreference" | "journeyStage" | "journeyRule" | "mix">, workspaceId: string): Promise<{ name: string; mix: { id: string; name: string } | null } | null> {
  const preference = await db.journeyPreference.findUnique({ where: { workspaceId }, select: { enabled: true } });
  if (!preference?.enabled) return null;
  const stageId = await initialStageId(db, workspaceId, "CONTACT_RECEIVED");
  const stage = stageId ? await db.journeyStage.findFirst({ where: { id: stageId, workspaceId, isActive: true }, select: { name: true, planId: true } }) : null;
  if (!stage) return null;
  // The same Mixes changeManagedPlan starts: on, started when the owner starts them, and not one-time.
  const mix = stage.planId ? await db.mix.findFirst({ where: { id: stage.planId, workspaceId, status: "ACTIVE", triggerMode: "MANUAL_START", source: { not: "ONE_TIME" } }, select: { id: true, name: true } }) : null;
  return { name: stage.name, mix };
}

/**
 * `changeManagedPlan` for people joining their first stage, with no Mix of a stage before it, in a few statements for
 * any number of people. The same rules: never take over a plan running on its own, resume a manual stop, or bypass
 * Do not contact. Returns each started person's assignment.
 */
async function startArrivalPlan(tx: Tx, workspaceId: string, contactIds: readonly string[], planId: string, now: Date): Promise<Map<string, string>> {
  const plan = await tx.mix.findFirst({ where: { id: planId, workspaceId, status: "ACTIVE", triggerMode: "MANUAL_START", source: { not: "ONE_TIME" } }, select: { id: true } });
  if (!plan) return new Map();
  const ids = [...contactIds];
  const [restricted, stops, running] = await Promise.all([
    tx.contactRelationshipState.findMany({ where: { contactId: { in: ids }, doNotContact: true }, select: { contactId: true } }),
    tx.mixStop.findMany({ where: { workspaceId, mixId: planId, contactId: { in: ids } }, select: { id: true, contactId: true, reason: true } }),
    tx.mixAssignment.findMany({ where: { workspaceId, mixId: planId, contactId: { in: ids }, isActive: true, appointmentBinding: null }, select: { contactId: true } })
  ]);
  const skip = new Set([...restricted.map(row => row.contactId), ...running.flatMap(row => row.contactId ? [row.contactId] : []), ...stops.filter(stop => stop.reason !== "journey.stage.exit").map(stop => stop.contactId)]);
  const people = ids.filter(id => !skip.has(id));
  if (!people.length) return new Map();
  const starting = new Set(people);
  const exits = stops.filter(stop => starting.has(stop.contactId)).map(stop => stop.id);
  if (exits.length) await tx.mixStop.deleteMany({ where: { id: { in: exits } } });
  const keys = people.map(contactId => `${workspaceId}:${planId}:${contactId}`);
  await tx.mixAssignment.updateMany({ where: { assignmentKey: { in: keys } }, data: { startDate: now, isActive: true } });
  await tx.mixAssignment.createMany({ data: people.map((contactId, index) => ({ workspaceId, contactId, mixId: planId, assignmentKey: keys[index], startDate: now, isActive: true })), skipDuplicates: true });
  const assignments = await tx.mixAssignment.findMany({ where: { assignmentKey: { in: keys } }, select: { id: true, contactId: true } });
  await tx.job.createMany({ data: people.map(contactId => ({ workspaceId, task: "generate-jumps", payload: { contactId, mixId: planId } })) });
  return new Map(assignments.flatMap(assignment => assignment.contactId ? [[assignment.contactId, assignment.id] as const] : []));
}

/**
 * Puts people who are waiting for the worker's stage pass into the stage new people join, as the pass would and with
 * its event key, because a Mix is about to set their stage in this transaction (JITM-09 §2.78–§2.79). Otherwise the
 * Mix's stage would come first, the pass would skip them, and the stage new people join, with its Mix, would never
 * start. Only people the pass would take: added after Contact stages were turned on, with no stage and no arrival
 * event yet. The caller holds their row locks and has checked that automatic transitions are on. Returns who joined.
 */
export async function joinArrivalStage(tx: Tx, input: { workspaceId: string; contactIds: readonly string[]; enabledAt: Date; now: Date }): Promise<string[]> {
  const { workspaceId, now } = input;
  if (!input.contactIds.length) return [];
  const waiting = await tx.contact.findMany({ where: { workspaceId, id: { in: [...input.contactIds] }, archivedAt: null, createdAt: { gte: input.enabledAt }, journey: null }, select: { id: true }, orderBy: { id: "asc" } });
  if (!waiting.length) return [];
  const recorded = new Set((await tx.journeyEvent.findMany({ where: { workspaceId, eventKey: { in: waiting.map(contact => `journey-new:${contact.id}`) } }, select: { contactId: true } })).map(event => event.contactId));
  const people = waiting.map(contact => contact.id).filter(id => !recorded.has(id));
  const stageId = people.length ? await initialStageId(tx, workspaceId, "CONTACT_RECEIVED") : undefined;
  // Shared so the stage can't be retired underneath, as for the stage the Mix sets.
  const [stage] = stageId ? await tx.$queryRaw<Array<{ id: string; name: string; planId: string | null }>>`SELECT id, name, "planId" FROM "JourneyStage" WHERE id = ${stageId} AND "workspaceId" = ${workspaceId} AND "isActive" FOR SHARE` : [];
  if (!stage) return [];
  // In a few statements whatever the number of people, so a bulk action on a fresh import fits its transaction (PERF-01).
  const managed = stage.planId ? await startArrivalPlan(tx, workspaceId, people, stage.planId, now) : new Map<string, string>();
  const eventType = "CONTACT_RECEIVED" as const; const source = "New contact";
  await tx.contactJourney.createMany({ data: people.map(contactId => ({ workspaceId, contactId, stageId: stage.id, stageSince: now, lastCheckedAt: now, managedAssignmentId: managed.get(contactId) ?? null })) });
  await tx.contactActivity.createMany({ data: people.map(contactId => ({
    workspaceId, contactId, kind: "SYSTEM" as const, visibility: "WORKSPACE" as const,
    summary: `Joined ${stage.name}. ${journeyEventLabel(eventType)} · ${source}.${managed.has(contactId) ? " The stage’s follow-up Mix is assigned." : ""}`,
    metadata: { eventType, previousStageId: null, stageId: stage.id, source }
  })) });
  await tx.journeyEvent.createMany({ data: people.map(contactId => ({ workspaceId, contactId, eventKey: `journey-new:${contactId}`, eventType, source, resultingStageId: stage.id, occurredAt: now })) });
  return people;
}

/** Another change moved this customer's stage first; the maintenance pass skips it and a person sees the sentence. */
export class JourneyStageChanged extends UserFacingError {
  constructor() { super("This customer’s stage changed. Refresh before trying again."); }
}

// The caller may include this in its own transaction, so an event and its business
// action either both commit or neither does. One contact lock serializes transitions.
export async function applyJourneyEvent(tx: Tx, input: JourneyEventInput) {
  const now = input.now ?? new Date();
  await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${input.workspaceId} FOR NO KEY UPDATE`;
  const contacts = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Contact" WHERE id = ${input.contactId} AND "workspaceId" = ${input.workspaceId} AND "archivedAt" IS NULL FOR NO KEY UPDATE`;
  if (!contacts.length) throw new UserFacingError("Contact not found.");
  const duplicate = await tx.journeyEvent.findUnique({ where: { workspaceId_eventKey: { workspaceId: input.workspaceId, eventKey: input.eventKey } } });
  if (duplicate) {
    if (duplicate.contactId !== input.contactId || duplicate.eventType !== input.eventType) throw new UserFacingError("That event identifier was already used for a different event.");
    return { stageId: duplicate.resultingStageId, changed: false, duplicate: true };
  }
  const preference = await tx.journeyPreference.findUnique({ where: { workspaceId: input.workspaceId } });
  const current = await tx.contactJourney.findUnique({ where: { contactId: input.contactId }, include: { stage: true } });
  if (input.expectedVersion !== undefined && input.expectedVersion !== (current?.version ?? 0)) throw new JourneyStageChanged();
  if (input.eventType === "MANUAL" && !input.targetStageId) throw new UserFacingError("Choose a destination stage.");
  let targetId = input.eventType === "MANUAL" ? input.targetStageId : undefined;
  if (!targetId && preference?.enabled && (!current || current.automatic)) {
    if (!current) {
      // An existing person joins only through an explicit event or manual choice;
      // background initialization is limited to contacts created after enablement.
      targetId = await initialStageId(tx, input.workspaceId, input.eventType);
    } else {
      const rule = await tx.journeyRule.findFirst({ where: { workspaceId: input.workspaceId, fromStageId: current.stageId, eventType: input.eventType, enabled: true, toStage: { isActive: true } } });
      if (rule && (input.eventType !== "TIME_IN_STAGE" || (rule.afterDays !== null && now.getTime() - current.stageSince.getTime() >= rule.afterDays * 86_400_000))) targetId = rule.toStageId;
    }
  }
  const target = targetId ? await tx.journeyStage.findFirst({ where: { id: targetId, workspaceId: input.workspaceId, isActive: true } }) : null;
  if (targetId && !target) throw new UserFacingError("Choose an available stage in this business.");
  const changed = Boolean(target && target.id !== current?.stageId);
  if (target && changed) {
    const managedAssignmentId = await changeManagedPlan(tx, input, current?.managedAssignmentId ?? null, target.planId, now);
    await tx.contactJourney.upsert({ where: { contactId: input.contactId }, create: { workspaceId: input.workspaceId, contactId: input.contactId, stageId: target.id, stageSince: now, managedAssignmentId }, update: { stageId: target.id, stageSince: now, lastCheckedAt: now, managedAssignmentId, version: { increment: 1 } } });
    await tx.contactActivity.create({ data: { workspaceId: input.workspaceId, contactId: input.contactId, actorUserId: input.actorUserId, kind: "SYSTEM", visibility: "WORKSPACE", summary: `${current ? `${current.stage.name} → ` : "Joined "}${target.name}. ${journeyEventLabel(input.eventType)}${input.eventType === "MANUAL" ? " by you" : ` · ${input.source}`}.${managedAssignmentId ? " The stage’s follow-up Mix is assigned." : ""}`, metadata: { eventType: input.eventType, previousStageId: current?.stageId ?? null, stageId: target.id, source: input.source } } });
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
        prisma.jump.findMany({ where: { workspaceId: person.workspaceId, contactId: person.contactId, mixId: assignment.mixId, appointmentBindingId: null, status: { in: ["DONE", "SKIPPED"] }, completedAt: { gte: person.stageSince } }, distinct: ["mixStepId"], select: { mixStepId: true } })
      ]);
      if (steps.length && steps.every(step => completed.some(jump => jump.mixStepId === step.id))) eventType = "PLAN_COMPLETED";
    }
    if (!eventType) continue;
    try {
      const result = await recordJourneyEvent({ workspaceId: person.workspaceId, contactId: person.contactId, eventType, eventKey: `journey:${person.contactId}:${person.version}:${eventType}`, expectedVersion: person.version, maintenance: true, source: eventType === "TIME_IN_STAGE" ? "Time in stage" : "Follow-up Mix", now });
      if (result.changed) advanced++;
    } catch (error) {
      if (!(error instanceof JourneyStageChanged)) throw error;
    }
  }
  return { initialized, advanced };
}
