import { emptyWorkflowState, type WorkflowDefinition, type WorkflowEvaluation, type WorkflowRun, type WorkflowState, type WorkflowTarget, type WorkflowTransition, type WorkflowVisit } from "@/lib/mix-workflow-types";

const terminal = (visit: WorkflowVisit) => visit.status === "DONE" || visit.status === "SKIPPED";
const id = (state: WorkflowState, prefix: string) => `${prefix}${++state.sequence}`;
export const WORKFLOW_UNDO_MS = 10_000;
export const WORKFLOW_VISIT_LIMIT = 1000;

export function addWorkflowRun(state: WorkflowState, definition: WorkflowDefinition, target: WorkflowTarget, at: string, parentTransitionId: string | null = null, legacy = false): WorkflowRun {
  const mix = definition.mixes.find(item => item.id === target.mixId);
  if (!mix) throw new Error("This Mix is not in this journey's saved configuration.");
  const run: WorkflowRun = { id: id(state, "run"), mixId: mix.id, startedAt: at, completedAt: null, status: "ACTIVE", parentTransitionId, legacy };
  state.runs.push(run);
  const steps = target.stepId ? mix.steps.filter(step => step.id === target.stepId) : mix.steps.filter(step => !definition.gatedStepIds.includes(step.id));
  if (!steps.length) state.issue = `${mix.name} has no entry Beats. Add a scheduled Beat or connect to a specific Beat.`;
  for (const step of steps) addWorkflowVisit(state, run.id, step.id, at, parentTransitionId);
  return run;
}

function addWorkflowVisit(state: WorkflowState, runId: string, stepId: string, at: string, parentTransitionId: string | null): WorkflowVisit {
  const visit: WorkflowVisit = { id: id(state, "beat"), runId, stepId, readyAt: at, status: "PENDING", completedAt: null, outcome: null, reason: null, parentTransitionId };
  state.visits.push(visit);
  return visit;
}

export function startWorkflow(definition: WorkflowDefinition, target: WorkflowTarget, at: string, legacy = false): WorkflowState {
  const state = emptyWorkflowState();
  addWorkflowRun(state, definition, target, at, null, legacy);
  return state;
}

/** The final ordinary Beat can collect a whole-Mix decision in the same interaction. */
export function workflowDecisionRulesForVisit(definition: WorkflowDefinition, state: WorkflowState, visitId: string | null) {
  const visit = state.visits.find(item => item.id === visitId), run = state.runs.find(item => item.id === visit?.runId);
  if (!visit || !run) return [];
  const rules = definition.rules.filter(rule => rule.enabled && rule.source.mixId === run.mixId);
  const lastBeat = state.visits.filter(item => item.runId === run.id && item.id !== visit.id && item.status !== "CANCELED").every(terminal)
    && !rules.some(rule => rule.source.stepId === visit.stepId)
    && !state.evaluations.some(item => item.runId === run.id && item.visitId && item.status === "WAITING")
    && !state.transitions.some(path => path.target?.mixId === run.mixId && path.target.stepId && ["WAITING", "HELD"].includes(path.status));
  return rules.filter(rule => rule.source.stepId === visit.stepId || (!rule.source.stepId && lastBeat));
}

/** Invalidation follows recorded ownership only, never every run of a contact's Mix. */
export function cancelWorkflowTransition(state: WorkflowState, transition: WorkflowTransition, reason: string, seen = new Set<string>()): void {
  if (seen.has(transition.id)) return;
  seen.add(transition.id);
  transition.status = "CANCELED";
  transition.reason = reason;
  const runs = state.runs.filter(run => run.parentTransitionId === transition.id);
  for (const run of runs) run.status = "CANCELED";
  const visits = state.visits.filter(visit => visit.parentTransitionId === transition.id || runs.some(run => run.id === visit.runId));
  for (const visit of visits) if (!terminal(visit)) { visit.status = "CANCELED"; visit.reason = reason; }
  for (const evaluation of state.evaluations.filter(item => runs.some(run => run.id === item.runId) || visits.some(visit => visit.id === item.visitId))) {
    evaluation.status = "CANCELED";
    for (const child of state.transitions.filter(item => item.evaluationId === evaluation.id)) cancelWorkflowTransition(state, child, reason, seen);
  }
}

export function invalidateWorkflowEvaluation(state: WorkflowState, evaluation: WorkflowEvaluation, reason: string): void {
  for (const transition of state.transitions.filter(item => item.evaluationId === evaluation.id && item.generation === evaluation.generation)) cancelWorkflowTransition(state, transition, reason);
  evaluation.generation += 1;
  evaluation.status = "CANCELED";
  evaluation.joined = false;
  evaluation.outcome = null;
  evaluation.decidedAt = null;
}

export function recordWorkflowDecision(state: WorkflowState, definition: WorkflowDefinition, evaluationId: string, outcome: string, at: string): void {
  const evaluation = state.evaluations.find(item => item.id === evaluationId && item.status !== "CANCELED");
  const rule = definition.rules.find(item => item.id === evaluation?.ruleId);
  if (!evaluation || !rule || !rule.routes.some(route => route.when === "OUTCOME" && route.outcome === outcome)) throw new Error("Choose an available outcome for this decision.");
  if (evaluation.outcome === outcome) return;
  invalidateWorkflowEvaluation(state, evaluation, "Decision changed; earlier performed work is retained.");
  evaluation.status = "WAITING";
  evaluation.outcome = outcome;
  evaluation.decidedAt = at;
  const run = state.runs.find(item => item.id === evaluation.runId);
  if (run && evaluation.visitId) { run.status = "ACTIVE"; run.completedAt = null; }
}

export type WorkflowObservation = { visitId: string; status: WorkflowVisit["status"]; completedAt: string | null; outcome: string | null; reason?: string | null };

export function observeWorkflow(state: WorkflowState, observations: WorkflowObservation[]): void {
  for (const observation of observations) {
    const visit = state.visits.find(item => item.id === observation.visitId);
    if (!visit || visit.status === "CANCELED") continue;
    if (terminal(visit) && !["DONE", "SKIPPED"].includes(observation.status)) {
      const run = state.runs.find(item => item.id === visit.runId)!;
      run.status = "ACTIVE"; run.completedAt = null;
      for (const evaluation of state.evaluations.filter(item => item.visitId === visit.id || (item.runId === run.id && !item.visitId))) invalidateWorkflowEvaluation(state, evaluation, "Source reopened; dependent work stopped.");
    }
    Object.assign(visit, { status: observation.status, completedAt: observation.completedAt, outcome: observation.outcome, reason: observation.reason ?? null });
  }
}

function evaluationFor(state: WorkflowState, ruleId: string, runId: string, visitId: string | null, at: string): WorkflowEvaluation {
  const existing = state.evaluations.find(item => item.ruleId === ruleId && item.runId === runId && item.visitId === visitId);
  if (existing) {
    if (existing.status === "CANCELED") { existing.status = "WAITING"; existing.occurredAt = at; }
    return existing;
  }
  const evaluation: WorkflowEvaluation = { id: id(state, "decision"), ruleId, runId, visitId, occurredAt: at, outcome: null, decidedAt: null, generation: 1, status: "WAITING", joined: false };
  state.evaluations.push(evaluation);
  return evaluation;
}

/** Pure evaluator: no database, network, inferred customer choices, or wall-clock reads. */
export function advanceWorkflow(state: WorkflowState, definition: WorkflowDefinition, options: { now: Date; admittedAt: Date; unavailableMixes?: Set<string>; disabledRules?: Set<string>; blockedRunIds?: Set<string> }): void {
  const now = options.now.getTime();
  const at = options.now.toISOString();
  const eligible = (date: string | null) => Boolean(date && Date.parse(date) >= options.admittedAt.getTime() && Date.parse(date) + WORKFLOW_UNDO_MS <= now);
  const activeRules = definition.rules.filter(rule => rule.enabled && !options.disabledRules?.has(rule.id));
  for (let pass = 0; pass < 200; pass++) {
    const before = JSON.stringify(state);
    for (const run of state.runs.filter(item => item.status !== "CANCELED")) {
      if (options.unavailableMixes?.has(run.mixId) || options.blockedRunIds?.has(run.id)) continue;
      for (const visit of state.visits.filter(item => item.runId === run.id && terminal(item) && eligible(item.completedAt))) {
        for (const rule of activeRules.filter(item => item.source.mixId === run.mixId && item.source.stepId === visit.stepId)) evaluationFor(state, rule.id, run.id, visit.id, visit.completedAt!);
      }
      const visits = state.visits.filter(item => item.runId === run.id && item.status !== "CANCELED");
      const waiting = state.evaluations.some(item => item.runId === run.id && item.visitId && item.status === "WAITING");
      const activeBeatRoutes = state.transitions.some(item => item.target?.mixId === run.mixId && item.target.stepId && state.evaluations.some(evaluation => evaluation.id === item.evaluationId && evaluation.runId === run.id && evaluation.visitId) && ["WAITING", "HELD"].includes(item.status));
      if (visits.length && visits.every(visit => terminal(visit) && visit.completedAt && Date.parse(visit.completedAt) + WORKFLOW_UNDO_MS <= now) && !waiting && !activeBeatRoutes) {
        run.status = "FINISHED";
        run.completedAt ??= visits.map(item => item.completedAt!).sort().at(-1)!;
        if (eligible(run.completedAt)) for (const rule of activeRules.filter(item => item.source.mixId === run.mixId && !item.source.stepId)) evaluationFor(state, rule.id, run.id, null, run.completedAt);
      }
    }
    for (const evaluation of state.evaluations.filter(item => item.status === "WAITING")) {
      const rule = activeRules.find(item => item.id === evaluation.ruleId);
      const run = state.runs.find(item => item.id === evaluation.runId)!;
      if (!rule || run.status === "CANCELED" || options.unavailableMixes?.has(run.mixId) || options.blockedRunIds?.has(run.id)) continue;
      let matching = rule.routes.filter(route => route.when === "FINISHED" || (route.when === "OUTCOME" && route.outcome === evaluation.outcome));
      if (!evaluation.outcome && !matching.length) matching = rule.routes.filter(route => route.when === "TIMEOUT" && Date.parse(evaluation.occurredAt) + route.delayMinutes * 60_000 <= now);
      if (!matching.length) continue;
      if (rule.mode === "CHOICE" && matching.length > 1) { state.issue = `More than one path matches “${rule.name}”. Review its conditions.`; continue; }
      evaluation.status = "ROUTED";
      for (const route of matching) {
        const uses = state.transitions.filter(item => item.routeId === route.id && item.startedAt).length;
        const limited = route.maxVisits !== null && uses >= route.maxVisits;
        const due = Date.parse(evaluation.decidedAt ?? evaluation.occurredAt) + route.delayMinutes * 60_000;
        const transition: WorkflowTransition = { id: id(state, "path"), evaluationId: evaluation.id, generation: evaluation.generation, routeId: route.id, dueAt: new Date(Math.max(due, Date.parse(evaluation.occurredAt) + WORKFLOW_UNDO_MS)).toISOString(), startedAt: null, status: limited ? "HELD" : "WAITING", reason: limited ? `Repeat limit reached (${route.maxVisits}). Finish this instance or start new work deliberately.` : null, target: route.target, targetRunId: null, targetVisitId: null };
        state.transitions.push(transition);
        if (route.replace) {
          for (const visit of state.visits.filter(item => item.runId === run.id && item.id !== evaluation.visitId && !terminal(item))) { visit.status = "CANCELED"; visit.reason = "The recorded outcome ended this path."; }
          for (const other of state.evaluations.filter(item => item.id !== evaluation.id && item.runId === run.id && item.visitId && state.visits.some(visit => visit.id === item.visitId && visit.status === "CANCELED"))) invalidateWorkflowEvaluation(state, other, "The recorded outcome ended this path.");
        }
      }
    }
    for (const transition of state.transitions.filter(item => ["WAITING", "HELD"].includes(item.status))) {
      const evaluation = state.evaluations.find(item => item.id === transition.evaluationId)!;
      const rule = activeRules.find(item => item.id === evaluation.ruleId);
      if (!rule && evaluation.status !== "CANCELED" && !transition.reason?.startsWith("Repeat limit")) { transition.status = "HELD"; transition.reason = "This connection is paused or has been removed. Enable it in Journey or stop this instance."; }
      if (!rule || evaluation.status === "CANCELED" || options.blockedRunIds?.has(evaluation.runId) || options.unavailableMixes?.has(state.runs.find(run => run.id === evaluation.runId)!.mixId) || transition.reason?.startsWith("Repeat limit")) continue;
      if (Date.parse(transition.dueAt) > now) continue;
      if (transition.target && options.unavailableMixes?.has(transition.target.mixId)) { transition.status = "HELD"; transition.reason = "The destination Mix is paused, stopped or unavailable."; continue; }
      if (state.visits.length >= WORKFLOW_VISIT_LIMIT) { state.issue = "This instance reached its execution limit. Review its return paths before starting another instance."; continue; }
      transition.status = "STARTED"; transition.startedAt = at; transition.reason = null;
      if (!transition.target) { transition.status = "FINISHED"; continue; }
      const sourceRun = state.runs.find(item => item.id === evaluation.runId)!;
      if (transition.target.stepId && evaluation.visitId && transition.target.mixId === sourceRun.mixId) {
        const visit = addWorkflowVisit(state, sourceRun.id, transition.target.stepId, at, transition.id);
        sourceRun.status = "ACTIVE"; sourceRun.completedAt = null;
        transition.targetRunId = sourceRun.id; transition.targetVisitId = visit.id;
      } else {
        const run = addWorkflowRun(state, definition, transition.target, at, transition.id);
        transition.targetRunId = run.id;
      }
    }
    for (const transition of state.transitions.filter(item => item.status === "STARTED")) {
      const done = transition.targetVisitId
        ? state.visits.some(item => item.id === transition.targetVisitId && terminal(item) && eligible(item.completedAt)) && !state.evaluations.some(item => item.visitId === transition.targetVisitId && item.status === "WAITING")
        : state.runs.some(item => item.id === transition.targetRunId && item.status === "FINISHED") && !state.evaluations.some(item => item.runId === transition.targetRunId && item.status === "WAITING");
      if (done) transition.status = "FINISHED";
    }
    for (const evaluation of state.evaluations.filter(item => item.status === "ROUTED" && !item.joined)) {
      const rule = activeRules.find(item => item.id === evaluation.ruleId);
      if (!rule?.join) continue;
      const paths = state.transitions.filter(item => item.evaluationId === evaluation.id && item.generation === evaluation.generation && item.routeId !== `${rule.id}:join`);
      if (!paths.length || !(rule.join.mode === "ALL" ? paths.every(item => item.status === "FINISHED") : paths.some(item => item.status === "FINISHED"))) continue;
      evaluation.joined = true;
      if (rule.join.cancelRemaining) for (const path of paths.filter(item => item.status !== "FINISHED")) cancelWorkflowTransition(state, path, "Another required path finished first.");
      state.transitions.push({ id: id(state, "join"), evaluationId: evaluation.id, generation: evaluation.generation, routeId: `${rule.id}:join`, dueAt: at, startedAt: null, status: "WAITING", reason: null, target: rule.join.target, targetRunId: null, targetVisitId: null });
    }
    if (before === JSON.stringify(state)) return;
  }
  state.issue = "Too many transitions in one evaluation. Review this instance's loops.";
}

export function workflowFinished(state: WorkflowState): boolean {
  return !state.issue && !state.pendingChoices?.length && state.runs.length > 0 && state.runs.every(run => run.status !== "ACTIVE")
    && !state.evaluations.some(item => item.status === "WAITING")
    && !state.transitions.some(item => ["WAITING", "HELD", "STARTED"].includes(item.status));
}
