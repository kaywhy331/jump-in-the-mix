import { describe, expect, it } from "vitest";
import { endEnrollmentRun, ENROLLMENT_REMOVED_REASON, ENROLLMENT_UNDONE_REASON, reopenEnrollmentRun, workflowTookUpdate } from "../src/lib/enrollment-workflow";
import { observeWorkflow } from "../src/lib/mix-workflow-engine";
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
  it.each([ENROLLMENT_REMOVED_REASON, ENROLLMENT_UNDONE_REASON])("ignores delayed observations after %s until an explicit restart (REOPEN-01)", reason => {
    const state = base();
    endEnrollmentRun(state, "ACTIVE", reason, at);
    const ended = structuredClone(state);
    // A delayed Journey pass can read a reconciled completion as HELD and an older
    // snapshot of an unfinished Beat as DONE. Neither can reopen an ended run.
    observeWorkflow(state, [
      { visitId: "done", status: "HELD", completedAt: null, outcome: null, reason: "reconciled" },
      { visitId: "next", status: "DONE", completedAt: at, outcome: "completed" }
    ]);
    expect(state).toEqual(ended);

    // A later deliberate start still admits observations for the same occurrence.
    expect(reopenEnrollmentRun(state, "STOPPED")).toBe("ACTIVE");
    observeWorkflow(state, [{ visitId: "next", status: "DONE", completedAt: at, outcome: "completed" }]);
    expect(state.visits.find(item => item.id === "next")?.status).toBe("DONE");
    expect(state.visits.find(item => item.id === "done")?.status).toBe("DONE");
  });

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
    observeWorkflow(state, [{ visitId: "child-visit", status: "DONE", completedAt: at, outcome: "completed" }]);
    expect(state.visits.find(item => item.id === "child-visit")!.status).toBe("DONE");
    expect(state.runs[0].status).toBe("CANCELED");
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

  it("treats a run the owner moved on with a business update as theirs", () => {
    expect(workflowTookUpdate(base())).toBe(false);
    expect(workflowTookUpdate({ ...base(), updates: [{ id: "update" } as never] })).toBe(true);
    expect(workflowTookUpdate({ ...base(), runs: [run("root", "estimate", { legacy: false })] })).toBe(true);
  });
});
