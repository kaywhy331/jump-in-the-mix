import { describe, expect, it } from "vitest";
import { endEnrollmentRun, ENROLLMENT_REMOVED_REASON, reopenEnrollmentRun } from "../src/lib/enrollment-workflow";
import type { WorkflowState } from "../src/lib/mix-workflow-types";

// Ending an enrollment's Journey run, and picking it back up for a later start of the same occurrence (UNDO-04).
const at = "2026-10-06T12:00:00.000Z";
const run = (id: string, mixId: string, extra: Partial<WorkflowState["runs"][number]> = {}) => ({ id, mixId, startedAt: at, completedAt: null, status: "ACTIVE" as const, parentTransitionId: null, legacy: true, ...extra });
const visit = (id: string, runId: string, status: WorkflowState["visits"][number]["status"], reason: string | null = null) => ({ id, runId, stepId: `step-${id}`, readyAt: at, status, completedAt: status === "DONE" ? at : null, outcome: null, reason, parentTransitionId: null });
const base = (): WorkflowState => ({
  sequence: 9, commands: [], issue: null,
  runs: [run("root", "estimate")],
  visits: [visit("done", "root", "DONE"), visit("held", "root", "HELD", "reconciled"), visit("next", "root", "PENDING")],
  evaluations: [{ id: "decision", ruleId: "rule", runId: "root", visitId: "done", occurredAt: at, outcome: null, decidedAt: null, generation: 1, status: "WAITING", joined: false }],
  transitions: [],
  pendingChoices: [{ requestId: "choice", visitId: "done", sourceCompletedAt: at, decisions: [{ ruleId: "rule", outcome: "Booked" }] }],
  context: { timezone: "UTC", appointmentBindingId: null, occurrenceKey: "manual:2026-10-06" }
});

describe("ending and reopening an enrollment's Journey run", () => {
  it("ends the run's Beats and waits, keeps settled history, and stops a record with nothing else running", () => {
    const state = base();
    expect(endEnrollmentRun(state, "ACTIVE", ENROLLMENT_REMOVED_REASON, at)).toBe("STOPPED");
    expect(state.runs[0].status).toBe("CANCELED");
    expect(state.visits.map(item => [item.id, item.status, item.reason])).toEqual([["done", "DONE", null], ["held", "CANCELED", ENROLLMENT_REMOVED_REASON], ["next", "CANCELED", ENROLLMENT_REMOVED_REASON]]);
    expect(state.evaluations[0].status).toBe("CANCELED");
    expect(state.pendingChoices).toEqual([]);
    // Nothing left in it is owner input: no held Beat, so no internal word reaches Today.
    expect(state.visits.some(item => item.status === "HELD")).toBe(false);
    // Ending it again finds nothing more to end.
    expect(endEnrollmentRun(state, "STOPPED", ENROLLMENT_REMOVED_REASON, at)).toBeNull();
  });

  it("keeps work the Journey already moved on to in another Mix running", () => {
    const state = base();
    state.transitions.push({ id: "path", evaluationId: "decision", generation: 1, routeId: "route", dueAt: at, startedAt: at, status: "STARTED", reason: null, target: { mixId: "thank-you", stepId: null }, targetRunId: "child", targetVisitId: null });
    state.runs.push(run("child", "thank-you", { parentTransitionId: "path", legacy: false }));
    state.visits.push({ ...visit("child-visit", "child", "PENDING"), parentTransitionId: "path" });
    expect(endEnrollmentRun(state, "ACTIVE", ENROLLMENT_REMOVED_REASON, at)).toBe("ACTIVE");
    expect(state.runs.map(item => [item.id, item.status])).toEqual([["root", "CANCELED"], ["child", "ACTIVE"]]);
    expect(state.transitions[0].status).toBe("STARTED");
    expect(state.visits.find(item => item.id === "child-visit")!.status).toBe("PENDING");
  });

  it("puts back what it ended for a later start of the same occurrence", () => {
    const state = base();
    endEnrollmentRun(state, "PAUSED", ENROLLMENT_REMOVED_REASON, at);
    expect(reopenEnrollmentRun(state, "STOPPED")).toBe("PAUSED");
    expect(state.runs[0].status).toBe("ACTIVE");
    expect(state.visits.map(item => [item.id, item.status, item.reason])).toEqual([["done", "DONE", null], ["held", "PENDING", null], ["next", "PENDING", null]]);
    expect(state.evaluations[0].status).toBe("WAITING");
    expect(state.pendingChoices).toHaveLength(1);
    expect(state.context?.enrollmentEnded).toBeUndefined();
    expect(reopenEnrollmentRun(state, "PAUSED")).toBeNull();
  });
});
