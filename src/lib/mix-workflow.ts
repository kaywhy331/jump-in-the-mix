import { workflowCalendarStepTime } from "@/lib/workflow-scheduling";
import { applyBusinessUpdate, undoBusinessUpdate, workflowFingerprint } from "@/lib/workflow-business-update";
import type { WorkflowBusinessUpdate, WorkflowUpdateRecord } from "@/lib/mix-workflow-types";
import { assertMixStartEligible } from "@/lib/mix-start-eligibility";
import { assertRoomForPeople } from "@/lib/plan-limits";
import { nextJourneyAvailability } from "@/lib/journey-availability";
import { readJourneyPreferences } from "@/lib/journey-preferences";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { workflowConfiguration, validateWorkflow } from "@/lib/mix-workflow-config";
import { advanceWorkflow, observeWorkflow, recordWorkflowDecision, startWorkflow, workflowFinished } from "@/lib/mix-workflow-engine";
import { emptyWorkflow, type WorkflowConfiguration, type WorkflowDefinition, type WorkflowState } from "@/lib/mix-workflow-types";
import { renderJumpSnapshot } from "@/lib/jump-render";
import { variantTemplatesOf } from "@/lib/preparation-variants";
import { addLogicalDays, logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { DEFAULT_PERSONAL_SCHEDULING, outsideQuietHours, shiftWeekend } from "@/lib/personal-scheduling";
import { anchoredStepInstant, anchoredStepIsPreparation } from "@/lib/step-timing";
import { UserFacingError } from "@/lib/user-facing-error";
import { reopenEnrollmentRun } from "@/lib/enrollment-workflow";

type DB = Prisma.TransactionClient;
export const workflowJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const workflowState = (value: unknown) => value as WorkflowState;
export const workflowDefinition = (value: unknown) => value as WorkflowDefinition;

export async function readWorkflowDefinition(db: DB, workspaceId: string): Promise<WorkflowDefinition> {
  const [saved, mixes] = await Promise.all([
    db.mixWorkflow.findUnique({ where: { workspaceId } }),
    db.mix.findMany({ where: { workspaceId }, include: { steps: { where: { OR: [{ isActive: true }, { mix: { source: "ONE_TIME" } }] }, orderBy: { sortOrder: "asc" }, include: { stepVersion: { include: { stepTemplate: true, variants: true } } } } }, orderBy: [{ name: "asc" }, { id: "asc" }] })
  ]);
  return { ...workflowConfiguration(saved?.configuration), revision: saved?.revision ?? 0, publishedAt: saved?.updatedAt.toISOString(), mixes: mixes.map(mix => ({
    id: mix.id, name: mix.name, status: mix.status, source: mix.source, triggerMode: mix.triggerMode,
    steps: mix.steps.map(step => ({ id: step.id, versionId: step.stepVersionId, name: step.stepVersion.stepTemplate.name, channel: step.stepVersion.stepTemplate.channel,
      dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes, plannedAt: step.plannedAt?.toISOString() ?? null, anchor: step.anchor, offsetMinutes: step.offsetMinutes,
      subject: step.stepVersion.subject, body: step.stepVersion.body, script: step.stepVersion.script,
      ...(variantTemplatesOf(step.stepVersion.variants) ? { variants: variantTemplatesOf(step.stepVersion.variants) as Record<string, unknown> } : {}) }))
  })) };
}

export async function saveWorkflowConfiguration(db: DB, workspaceId: string, input: unknown, expectedRevision: number, actorUserId: string): Promise<number> {
  await db.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
  const definition = await readWorkflowDefinition(db, workspaceId);
  if (definition.revision !== expectedRevision) throw new UserFacingError("Journey changed in another window. Reload its latest configuration before saving; your draft has been kept.");
  const configuration = workflowConfiguration(input);
  const errors = validateWorkflow(configuration, definition);
  if (errors.length) throw new UserFacingError(errors.join(" "));
  const saved = await db.mixWorkflow.upsert({ where: { workspaceId }, create: { workspaceId, configuration: workflowJson(configuration) }, update: { configuration: workflowJson(configuration), revision: { increment: 1 } } });
  await db.auditLog.create({ data: { workspaceId, actorUserId, actorType: "USER", action: "mix-workflow.configure", entityType: "MixWorkflow", entityId: workspaceId, source: "journey", metadata: { revision: saved.revision, connections: configuration.rules.length } } });
  await db.job.create({ data: { workspaceId, task: "generate-jumps", payload: {} } });
  return saved.revision;
}

/** Record an existing scheduler admission before preparing its Beats. Retries keep its snapshot. */
export async function ensureLegacyWorkflow(input: { workspaceId: string; contactId: string; mixId: string; occurrenceKey: string; startedAt: Date; timezone: string; appointmentBindingId: string | null; definition: WorkflowDefinition; passStartedAt?: Date }) {
  const admissionKey = `legacy:${createHash("sha256").update(`${input.contactId}:${input.mixId}:${input.occurrenceKey}`).digest("hex")}`;
  const state = startWorkflow(input.definition, { mixId: input.mixId, stepId: null }, input.startedAt.toISOString(), true);
  state.context = { timezone: input.timezone, appointmentBindingId: input.appointmentBindingId, occurrenceKey: input.occurrenceKey, completionCutoff: input.definition.publishedAt };
  const known = await prisma.mixWorkflowInstance.findFirst({ where: { workspaceId: input.workspaceId, contactId: input.contactId, OR: [{ admissionKey }, { state: { path: ["context", "admissionAlias"], equals: admissionKey } }] }, orderBy: { createdAt: "asc" } });
  let instance = known ?? await prisma.mixWorkflowInstance.upsert({ where: { workspaceId_admissionKey: { workspaceId: input.workspaceId, admissionKey } },
    create: { workspaceId: input.workspaceId, contactId: input.contactId, admissionKey, label: input.definition.mixes.find(mix => mix.id === input.mixId)?.name ?? "Mix", definition: workflowJson(input.definition), state: workflowJson(state) }, update: {} }).catch(async error => {
      if ((error as { code?: string }).code !== "P2002") throw error;
      return prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { workspaceId_admissionKey: { workspaceId: input.workspaceId, admissionKey } } });
    });
  // An enrollment that ended (Remove from Mix, or Undo of a bulk start) ended this run; a start of the same occurrence
  // since then picks it back up, on the same day too. A pass that began before the end read the old enrollment, so it
  // never does (UNDO-04).
  const ended = workflowState(instance.state).context?.enrollmentEnded;
  if (ended && (!input.passStartedAt || input.passStartedAt.getTime() > Date.parse(ended.at))) instance = await reopenEndedEnrollment(instance.id, input.workspaceId) ?? instance;
  const saved = workflowState(instance.state);
  return { id: instance.id, status: instance.status, legacy: saved.runs[0]?.legacy, runId: saved.runs[0]?.id, visits: saved.visits.filter(visit => visit.runId === saved.runs[0]?.id && !visit.parentTransitionId), mix: workflowDefinition(instance.definition).mixes.find(mix => mix.id === input.mixId)!, gatedStepIds: workflowDefinition(instance.definition).gatedStepIds };
}

/** Puts an ended enrollment's run back under the record's lock; null when someone else already did (src/lib/enrollment-workflow.ts). */
async function reopenEndedEnrollment(instanceId: string, workspaceId: string) {
  return prisma.$transaction(async db => {
    await db.$queryRaw`SELECT id FROM "MixWorkflowInstance" WHERE id = ${instanceId} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
    const current = await db.mixWorkflowInstance.findFirst({ where: { id: instanceId, workspaceId } });
    if (!current) return null;
    const state = workflowState(current.state);
    const status = reopenEnrollmentRun(state, current.status);
    if (!status) return current;
    return db.mixWorkflowInstance.update({ where: { id: instanceId }, data: { status, state: workflowJson(state), revision: { increment: 1 }, nextCheckAt: new Date() } });
  });
}

export async function mergeWorkflowContact(db: DB, workspaceId: string, sourceContactId: string, survivorId: string): Promise<void> {
  const instances = await db.mixWorkflowInstance.findMany({ where: { workspaceId, contactId: sourceContactId } });
  for (const instance of instances) {
    const state = workflowState(instance.state), root = state.runs[0];
    if (state.context?.occurrenceKey && root) state.context.admissionAlias = `legacy:${createHash("sha256").update(`${survivorId}:${root.mixId}:${state.context.occurrenceKey}`).digest("hex")}`;
    for (const run of state.runs) run.legacy = false;
    await db.mixWorkflowInstance.update({ where: { id: instance.id }, data: { contactId: survivorId, state: workflowJson(state), revision: { increment: 1 } } });
    await db.jump.updateMany({ where: { workspaceId, workflowInstanceId: instance.id }, data: { contactId: survivorId, workflowManaged: true } });
  }
}

export async function queueWorkflowForJump(db: DB, workspaceId: string, jumpId: string, decisions?: Array<{ ruleId: string; outcome: string }>, requestId?: string): Promise<void> {
  const jump = await db.jump.findFirst({ where: { id: jumpId, workspaceId }, select: { workflowInstanceId: true, workflowVisitId: true, completedAt: true } });
  if (!jump?.workflowInstanceId) return;
  await db.job.create({ data: { workspaceId, task: "mix-workflow", runAt: new Date(Date.now() + 10_050), payload: { instanceId: jump.workflowInstanceId, ...(decisions?.length ? { decisions, visitId: jump.workflowVisitId, sourceCompletedAt: jump.completedAt?.toISOString(), requestId: requestId ?? jumpId } : {}) } } });
  // The durable job wakes finished instances after Undo without reversing the
  // instance-then-Jump lock order used by the worker.
}

export async function startWorkflowInstance(input: { workspaceId: string; contactId: string; mixId: string; requestId: string; label?: string; expectedDefinitionRevision?: number; now?: Date }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async db => {
    // The plan's lock comes before the contact row's (src/lib/plan-limits.ts).
    await assertRoomForPeople(db, input.workspaceId, [input.contactId]);
    await db.$queryRaw`SELECT id FROM "Contact" WHERE id = ${input.contactId} AND "workspaceId" = ${input.workspaceId} FOR UPDATE`;
    const contact = await db.contact.findFirst({ where: { id: input.contactId, workspaceId: input.workspaceId, archivedAt: null } });
    if (!contact) throw new UserFacingError("Choose a person in this account.");
    const receipt = await db.mixWorkflowInstance.findUnique({ where: { workspaceId_admissionKey: { workspaceId: input.workspaceId, admissionKey: `manual:${input.contactId}:${input.mixId}:${input.requestId}` } } });
    if (receipt) return receipt.id;
    await assertMixStartEligible(db, input.workspaceId, input.contactId, input.mixId);
    const definition = await readWorkflowDefinition(db, input.workspaceId);
    if (input.expectedDefinitionRevision !== undefined && input.expectedDefinitionRevision !== definition.revision) throw new UserFacingError("This Mix changed. Review the current schedule before starting.");
    const mix = definition.mixes.find(item => item.id === input.mixId && item.status === "ACTIVE" && item.source !== "ONE_TIME");
    if (!mix) throw new UserFacingError("Choose an active Mix.");
    const instance = await db.mixWorkflowInstance.upsert({ where: { workspaceId_admissionKey: { workspaceId: input.workspaceId, admissionKey: `manual:${input.contactId}:${input.mixId}:${input.requestId}` } },
      create: { workspaceId: input.workspaceId, contactId: input.contactId, admissionKey: `manual:${input.contactId}:${input.mixId}:${input.requestId}`, label: input.label?.trim().slice(0, 160) || mix.name, definition: workflowJson(definition), state: workflowJson(startWorkflow(definition, { mixId: mix.id, stepId: null }, now.toISOString())), createdAt: now }, update: {} });
    await db.job.create({ data: { workspaceId: input.workspaceId, task: "mix-workflow", payload: { instanceId: instance.id } } });
    return instance.id;
  });
}

export type WorkflowCommand = { retry?: boolean; businessUpdate?: WorkflowBusinessUpdate; undoUpdateId?: string; requestId: string; expectedRevision?: number; calendarEntryId?: string; evaluationId?: string; outcome?: string; visitId?: string; sourceCompletedAt?: string; decisions?: Array<{ ruleId: string; outcome: string }>; status?: "ACTIVE" | "PAUSED" | "STOPPED" };

export async function processWorkflowInstance(workspaceId: string, instanceId: string, now = new Date(), command?: WorkflowCommand): Promise<void> {
  await prisma.$transaction(async db => {
    const identity = await db.mixWorkflowInstance.findFirst({ where: { id: instanceId, workspaceId }, select: { contactId: true } });
    if (!identity) throw new UserFacingError("This piece of work is unavailable.");
    await db.$queryRaw`SELECT id FROM "Contact" WHERE id = ${identity.contactId} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM "MixWorkflowInstance" WHERE id = ${instanceId} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
    const instance = await db.mixWorkflowInstance.findFirst({ where: { id: instanceId, workspaceId }, include: { contact: { include: { emails: true, phones: true, addresses: true, customFieldValues: { include: { definition: true } } } }, workspace: { include: { profile: true, owner: true } } } });
    if (!instance) throw new UserFacingError("This journey instance is unavailable.");
    const state = workflowState(instance.state), definition = workflowDefinition(instance.definition);
    const originalState = JSON.stringify(state);
    if (command && state.commands.includes(command.requestId)) return;
    if (instance.status === "STOPPED" && command) throw new UserFacingError("This instance has stopped. Start a new instance to begin new work.");
    if (command?.expectedRevision !== undefined && command.expectedRevision !== instance.revision) throw new UserFacingError("This person's progress changed. Refresh before changing the decision.");
    const [jumps, currentMixes, stops, restriction, config, preference, display, queuedChoices] = await Promise.all([
      db.jump.findMany({ where: { workspaceId, workflowInstanceId: instanceId } }),
      db.mix.findMany({ where: { workspaceId }, select: { id: true, status: true } }),
      db.mixStop.findMany({ where: { workspaceId, contactId: instance.contactId } }),
      db.contactRelationshipState.findFirst({ where: { workspaceId, contactId: instance.contactId } }),
      db.mixWorkflow.findUnique({ where: { workspaceId } }),
      db.workspacePreference.findUnique({ where: { workspaceId } }),
      db.userPreference.findUnique({ where: { userId: instance.workspace.ownerId } }),
      db.job.findMany({ where: { workspaceId, task: "mix-workflow", completedAt: null, failedAt: null, payload: { path: ["instanceId"], equals: instanceId } }, select: { payload: true }, orderBy: { createdAt: "asc" }, take: 1000 })
    ]);
    const businessRecordedAt = state.pendingBusinessUpdate?.recordedAt ?? now.toISOString();
    if (command?.businessUpdate) applyBusinessUpdate(structuredClone(state), definition, command.businessUpdate, command.requestId, businessRecordedAt);
    const deliveries = await db.automatedDelivery.findMany({ where: { workspaceId, jumpId: { in: jumps.map(jump => jump.id) } } });
    if (state.pendingBusinessUpdate && command) throw new UserFacingError("Your previous update is saved. Wait for the message already being processed before making another change.");
    if (command?.businessUpdate || state.pendingBusinessUpdate) {
      if (deliveries.some(delivery => delivery.status === "PROCESSING")) {
        if (command?.businessUpdate) {
          state.pendingBusinessUpdate = { requestId: command.requestId, input: command.businessUpdate, recordedAt: now.toISOString() };
          state.commands.push(command.requestId);
          await db.contactActivity.create({ data: { workspaceId, contactId: instance.contactId, kind: "CUSTOMER_NOTE", visibility: "WORKSPACE", summary: `${instance.label}: update saved; waiting for an already-processing message.`, metadata: { workflowInstanceId: instanceId, requestId: command.requestId, update: workflowJson(command.businessUpdate) } } });
        }
        await db.mixWorkflowInstance.update({ where: { id: instanceId }, data: { state: workflowJson(state), ...(command ? { revision: { increment: 1 } } : {}), nextCheckAt: new Date(now.getTime() + 10000) } });
        return;
      }
      if (state.pendingBusinessUpdate) {
        command = { requestId: state.pendingBusinessUpdate.requestId, businessUpdate: state.pendingBusinessUpdate.input };
        delete state.pendingBusinessUpdate;
      }
    }
    if (command?.calendarEntryId) {
      const entry = await db.calendarEntry.findFirst({ where: { id: command.calendarEntryId, workspaceId, contactId: instance.contactId, canceledAt: null } });
      if (!entry) throw new UserFacingError("Choose an appointment for this person in this account.");
      state.context = { ...state.context, timezone: state.context?.timezone ?? display?.timezone ?? "UTC", appointmentBindingId: null, calendarEntryId: entry.id };
    }
    const liveRules = workflowConfiguration(config?.configuration).rules;
    const disabledRules = new Set(definition.rules.filter(rule => !liveRules.some(current => current.id === rule.id && current.enabled)).map(rule => rule.id));
    const effectiveStops = stops.filter(stop => !(state.context?.appointmentBindingId && stop.reason === "journey.stage.exit"));
    const unavailableMixes = new Set(definition.mixes.filter(mix => !currentMixes.some(current => current.id === mix.id && current.status === "ACTIVE") || effectiveStops.some(stop => stop.mixId === mix.id)).map(mix => mix.id));
    const blockedRunIds = new Set(state.runs.filter(run => effectiveStops.some(stop => stop.mixId === run.mixId)).map(run => run.id));
    for (let pass = 0; pass < state.runs.length; pass++) for (const run of state.runs) {
      const parent = state.transitions.find(path => path.id === run.parentTransitionId);
      const owner = state.evaluations.find(evaluation => evaluation.id === parent?.evaluationId);
      if (owner && blockedRunIds.has(owner.runId)) blockedRunIds.add(run.id);
    }
    const blocked = Boolean(instance.contact.archivedAt || restriction?.doNotContact);
    // A delayed completion command belongs to one completion, never a later retry after Undo.
    if (command?.sourceCompletedAt && !jumps.some(jump => jump.workflowVisitId === command?.visitId && ["DONE", "SKIPPED"].includes(jump.status) && jump.completedAt?.toISOString() === command?.sourceCompletedAt)) command = undefined;
    let status = command?.status ?? instance.status;
    if (status === "FINISHED" && command) status = "ACTIVE";
    observeWorkflow(state, jumps.filter(jump => jump.workflowVisitId).map(jump => ({ visitId: jump.workflowVisitId!, status: jump.status === "CANCELED" ? (jump.completionMethod === "appointment_completed" || jump.completionMethod === "appointment_passed" ? "SKIPPED" as const : "HELD" as const) : jump.status,
      completedAt: jump.completedAt?.toISOString() ?? (jump.completionMethod === "appointment_completed" || jump.completionMethod === "appointment_passed" ? now.toISOString() : null), outcome: jump.completionMethod, reason: jump.status === "CANCELED" ? jump.completionMethod : null })));
    if (status === "FINISHED" && state.runs.some(run => run.status === "ACTIVE")) status = "ACTIVE";
    // Maintenance may run before the Job claimant. Consume already committed
    // choices before materializing a silence path or allowing automatic sends.
    for (const queued of [...queuedChoices.map(job => job.payload as unknown as WorkflowCommand), command]) {
      if (!queued?.requestId || state.commands.includes(queued.requestId) || !Array.isArray(queued.decisions) || !queued.decisions.length || !queued.visitId || !queued.sourceCompletedAt) continue;
      state.pendingChoices ??= [];
      if (!state.pendingChoices.some(item => item.requestId === queued.requestId)) state.pendingChoices.push({ requestId: queued.requestId, visitId: queued.visitId, sourceCompletedAt: queued.sourceCompletedAt, decisions: queued.decisions });
    }
    let businessRecord: WorkflowUpdateRecord | undefined;
    if (command?.undoUpdateId) {
      const record = state.updates?.find(item => item.id === command?.undoUpdateId);
      if (deliveries.some(delivery => delivery.createdAt >= new Date(record?.at ?? 0) && delivery.status !== "CANCELED")) throw new UserFacingError("A message may already have been sent. Record a correction; Undo cannot recall messages.");
      undoBusinessUpdate(state, command.undoUpdateId, command.requestId, now.toISOString());
    }
    if (command?.businessUpdate) {
      if (command.businessUpdate.ruleId && disabledRules.has(command.businessUpdate.ruleId)) throw new UserFacingError("This connection is paused or removed. Choose a check-back date to end this Mix’s pending follow-ups, or restore the connection first.");
      businessRecord = applyBusinessUpdate(state, definition, command.businessUpdate, command.requestId, businessRecordedAt);
      // Old scheduled roots must not be recreated by the legacy scheduler after an explicit update.
      for (const run of state.runs) if (run.id === command.businessUpdate.runId) run.legacy = false;
      await db.jump.updateMany({ where: { workspaceId, workflowInstanceId: instanceId, workflowVisitId: { in: state.visits.filter(visit => visit.runId === command?.businessUpdate?.runId).map(visit => visit.id) } }, data: { workflowManaged: true } });
    }
    if (status === "STOPPED") {
      state.pendingChoices = [];
      for (const run of state.runs) if (run.status === "ACTIVE") run.status = "CANCELED";
      for (const visit of state.visits) if (!["DONE", "SKIPPED"].includes(visit.status)) { visit.status = "CANCELED"; visit.reason = "This instance was stopped."; }
      for (const evaluation of state.evaluations) if (evaluation.status === "WAITING") evaluation.status = "CANCELED";
      for (const path of state.transitions) if (!["FINISHED", "CANCELED"].includes(path.status)) { path.status = "CANCELED"; path.reason = "This instance was stopped."; }
    }
    if (!blocked && status === "ACTIVE") {
      advanceWorkflow(state, definition, { now, admittedAt: state.context?.completionCutoff ? new Date(state.context.completionCutoff) : instance.createdAt, unavailableMixes, disabledRules, blockedRunIds });
      if (command?.evaluationId && command.outcome) {
        const evaluation = state.evaluations.find(item => item.id === command?.evaluationId);
        if (evaluation && disabledRules.has(evaluation.ruleId)) throw new UserFacingError("This connection is paused. Enable it before recording a decision.");
        recordWorkflowDecision(state, definition, command.evaluationId, command.outcome, now.toISOString());
      }
      for (const pending of [...(state.pendingChoices ?? [])]) {
        const sourceVisit = state.visits.find(visit => visit.id === pending.visitId);
        if (!sourceVisit || sourceVisit.completedAt !== pending.sourceCompletedAt || !["DONE", "SKIPPED"].includes(sourceVisit.status)) { state.pendingChoices = state.pendingChoices?.filter(item => item !== pending); continue; }
        let applied = true;
        for (const choice of pending.decisions) {
          const evaluation = state.evaluations.find(item => (item.visitId === pending.visitId || (!item.visitId && item.runId === sourceVisit.runId)) && item.ruleId === choice.ruleId && item.status !== "CANCELED");
          if (disabledRules.has(choice.ruleId) || !evaluation) { applied = false; continue; }
          recordWorkflowDecision(state, definition, evaluation.id, choice.outcome, pending.sourceCompletedAt);
        }
        if (applied) { state.pendingChoices = state.pendingChoices?.filter(item => item !== pending); if (!state.commands.includes(pending.requestId)) state.commands.push(pending.requestId); }
      }
      advanceWorkflow(state, definition, { now, admittedAt: state.context?.completionCutoff ? new Date(state.context.completionCutoff) : instance.createdAt, unavailableMixes, disabledRules, blockedRunIds });
    } else if (command?.outcome) throw new UserFacingError("Resume this journey and resolve its contact restrictions before changing a decision.");

    const timezone = state.context?.timezone ?? display?.timezone ?? "UTC";
    const scheduling = preference ?? DEFAULT_PERSONAL_SCHEDULING;
    const binding = state.context?.appointmentBindingId ? await db.appointmentBinding.findFirst({ where: { id: state.context.appointmentBindingId, workspaceId, contactId: instance.contactId }, include: { calendarEntry: true } }) : null;
    const appointment = binding?.calendarEntry ?? (state.context?.calendarEntryId ? await db.calendarEntry.findFirst({ where: { id: state.context.calendarEntryId, workspaceId, contactId: instance.contactId } }) : null);
    const flexibleTimes = state.visits.filter(visit => !["DONE", "SKIPPED", "CANCELED"].includes(visit.status)).flatMap(visit => {
      const step = definition.mixes.flatMap(mix => mix.steps).find(step => step.id === visit.stepId);
      return step?.anchor === "CALENDAR_DAY" && !step.plannedAt ? [Date.parse(visit.readyAt) + step.dayOffset * 86_400_000] : [];
    });
    const busy = flexibleTimes.length && readJourneyPreferences(preference?.journeyPreferences)?.avoidAppointments ? await db.calendarEntry.findMany({ where: { workspaceId, canceledAt: null, endsAt: { gte: new Date(Math.min(...flexibleTimes) - 2 * 86_400_000) }, startsAt: { lte: new Date(Math.max(...flexibleTimes) + 400 * 86_400_000) } }, select: { startsAt: true, endsAt: true, kind: true }, orderBy: { startsAt: "asc" } }) : [];
    for (const visit of state.visits) {
      const run = state.runs.find(item => item.id === visit.runId)!;
      const existing = jumps.find(jump => jump.workflowVisitId === visit.id);
      const canceled = visit.status === "CANCELED" || run.status === "CANCELED" || status === "STOPPED";
      const held = blocked || status === "PAUSED" || unavailableMixes.has(run.mixId) || blockedRunIds.has(run.id);
      if (canceled || held) {
        if (!canceled && !["DONE", "SKIPPED"].includes(visit.status)) { visit.status = "HELD"; visit.reason = blocked ? "Contact is archived or marked do not contact." : status === "PAUSED" ? "This instance is paused." : "This Mix or the Mix that started this path is paused or stopped."; }
        if (existing?.status === "PENDING") await db.jump.updateMany({ where: { id: existing.id, status: "PENDING" }, data: { status: "CANCELED", completionMethod: canceled ? (state.updates?.length ? "workflow_updated" : "workflow_stopped") : "workflow_held", completedAt: null } });
        continue;
      }
      if (visit.status === "DONE" || visit.status === "SKIPPED") continue;
      // The original scheduler remains responsible for roots and moving appointments.
      if (run.legacy && !visit.parentTransitionId) {
        if (existing?.status === "CANCELED" && existing.completionMethod === "workflow_held") { await db.jump.update({ where: { id: existing.id }, data: { status: "PENDING", completionMethod: null } }); visit.status = "PENDING"; visit.reason = null; }
        continue;
      }
      const step = definition.mixes.find(mix => mix.id === run.mixId)?.steps.find(item => item.id === visit.stepId);
      if (!step) { visit.status = "HELD"; visit.reason = "The saved Beat definition is unavailable."; continue; }
      let scheduledAt: Date;
      if (step.anchor !== "CALENDAR_DAY") {
        const entry = appointment;
        const instant = entry && !entry.canceledAt && !binding?.heldAt && entry.outcome !== "NO_SHOW" ? anchoredStepInstant(step, entry) : null;
        const preparation = entry && anchoredStepIsPreparation(step, entry);
        if (entry && preparation && (entry.startsAt <= now || entry.outcome === "COMPLETED")) {
          visit.status = "SKIPPED"; visit.completedAt = now.toISOString(); visit.reason = "Preparation lapsed because the appointment already started.";
          if (existing?.status === "PENDING") await db.jump.update({ where: { id: existing.id }, data: { status: "CANCELED", completionMethod: "appointment_passed" } });
          continue;
        }
        if (!instant || (!preparation && entry?.outcome !== "COMPLETED")) {
          visit.status = "HELD"; visit.reason = "Waiting for the linked appointment or its recorded outcome.";
          if (existing?.status === "PENDING") await db.jump.update({ where: { id: existing.id }, data: { status: "CANCELED", completionMethod: "workflow_held" } });
          continue;
        }
        scheduledAt = instant;
      } else scheduledAt = workflowCalendarStepTime(step, new Date(visit.readyAt), timezone, scheduling, busy, existing?.snoozedUntil);
      // Appointment steps retain their anchor and any deliberate snooze.
      if (step.anchor !== "CALENDAR_DAY") scheduledAt = new Date(Math.max(scheduledAt.getTime(), Date.parse(visit.readyAt), existing?.snoozedUntil?.getTime() ?? 0));
      const snapshot = { workflowRunKey: `${instance.id}:${run.id}`, subject: step.subject, body: step.body, script: step.script, channel: step.channel, ...(step.variants ? { variants: step.variants } : {}), timezone, originalLocalDate: logicalDateKey(logicalDateInTimezone(scheduledAt, timezone)) };
      if (!existing) await db.jump.create({ data: { workspaceId, contactId: instance.contactId, mixId: run.mixId, mixStepId: step.id, stepVersionId: step.versionId, workflowInstanceId: instance.id, workflowVisitId: visit.id, workflowManaged: true, manualOnly: Boolean(state.context?.calendarEntryId && !binding),
        uniquenessKey: `workflow:${instance.id}:${visit.id}`, reason: `${instance.label} · ${step.name}`, scheduledAt, baseScheduledAt: scheduledAt, templateSnapshot: workflowJson(snapshot), renderedSnapshot: workflowJson(renderJumpSnapshot(step, instance.contact, instance.workspace.profile, instance.workspace.owner, step.channel, appointment)), appointmentBindingId: binding?.id ?? null } });
      else if (existing.status === "CANCELED" && ["workflow_held", "workflow_updated", "mix_paused", "do_not_contact", "contact_archived"].includes(existing.completionMethod ?? "")) await db.jump.update({ where: { id: existing.id }, data: { status: "PENDING", completionMethod: null, scheduledAt } });
      else if (existing.status === "PENDING" && (step.anchor !== "CALENDAR_DAY" || Boolean(preference?.journeyPreferences) && !step.plannedAt && !existing.snoozedUntil && existing.scheduledAt >= now) && existing.scheduledAt.getTime() !== scheduledAt.getTime()) await db.jump.update({ where: { id: existing.id }, data: { scheduledAt, baseScheduledAt: scheduledAt } });
      if (visit.status === "HELD") { visit.status = "PENDING"; visit.reason = null; }
    }
    if (businessRecord) businessRecord.afterFingerprint = workflowFingerprint(state);
    if (command && !state.commands.includes(command.requestId)) state.commands.push(command.requestId);
    if (status === "ACTIVE" && workflowFinished(state)) status = "FINISHED";
    const changed = originalState !== JSON.stringify(state) || status !== instance.status;
    await db.mixWorkflowInstance.update({ where: { id: instanceId }, data: { status, state: workflowJson(state), ...(changed ? { revision: { increment: 1 } } : { updatedAt: instance.updatedAt }), nextCheckAt: new Date(now.getTime() + 60_000) } });
    if (businessRecord?.kind === "OUTCOME") await db.job.create({ data: { workspaceId, task: "mix-workflow", runAt: new Date(now.getTime() + 10050), payload: { instanceId } } });
    if (command) await db.contactActivity.create({ data: { workspaceId, contactId: instance.contactId, kind: "CUSTOMER_NOTE", visibility: "WORKSPACE", summary: command.retry ? `${instance.label}: preparation retried.` : businessRecord ? `${instance.label}: ${businessRecord.summary}.` : command.undoUpdateId ? `${instance.label}: update undone; history retained.` : command.calendarEntryId ? `${instance.label}: linked appointment updated.` : command.status ? `${instance.label}: ${command.status.toLowerCase()}.` : `${instance.label}: decision recorded.`, metadata: { workflowInstanceId: instanceId, requestId: command.requestId, outcome: command.outcome ?? command.businessUpdate?.outcome ?? null, businessUpdate: command.businessUpdate ? workflowJson(command.businessUpdate) : null, undoUpdateId: command.undoUpdateId ?? null } } });
  }, { timeout: 30_000 });
}

export async function runMixWorkflowMaintenance(now = new Date(), limit = 50): Promise<number> {
  const instances = await prisma.mixWorkflowInstance.findMany({ where: { status: "ACTIVE", nextCheckAt: { lte: now } }, orderBy: { nextCheckAt: "asc" }, take: limit, select: { id: true, workspaceId: true } });
  for (const instance of instances) await processWorkflowInstance(instance.workspaceId, instance.id, now);
  return instances.length;
}

export async function workflowEditorData(workspaceId: string) {
  const definition = await readWorkflowDefinition(prisma, workspaceId);
  return { revision: definition.revision, configuration: { rules: definition.rules, gatedStepIds: definition.gatedStepIds, intentionalEnds: definition.intentionalEnds } as WorkflowConfiguration, mixes: definition.mixes };
}
