import { describe, expect, it } from "vitest";
import { summarizeWorkflowPeople, workflowPositions, type WorkflowPerson, type WorkflowPosition } from "@/lib/workflow-analytics";
import { emptyWorkflowState } from "@/lib/mix-workflow-types";
const position = (patch: Partial<WorkflowPosition> = {}): WorkflowPosition => ({ mixId: "a", stepId: "beat", instanceId: "work", status: "active", reason: "Ready", dueAt: null, ...patch });
const person = (id: string, positions: WorkflowPosition[]): WorkflowPerson => ({ id, displayName: id, stageId: "custom", stageName: "My stage", positions });
describe("Journey people analytics", () => {
  it("deduplicates repeats and parallel work without losing simultaneous statuses", () => {
    const result = summarizeWorkflowPeople([person("A", [position(), position(), position({ mixId: "b", stepId: "other", status: "waiting" }), position({ status: "completed" })])]);
    expect(result.summary).toMatchObject({ total: 1, current: 1, active: 1, waiting: 1, completed: 0 });
    expect(result.nodes["mix:a"]).toMatchObject({ total: 1, active: 1, completed: 0 });
    expect(result.nodes["mix:b"].waiting).toBe(1); expect(result.roster[0].positions).toHaveLength(2);
  });
  it("shows completion only where no unfinished work remains", () => {
    const result = summarizeWorkflowPeople([person("A", [position({ status: "completed" }), position({ mixId: "b", stepId: "other", status: "attention" })]), person("B", [])]);
    expect(result.summary).toMatchObject({ total: 2, attention: 1, completed: 0, not_started: 1 });
    expect(result.nodes["mix:a"].completed).toBe(1);
    expect(summarizeWorkflowPeople([person("A", [position({ status: "completed" })])], { node: "beat:beat", status: "completed" }).total).toBe(1);
  });
  it("filters the full roster before pagination, retaining full counts and custom stages", () => {
    const people = Array.from({ length: 280 }, (_, n) => person(`Person ${String(n).padStart(3, "0")}`, [position()]));
    const result = summarizeWorkflowPeople(people, { offset: 25 });
    expect(result.summary.total).toBe(280); expect(result.total).toBe(280); expect(result.roster).toHaveLength(10); expect(result.roster[0].id).toBe("Person 025");
    expect(result.stages).toEqual([{ id: "custom", name: "My stage", count: 280 }]);
    expect(summarizeWorkflowPeople(people, { query: "279", status: "active", stage: "custom", offset: 500 }).roster[0].id).toBe("Person 279");
    expect(summarizeWorkflowPeople(people, { node: "mix:missing" }).total).toBe(0);
  });
  it("uses the prepared due date, holds, and recorded waits instead of the admission date", () => {
    const now = Date.parse("2026-09-21T12:00:00Z"), state = emptyWorkflowState();
    state.runs.push({ id: "run", mixId: "a", startedAt: new Date(now - 86400000).toISOString(), completedAt: null, status: "ACTIVE", parentTransitionId: null, legacy: false });
    state.visits.push({ id: "visit", runId: "run", stepId: "beat", readyAt: new Date(now - 86400000).toISOString(), status: "PENDING", completedAt: null, outcome: null, reason: null, parentTransitionId: null });
    const future = workflowPositions("work", "ACTIVE", state, now, [{ id: "jump", workflowVisitId: "visit", scheduledAt: new Date(now + 86400000), status: "PENDING" }]);
    expect(future[0]).toMatchObject({ status: "waiting", reason: "Scheduled", jumpId: "jump" });
    expect(workflowPositions("work", "ACTIVE", state, now)[0]).toMatchObject({ status: "waiting", reason: "Preparing next Beat" });
    state.visits[0].status = "HELD"; state.visits[0].reason = "Link an appointment";
    expect(workflowPositions("work", "ACTIVE", state, now)[0]).toMatchObject({ status: "attention", reason: "Link an appointment" });
    expect(workflowPositions("work", "PAUSED", state, now)[0].status).toBe("paused");
    expect(workflowPositions("work", "STOPPED", state, now)[0].status).toBe("stopped");
    state.visits[0].status = "DONE";
    expect(workflowPositions("work", "PAUSED", state, now)[0].status).toBe("completed");
    state.evaluations.push({ id: "decision", ruleId: "rule", runId: "run", visitId: "visit", occurredAt: new Date(now).toISOString(), outcome: null, decidedAt: null, generation: 1, status: "WAITING", joined: false });
    const result = summarizeWorkflowPeople([person("A", workflowPositions("work", "ACTIVE", state, now))]);
    expect(result.nodes["beat:beat"]).toMatchObject({ waiting: 1, completed: 0 });
  });
});
