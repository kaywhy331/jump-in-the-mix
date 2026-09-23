import { createHash } from "node:crypto";
import { evaluationFor, invalidateWorkflowEvaluation, recordWorkflowDecision } from "@/lib/mix-workflow-engine";
import type { WorkflowBusinessUpdate, WorkflowCheckpoint, WorkflowDefinition, WorkflowState, WorkflowUpdateRecord } from "@/lib/mix-workflow-types";

const clone = <T>(value: T): T => structuredClone(value);
export function workflowCheckpoint(state: WorkflowState): WorkflowCheckpoint {
  return clone({ runs: state.runs, visits: state.visits, evaluations: state.evaluations, transitions: state.transitions, pendingChoices: state.pendingChoices ?? [], commitments: state.commitments ?? [], issue: state.issue });
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export const workflowFingerprint = (state: WorkflowState) => createHash("sha256").update(JSON.stringify(canonical(workflowCheckpoint(state)))).digest("hex");

export function businessUpdateRules(definition: WorkflowDefinition, state: WorkflowState, runId: string) {
  const run = state.runs.find(item => item.id === runId && item.status !== "CANCELED");
  return definition.rules.filter(rule => rule.enabled && rule.source.mixId === run?.mixId && !rule.source.stepId && rule.routes.some(route => route.when === "OUTCOME"));
}

export function applyBusinessUpdate(state: WorkflowState, definition: WorkflowDefinition, input: WorkflowBusinessUpdate, requestId: string, at: string): WorkflowUpdateRecord {
  const run = state.runs.find(item => item.id === input.runId && item.status !== "CANCELED");
  if (!run || input.scope !== "SOURCE_MIX_REMAINDER") throw new Error("Choose the piece of work this update belongs to.");
  const before = workflowCheckpoint(state);
  let summary: string;
  if (input.kind === "OUTCOME") {
    const rule = businessUpdateRules(definition, state, run.id).find(item => item.id === input.ruleId);
    if (!rule || !input.outcome || !rule.routes.some(route => route.when === "OUTCOME" && route.outcome === input.outcome)) throw new Error("Choose an outcome from this work’s saved connection.");
    const evaluation = evaluationFor(state, rule.id, run.id, null, at);
    recordWorkflowDecision(state, definition, evaluation.id, input.outcome, at);
    summary = `${rule.name}: ${input.outcome}`;
  } else {
    if (!input.dueAt || !Number.isFinite(Date.parse(input.dueAt)) || Date.parse(input.dueAt) <= Date.parse(at)) throw new Error("Choose a future date and time to check back.");
    if (!input.timezone || !["CUSTOMER", "OWNER"].includes(input.source ?? "")) throw new Error("Choose whose timing this is and confirm the timezone.");
    try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }); } catch { throw new Error("Choose a valid timezone."); }
    const previous = state.updates?.find(item => item.id === run.resolution?.updateId);
    const evaluation = previous?.ruleId ? state.evaluations.find(item => item.ruleId === previous.ruleId && item.runId === run.id && item.status !== "CANCELED") : undefined;
    if (evaluation) invalidateWorkflowEvaluation(state, evaluation, "Callback timing replaced this outcome; performed work is retained.");
    summary = input.source === "CUSTOMER" ? "Customer requested a callback" : "Owner chose when to check again";
  }
  for (const commitment of state.commitments ?? []) if (commitment.runId === run.id && commitment.status === "OPEN") commitment.status = "RESOLVED";
  if (input.kind === "WAIT") {
    state.commitments ??= [];
    state.commitments.push({ id: `commitment:${requestId}`, updateId: requestId, runId: run.id, dueAt: input.dueAt!, timezone: input.timezone!, source: input.source!, recordedAt: at, status: "OPEN" });
  }
  for (const visit of state.visits) if (visit.runId === run.id && !["DONE", "SKIPPED", "CANCELED"].includes(visit.status)) {
    visit.status = "CANCELED"; visit.reason = "Ended by a recorded update for this work.";
  }
  // A pending completion's choice must never overwrite a later business fact.
  state.pendingChoices = state.pendingChoices?.filter(item => !state.visits.some(visit => visit.id === item.visitId && visit.runId === run.id));
  run.resolution = { updateId: requestId, kind: input.kind };
  run.status = input.kind === "WAIT" ? "ACTIVE" : "FINISHED"; run.completedAt = input.kind === "WAIT" ? null : at;
  const record: WorkflowUpdateRecord = { id: requestId, runId: run.id, kind: input.kind, at, summary, ...(input.ruleId ? { ruleId: input.ruleId } : {}), ...(input.outcome ? { outcome: input.outcome } : {}), before };
  state.updates ??= [];
  state.updates.push(record);
  return record;
}

/** Undo only a still-identical result. Later activity requires a new, reviewed correction. */
export function undoBusinessUpdate(state: WorkflowState, updateId: string, requestId: string, at: string) {
  const record = state.updates?.find(item => item.id === updateId && !item.reversedAt);
  if (!record?.before || !record.afterFingerprint || workflowFingerprint(state) !== record.afterFingerprint) throw new Error("This work has moved on. Record a new update to correct it; performed work will stay in history.");
  const before = clone(record.before);
  // Keep the visits created by the mistaken update as canceled history.
  for (const run of state.runs) if (!before.runs.some(item => item.id === run.id)) before.runs.push({ ...run, status: "CANCELED" });
  for (const visit of state.visits) if (!before.visits.some(item => item.id === visit.id)) before.visits.push({ ...visit, status: "CANCELED", reason: "Update undone before this action was performed." });
  for (const evaluation of state.evaluations) if (!before.evaluations.some(item => item.id === evaluation.id)) before.evaluations.push({ ...evaluation, status: "CANCELED" });
  for (const path of state.transitions) if (!before.transitions.some(item => item.id === path.id)) before.transitions.push({ ...path, status: "CANCELED", reason: "Update undone." });
  for (const commitment of state.commitments ?? []) if (!before.commitments?.some(item => item.id === commitment.id)) (before.commitments ??= []).push({ ...commitment, status: "CANCELED" });
  Object.assign(state, before);
  record.reversedAt = at;
  state.updates!.push({ id: requestId, runId: record.runId, kind: "UNDO", at, summary: "Previous update undone; history retained.", reverses: record.id });
}
