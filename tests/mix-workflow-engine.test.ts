import { describe, expect, it } from "vitest";
import { workflowDecisionRulesForVisit, advanceWorkflow, observeWorkflow, recordWorkflowDecision, startWorkflow, workflowFinished } from "@/lib/mix-workflow-engine";
import { validateWorkflow } from "@/lib/mix-workflow-config";
import type { WorkflowDefinition, WorkflowRoute, WorkflowRule, WorkflowState } from "@/lib/mix-workflow-types";

const at = (seconds: number) => new Date(seconds * 1000).toISOString();
const target = (mixId: string, stepId: string | null = null) => ({ mixId, stepId });
const route = (id: string, mixId: string | null, extra: Partial<WorkflowRoute> = {}): WorkflowRoute => ({ id, label: id, when: "FINISHED", outcome: "", delayMinutes: 0, target: mixId ? target(mixId) : null, maxVisits: null, replace: false, ...extra });
const rule = (routes: WorkflowRoute[], extra: Partial<WorkflowRule> = {}): WorkflowRule => ({ id: "rule", name: "My connection", source: target("a"), enabled: true, mode: "PARALLEL", routes, join: null, ...extra });
function definition(rules: WorkflowRule[] = []): WorkflowDefinition {
  return { revision: 1, rules, gatedStepIds: [], intentionalEnds: [], mixes: ["a", "b", "c", "d"].map(id => ({ id, name: id, source: "USER", status: "ACTIVE", triggerMode: "MANUAL_START", steps: [{ id: `${id}1`, versionId: `${id}v1`, name: id, channel: "SMS", dayOffset: 0, sendTimeMinutes: null, plannedAt: null, anchor: "CALENDAR_DAY", offsetMinutes: null, subject: null, body: "Hello", script: null }] })) };
}
function complete(state: WorkflowState, mixId: string, seconds: number) {
  const run = state.runs.filter(run => run.mixId === mixId && run.status === "ACTIVE").at(-1)!;
  observeWorkflow(state, state.visits.filter(visit => visit.runId === run.id && visit.status === "PENDING").map(visit => ({ visitId: visit.id, status: "DONE", completedAt: at(seconds), outcome: "completed" })));
}
const advance = (state: WorkflowState, def: WorkflowDefinition, seconds: number, extra = {}) => advanceWorkflow(state, def, { now: new Date(seconds * 1000), admittedAt: new Date(0), ...extra });

describe("dynamic Mix workflow execution", () => {
  it("continues for the same instance once after the server Undo window", () => {
    const def = definition([rule([route("ab", "b")])]), state = startWorkflow(def, target("a"), at(0));
    complete(state, "a", 5); advance(state, def, 10);
    expect(state.runs).toHaveLength(1); expect(workflowFinished(state)).toBe(false);
    advance(state, def, 16); advance(state, def, 30);
    expect(state.runs.map(run => run.mixId)).toEqual(["a", "b"]);
  });
  it("does not route historical completions admitted after they happened", () => {
    const def = definition([rule([route("ab", "b")])]), state = startWorkflow(def, target("a"), at(0));
    complete(state, "a", 5);
    advanceWorkflow(state, def, { now: new Date(50000), admittedAt: new Date(10000) });
    expect(state.transitions).toHaveLength(0);
  });
  it("keeps independent instances and separate repeated admissions distinct", () => {
    const def = definition([rule([route("ab", "b")])]);
    const first = startWorkflow(def, target("a"), at(0)), second = startWorkflow(def, target("a"), at(0));
    complete(first, "a", 5); advance(first, def, 20);
    expect(second.runs).toHaveLength(1); expect(second.visits[0].status).toBe("PENDING");
  });
  it("waits for an account-defined decision then chooses the configured path", () => {
    const def = definition([rule([route("one", "b", { when: "OUTCOME", outcome: "custom-one" }), route("two", "c", { when: "OUTCOME", outcome: "custom-two" })], { mode: "CHOICE" })]);
    const state = startWorkflow(def, target("a"), at(0)); complete(state, "a", 5); advance(state, def, 20);
    expect(workflowFinished(state)).toBe(false); expect(state.transitions).toHaveLength(0);
    recordWorkflowDecision(state, def, state.evaluations[0].id, "custom-two", at(30)); advance(state, def, 30);
    expect(state.runs.map(run => run.mixId)).toEqual(["a", "c"]);
  });
  it("branches together and joins only this fork's selected participants", () => {
    const def = definition([rule([route("ab", "b"), route("ac", "c")], { join: { mode: "ALL", target: target("d"), cancelRemaining: false } })]);
    const state = startWorkflow(def, target("a"), at(0)); complete(state, "a", 5); advance(state, def, 20);
    complete(state, "b", 25); advance(state, def, 40); expect(state.runs.some(run => run.mixId === "d")).toBe(false);
    complete(state, "c", 45); advance(state, def, 60); advance(state, def, 70);
    expect(state.runs.filter(run => run.mixId === "d")).toHaveLength(1);
  });
  it("first-result join cancels only its unfinished owned branch", () => {
    const def = definition([rule([route("ab", "b"), route("ac", "c")], { join: { mode: "ANY", target: target("d"), cancelRemaining: true } })]);
    const state = startWorkflow(def, target("a"), at(0)); complete(state, "a", 5); advance(state, def, 20);
    complete(state, "b", 25); advance(state, def, 40);
    expect(state.runs.find(run => run.mixId === "c")?.status).toBe("CANCELED");
    expect(state.runs.filter(run => run.mixId === "d")).toHaveLength(1);
  });
  it("a canceled required branch never satisfies an all-paths join", () => {
    const def = definition([rule([route("ab", "b"), route("ac", "c")], { join: { mode: "ALL", target: target("d"), cancelRemaining: false } })]);
    const state = startWorkflow(def, target("a"), at(0)); complete(state, "a", 5); advance(state, def, 20);
    complete(state, "b", 25); state.runs.find(run => run.mixId === "c")!.status = "CANCELED"; advance(state, def, 40);
    expect(state.runs.some(run => run.mixId === "d")).toBe(false);
  });
  it("a timeout waits until its anchor and a recorded decision supersedes silence", () => {
    const def = definition([rule([route("reply", "b", { when: "OUTCOME", outcome: "ready" }), route("silence", "c", { when: "TIMEOUT", delayMinutes: 2 })], { mode: "CHOICE" })]);
    const state = startWorkflow(def, target("a"), at(0)); complete(state, "a", 5); advance(state, def, 100);
    expect(state.transitions).toHaveLength(0);
    recordWorkflowDecision(state, def, state.evaluations[0].id, "ready", at(110)); advance(state, def, 200);
    expect(state.runs.map(run => run.mixId)).toEqual(["a", "b"]);
  });
  it("correcting a decision retains completed actions and stops obsolete queued work", () => {
    const def = definition([rule([route("yes", "b", { when: "OUTCOME", outcome: "yes" }), route("later", "c", { when: "OUTCOME", outcome: "later" })], { mode: "CHOICE" })]);
    const state = startWorkflow(def, target("a"), at(0)); complete(state, "a", 5); advance(state, def, 20);
    recordWorkflowDecision(state, def, state.evaluations[0].id, "yes", at(21)); advance(state, def, 21);
    complete(state, "b", 22);
    recordWorkflowDecision(state, def, state.evaluations[0].id, "later", at(25)); advance(state, def, 25);
    expect(state.visits.find(visit => visit.stepId === "b1")?.status).toBe("DONE");
    expect(state.runs.find(run => run.mixId === "b")?.status).toBe("CANCELED");
    expect(state.runs.some(run => run.mixId === "c")).toBe(true);
  });
  it("reopening a source invalidates its descendants without deleting their history", () => {
    const def = definition([rule([route("ab", "b")])]), state = startWorkflow(def, target("a"), at(0));
    complete(state, "a", 5); advance(state, def, 20);
    observeWorkflow(state, [{ visitId: state.visits[0].id, status: "PENDING", completedAt: null, outcome: null }]);
    expect(state.runs.find(run => run.mixId === "b")?.status).toBe("CANCELED");
    expect(state.visits[0].status).toBe("PENDING");
  });
  it("allows repeat visits with separate identities and holds at the configured limit", () => {
    const def = definition([rule([route("repeat", "a", { maxVisits: 2 })])]), state = startWorkflow(def, target("a"), at(0));
    for (const seconds of [5, 25, 45]) { complete(state, "a", seconds); advance(state, def, seconds + 11); }
    expect(state.runs).toHaveLength(3); expect(new Set(state.visits.map(visit => visit.id)).size).toBe(3);
    expect(state.transitions.at(-1)?.reason).toContain("Repeat limit");
  });
  it("holds a paused destination and resumes that same logical admission", () => {
    const def = definition([rule([route("ab", "b")])]), state = startWorkflow(def, target("a"), at(0));
    complete(state, "a", 5); advance(state, def, 20, { unavailableMixes: new Set(["b"]) });
    expect(state.transitions[0].status).toBe("HELD"); advance(state, def, 30);
    expect(state.runs.filter(run => run.mixId === "b")).toHaveLength(1);
  });
  it("gated Beats wait for their connection and keep the run open through its delay", () => {
    const def = definition([rule([route("next", "a", { target: target("a", "a2"), delayMinutes: 2 })], { source: target("a", "a1") })]);
    def.mixes[0].steps.push({ ...def.mixes[0].steps[0], id: "a2" }); def.gatedStepIds = ["a2"];
    const state = startWorkflow(def, target("a"), at(0)); expect(state.visits).toHaveLength(1);
    complete(state, "a", 5); advance(state, def, 20); expect(state.runs[0].status).toBe("ACTIVE");
    advance(state, def, 130); expect(state.visits.map(visit => visit.stepId)).toEqual(["a1", "a2"]);
  });
  it("offers a whole-Mix outcome on its last ordinary Beat only", () => {
    const def = definition([rule([route("ready", "b", { when: "OUTCOME", outcome: "Ready" })])]);
    def.mixes[0].steps.push({ ...def.mixes[0].steps[0], id: "a2" });
    const state = startWorkflow(def, target("a"), at(0));
    expect(workflowDecisionRulesForVisit(def, state, state.visits[0].id)).toHaveLength(0);
    state.visits[0].status = "DONE"; state.visits[0].completedAt = at(1);
    expect(workflowDecisionRulesForVisit(def, state, state.visits[1].id)).toHaveLength(1);
  });
  it("keeps the Undo window before joining Beat destinations", () => {
    const def = definition([rule([route("second", "a", { target: target("a", "a2") })], { source: target("a", "a1"), join: { mode: "ANY", target: target("b"), cancelRemaining: false } })]);
    def.mixes[0].steps.push({ ...def.mixes[0].steps[0], id: "a2" }); def.gatedStepIds = ["a2"];
    const state = startWorkflow(def, target("a"), at(0)); complete(state, "a", 5); advance(state, def, 20);
    complete(state, "a", 25); advance(state, def, 30);
    expect(state.runs.some(run => run.mixId === "b")).toBe(false);
    advance(state, def, 36); expect(state.runs.some(run => run.mixId === "b")).toBe(true);
  });
  it("a join waits for the destination's unresolved decision", () => {
    const def = definition([rule([route("ab", "b")], { join: { mode: "ALL", target: target("d"), cancelRemaining: false } }), rule([route("end", null, { when: "OUTCOME", outcome: "Finish" })], { id: "decision-b", source: target("b"), mode: "CHOICE" })]);
    const state = startWorkflow(def, target("a"), at(0)); complete(state, "a", 5); advance(state, def, 20); complete(state, "b", 25); advance(state, def, 40);
    expect(state.runs.some(run => run.mixId === "d")).toBe(false);
    recordWorkflowDecision(state, def, state.evaluations.find(item => item.ruleId === "decision-b")!.id, "Finish", at(41)); advance(state, def, 41);
    expect(state.runs.some(run => run.mixId === "d")).toBe(true);
  });
  it("requires separate groups for immediate and outcome-dependent paths", () => {
    const def = definition([rule([route("one", "b"), route("two", "c", { when: "OUTCOME", outcome: "Ready" })])]);
    expect(validateWorkflow(def, def).join()).toContain("separate connections");
  });
  it("validates tenant membership, distinct choices and bounded loops", () => {
    const def = definition([rule([route("repeat", "a")])]); expect(validateWorkflow(def, def).join()).toContain("repeat limit");
    def.rules[0].routes[0].maxVisits = 2; expect(validateWorkflow(def, def)).toEqual([]);
    def.rules[0].routes[0].target = target("foreign"); expect(validateWorkflow(def, def).join()).toContain("account");
    def.rules[0] = rule([route("one", "b"), route("two", "c")], { mode: "CHOICE" }); expect(validateWorkflow(def, def).join()).toContain("distinct outcomes");
  });
});
