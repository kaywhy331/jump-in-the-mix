import type { WorkflowState } from "@/lib/mix-workflow-types";

export const workflowStatuses = ["active", "waiting", "attention", "paused", "completed", "stopped", "not_started"] as const;
export type WorkflowStatus = typeof workflowStatuses[number];
export const workflowStatusLabels: Record<WorkflowStatus, string> = { active: "Active", waiting: "Waiting", attention: "Needs attention", paused: "Paused", completed: "Completed", stopped: "Stopped", not_started: "Not started" };
export type WorkflowPosition = { mixId: string; stepId: string | null; instanceId: string | null; status: WorkflowStatus; reason: string; dueAt: string | null; jumpId?: string };
export type WorkflowPerson = { id: string; displayName: string; stageId: string; stageName: string; positions: WorkflowPosition[] };
export type WorkflowCounts = Record<WorkflowStatus, number> & { total: number; current: number };
export type WorkflowAnalytics = {
  summary: WorkflowCounts; nodes: Record<string, WorkflowCounts>;
  stages: Array<{ id: string; name: string; count: number }>;
  roster: Array<WorkflowPerson & { statuses: WorkflowStatus[] }>;
  total: number; offset: number; pageSize: number;
};
export const emptyWorkflowCounts = (): WorkflowCounts => ({ total: 0, current: 0, active: 0, waiting: 0, attention: 0, paused: 0, completed: 0, stopped: 0, not_started: 0 });
const unfinished: WorkflowStatus[] = ["active", "waiting", "attention", "paused"];
export function positionStatuses(positions: WorkflowPosition[]): WorkflowStatus[] {
  const statuses = new Set(positions.map(position => position.status));
  const current = unfinished.filter(status => statuses.has(status));
  // Finished visits do not make someone with unfinished work look completed.
  const terminal = (["completed", "stopped"] as const).filter(status => statuses.has(status));
  return current.length ? current : terminal.length ? terminal : ["not_started"];
}
export function workflowPositions(id: string, status: string, state: WorkflowState, now: number, jumps: Array<{ id: string; workflowVisitId: string | null; scheduledAt: Date; status: string }> = []): WorkflowPosition[] {
  const positions: WorkflowPosition[] = [];
  const override = status === "PAUSED" ? "paused" : status === "STOPPED" ? "stopped" : null;
  const add = (mixId: string, stepId: string | null, value: WorkflowStatus, reason: string, dueAt: string | null = null) => positions.push({ mixId, stepId, instanceId: id, status: unfinished.includes(value) ? override ?? value : value, reason: unfinished.includes(value) && override === "paused" ? "Work paused" : unfinished.includes(value) && override === "stopped" ? "Work stopped" : reason, dueAt });
  for (const run of state.runs) {
    const visits = state.visits.filter(visit => visit.runId === run.id);
    for (const visit of visits) {
      if (visit.status === "CANCELED") { add(run.mixId, visit.stepId, "stopped", "Beat canceled"); continue; }
      const jump = jumps.find(item => item.workflowVisitId === visit.id);
      const held = visit.status === "HELD", done = visit.status === "DONE" || visit.status === "SKIPPED" || jump?.status === "DONE" || jump?.status === "SKIPPED";
      const dueAt = jump?.scheduledAt.toISOString() ?? null;
      const waiting = !dueAt || Date.parse(dueAt) > now;
      add(run.mixId, visit.stepId, done ? "completed" : held ? "attention" : waiting ? "waiting" : "active", done ? (visit.status === "SKIPPED" ? "Beat skipped" : "Beat completed") : visit.reason ?? (waiting ? dueAt ? "Scheduled" : "Preparing next Beat" : "Beat ready"), done ? null : dueAt);
      if (jump) positions[positions.length - 1].jumpId = jump.id;
    }
    const evaluations = state.evaluations.filter(evaluation => evaluation.runId === run.id && evaluation.status !== "CANCELED");
    for (const evaluation of evaluations) {
      const stepId = state.visits.find(visit => visit.id === evaluation.visitId)?.stepId ?? null;
      if (evaluation.status === "WAITING") add(run.mixId, stepId, "waiting", "Awaiting an outcome");
      for (const path of state.transitions.filter(path => path.evaluationId === evaluation.id && path.generation === evaluation.generation)) {
        if (path.status === "WAITING" || path.status === "HELD") add(run.mixId, stepId, path.status === "HELD" ? "attention" : "waiting", path.reason ?? "Waiting to continue", path.dueAt);
      }
    }
    if (state.issue && run.status !== "CANCELED") add(run.mixId, null, "attention", state.issue);
    if (!positions.some(position => position.mixId === run.mixId && position.instanceId === id)) add(run.mixId, null, run.status === "FINISHED" ? "completed" : run.status === "CANCELED" ? "stopped" : "waiting", run.status === "FINISHED" ? "Mix completed" : "Waiting for the next step");
  }
  return positions;
}
export function summarizeWorkflowPeople(people: WorkflowPerson[], filter: { node?: string; status?: string; stage?: string; query?: string; offset?: number } = {}): WorkflowAnalytics {
  const summary = emptyWorkflowCounts(), nodes: Record<string, WorkflowCounts> = {}, stages = new Map<string, { id: string; name: string; count: number }>();
  const increment = (counts: WorkflowCounts, positions: WorkflowPosition[]) => { counts.total++; const statuses = positionStatuses(positions); if (statuses.some(status => unfinished.includes(status))) counts.current++; for (const status of statuses) counts[status]++; };
  const matches: WorkflowAnalytics["roster"] = [];
  for (const person of people) {
    increment(summary, person.positions);
    const stage = stages.get(person.stageId) ?? { id: person.stageId, name: person.stageName, count: 0 }; stage.count++; stages.set(stage.id, stage);
    const byNode = new Map<string, WorkflowPosition[]>();
    for (const position of person.positions) for (const key of [`mix:${position.mixId}`, ...(position.stepId ? [`beat:${position.stepId}`] : [])]) { const list = byNode.get(key) ?? []; list.push(position); byNode.set(key, list); }
    for (const [key, positions] of byNode) increment(nodes[key] ??= emptyWorkflowCounts(), positions);
    const positions = filter.node ? byNode.get(filter.node) ?? [] : person.positions;
    const statuses = positionStatuses(positions);
    if (filter.node && !positions.length || filter.stage && filter.stage !== person.stageId || filter.status && filter.status !== "all" && !statuses.includes(filter.status as WorkflowStatus) || filter.query && !person.displayName.toLocaleLowerCase().includes(filter.query.trim().toLocaleLowerCase())) continue;
    // Show current positions first; old visits remain available in work history.
    const relevant = positions.filter(position => statuses.includes(position.status));
    const unique = new Map(relevant.map(position => [`${position.instanceId}:${position.mixId}:${position.stepId}:${position.status}:${position.reason}`, position]));
    matches.push({ ...person, positions: [...unique.values()], statuses });
  }
  matches.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
  const pageSize = 10, requested = Math.max(0, Math.floor(filter.offset ?? 0)), offset = Math.min(requested, Math.max(0, Math.floor((matches.length - 1) / pageSize) * pageSize));
  return { summary, nodes, stages: [...stages.values()].sort((a, b) => a.name.localeCompare(b.name)), roster: matches.slice(offset, offset + pageSize), total: matches.length, offset, pageSize };
}
