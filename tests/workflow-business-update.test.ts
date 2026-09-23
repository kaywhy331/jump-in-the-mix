import { describe, expect, it } from "vitest";
import { addWorkflowRun, advanceWorkflow, observeWorkflow, startWorkflow, workflowFinished } from "@/lib/mix-workflow-engine";
import { applyBusinessUpdate, undoBusinessUpdate, workflowFingerprint } from "@/lib/workflow-business-update";
import { workflowAttentionReasons } from "@/lib/workflow-attention";
import { positionStatuses, workflowPositions } from "@/lib/workflow-analytics";
import type { WorkflowDefinition, WorkflowState } from "@/lib/mix-workflow-types";

const at = (seconds: number) => new Date(seconds * 1000).toISOString();
function fixture() {
  const definition: WorkflowDefinition = { revision: 1, gatedStepIds: [], intentionalEnds: [], mixes: ["estimate", "booked", "concern", "independent"].map(id => ({ id, name: id, status: "ACTIVE", source: "USER", triggerMode: "MANUAL_START", steps: [0, 1].map(index => ({ id: `${id}${index}`, versionId: `${id}v${index}`, name: `${id}${index}`, channel: "SMS", dayOffset: index * 7, sendTimeMinutes: null, plannedAt: null, anchor: "CALENDAR_DAY", offsetMinutes: null, subject: null, body: "Hello", script: null })) })), rules: [{ id: "decision", name: "Estimate reply", source: { mixId: "estimate", stepId: null }, enabled: true, mode: "CHOICE", join: null, routes: ["booked", "concern"].map(id => ({ id, label: id, when: "OUTCOME", outcome: id, target: { mixId: id, stepId: null }, delayMinutes: 0, maxVisits: null, replace: false })) }, { id: "ordinary-finish", name: "Only after real completion", source: { mixId: "estimate", stepId: null }, enabled: true, mode: "PARALLEL", join: null, routes: [{ id: "finish", label: "finish", when: "FINISHED", outcome: "", target: { mixId: "independent", stepId: null }, delayMinutes: 0, maxVisits: null, replace: false }] }] };
  const state = startWorkflow(definition, { mixId: "estimate", stepId: null }, at(0));
  return { definition, state };
}
const advance = (state: WorkflowState, definition: WorkflowDefinition, seconds: number) => advanceWorkflow(state, definition, { now: new Date(seconds * 1000), admittedAt: new Date(0) });
const accept = (state: WorkflowState, definition: WorkflowDefinition, id = "accept") => applyBusinessUpdate(state, definition, { kind: "OUTCOME", runId: state.runs[0].id, scope: "SOURCE_MIX_REMAINDER", ruleId: "decision", outcome: "booked" }, id, at(30));

describe("reviewed early business updates", () => {
  it("ends the remaining estimate Beats, retains completed work, and does not invent a whole-Mix completion", () => {
    const { state, definition } = fixture();
    observeWorkflow(state, [{ visitId: state.visits[0].id, status: "DONE", completedAt: at(5), outcome: "sent" }]);
    accept(state, definition); advance(state, definition, 41); advance(state, definition, 60);
    expect(state.visits[0].status).toBe("DONE"); expect(state.visits[1].status).toBe("CANCELED");
    expect(state.runs.map(run => run.mixId)).toEqual(["estimate", "booked"]);
    expect(state.evaluations.some(item => item.ruleId === "ordinary-finish")).toBe(false);
    expect(state.transitions.filter(item => item.status !== "CANCELED")).toHaveLength(1);
  });
  it("does not end independent work for the same person", () => {
    const { state, definition } = fixture(); const independent = addWorkflowRun(state, definition, { mixId: "estimate", stepId: null }, at(10));
    accept(state, definition); advance(state, definition, 41);
    expect(state.visits.filter(visit => visit.runId === independent.id).map(visit => visit.status)).toEqual(["PENDING", "PENDING"]);
  });
  it.each(["CUSTOMER", "OWNER"] as const)("keeps one %s check-back clock and no premature owner action", source => {
    const { state, definition } = fixture();
    applyBusinessUpdate(state, definition, { kind: "WAIT", runId: state.runs[0].id, scope: "SOURCE_MIX_REMAINDER", source, dueAt: at(600), timezone: "America/Los_Angeles" }, "wait", at(30));
    advance(state, definition, 60);
    expect(workflowFinished(state)).toBe(false); expect(state.transitions).toHaveLength(0);
    expect(workflowAttentionReasons(definition, state, new Date(599000))).toHaveLength(0);
    expect(workflowAttentionReasons(definition, state, new Date(600000))).toEqual([expect.objectContaining({ id: "commitment:wait", action: "Record update" })]);
    expect(state.commitments?.[0].source).toBe(source);
    expect(positionStatuses(workflowPositions("work", "ACTIVE", state, 599000))).toEqual(["waiting"]);
    expect(positionStatuses(workflowPositions("work", "ACTIVE", state, 600000))).toEqual(["attention"]);
    expect(positionStatuses(workflowPositions("work", "PAUSED", state, 600000))).toEqual(["paused"]);
    expect(positionStatuses(workflowPositions("work", "STOPPED", state, 600000))).toEqual(["stopped"]);
  });
  it("replaces a requested date without creating two due actions", () => {
    const { state, definition } = fixture();
    for (const [id, due] of [["one", 600], ["two", 900]] as const) applyBusinessUpdate(state, definition, { kind: "WAIT", runId: state.runs[0].id, scope: "SOURCE_MIX_REMAINDER", source: "CUSTOMER", dueAt: at(due), timezone: "UTC" }, id, at(30));
    expect(state.commitments?.filter(item => item.status === "OPEN")).toHaveLength(1);
    expect(workflowAttentionReasons(definition, state, new Date(900000))).toHaveLength(1);
    expect(state.updates).toHaveLength(2);
  });
  it("can undo an unchanged result while retaining the mistaken update and canceled visits in history", () => {
    const { state, definition } = fixture(); const record = accept(state, definition); advance(state, definition, 41); record.afterFingerprint = workflowFingerprint(state);
    undoBusinessUpdate(state, record.id, "undo", at(45));
    expect(state.visits.filter(visit => visit.runId === state.runs[0].id).map(visit => visit.status)).toEqual(["PENDING", "PENDING"]);
    expect(state.runs.find(run => run.mixId === "booked")?.status).toBe("CANCELED");
    expect(state.updates?.map(item => item.kind)).toEqual(["OUTCOME", "UNDO"]);
    expect(state.updates?.[0].reversedAt).toBe(at(45));
  });
  it("requires correction after performed work and retains that work on correction", () => {
    const { state, definition } = fixture(); const record = accept(state, definition); advance(state, definition, 41); record.afterFingerprint = workflowFingerprint(state);
    const downstream = state.visits.find(visit => visit.runId === state.runs.find(run => run.mixId === "booked")!.id)!;
    observeWorkflow(state, [{ visitId: downstream.id, status: "DONE", completedAt: at(42), outcome: "sent" }]);
    expect(() => undoBusinessUpdate(state, record.id, "undo", at(45))).toThrow("moved on");
    applyBusinessUpdate(state, definition, { kind: "OUTCOME", runId: state.runs[0].id, scope: "SOURCE_MIX_REMAINDER", ruleId: "decision", outcome: "concern" }, "correction", at(46)); advance(state, definition, 60);
    expect(downstream.status).toBe("DONE");
    expect(state.runs.find(run => run.mixId === "concern")?.status).toBe("ACTIVE");
    expect(state.updates?.map(item => item.outcome)).toEqual(["booked", "concern"]);
  });
  it("does not infer outcomes or accept missing or past callback dates", () => {
    const { state, definition } = fixture();
    expect(() => applyBusinessUpdate(state, definition, { kind: "OUTCOME", runId: state.runs[0].id, scope: "SOURCE_MIX_REMAINDER", ruleId: "decision", outcome: "silence means yes" }, "bad", at(30))).toThrow("saved connection");
    expect(() => applyBusinessUpdate(state, definition, { kind: "WAIT", runId: state.runs[0].id, scope: "SOURCE_MIX_REMAINDER", source: "CUSTOMER", dueAt: at(0), timezone: "UTC" }, "bad", at(30))).toThrow("future");
    expect(state.updates).toBeUndefined();
  });
  it("a requested wait does not satisfy a parent join or keep the previous outcome's pending path", () => {
    const { state, definition } = fixture(); accept(state, definition); advance(state, definition, 41);
    const booked = state.runs.find(run => run.mixId === "booked")!;
    applyBusinessUpdate(state, definition, { kind: "WAIT", runId: state.runs[0].id, scope: "SOURCE_MIX_REMAINDER", source: "CUSTOMER", dueAt: at(600), timezone: "UTC" }, "wait", at(45));
    advance(state, definition, 60);
    expect(state.runs[0].status).toBe("ACTIVE");
    expect(booked.status).toBe("CANCELED");
    expect(state.visits.filter(visit => visit.runId === booked.id).every(visit => visit.status === "CANCELED")).toBe(true);
    expect(state.transitions.filter(path => path.status !== "CANCELED")).toHaveLength(0);
  });

});
