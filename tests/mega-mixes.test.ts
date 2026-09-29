import { describe, expect, it } from "vitest";
import { MEGA_MIXES, matchedMegaMix, megaMixConfiguration, suggestedMegaMix, type MegaMix } from "@/lib/mega-mixes";
import { workflowConfiguration, validateWorkflow } from "@/lib/mix-workflow-config";
import { startWorkflow, advanceWorkflow, observeWorkflow, recordWorkflowDecision } from "@/lib/mix-workflow-engine";
import type { WorkflowDefinition } from "@/lib/mix-workflow-types";

function definition(blueprint: MegaMix): WorkflowDefinition {
  const ids = Object.fromEntries(blueprint.nodes.map(node => [node.key, node.key]));
  return { ...megaMixConfiguration(blueprint, ids, blueprint.id), revision: 1,
    mixes: blueprint.nodes.map(node => ({ id: node.key, name: node.name, status: "ACTIVE", source: "MEGA_MIX", triggerMode: "MANUAL_START",
      steps: node.steps.map((step, i) => ({ ...step, id: `${node.key}-${i}`, versionId: `${node.key}-v-${i}`, plannedAt: null, anchor: "CALENDAR_DAY", offsetMinutes: null, subject: step.subject ?? null, body: step.body ?? null, script: step.script ?? null })) })) };
}

describe("complete journey blueprints", () => {
  it.each(MEGA_MIXES)("$name has a connected, valid graph with bounded return paths", blueprint => {
    const graph = definition(blueprint);
    expect(() => workflowConfiguration({ rules: graph.rules, gatedStepIds: graph.gatedStepIds, intentionalEnds: graph.intentionalEnds })).not.toThrow();
    expect(validateWorkflow(graph, graph)).toEqual([]);
    const reached = new Set(blueprint.roots), visit = [...blueprint.roots];
    while (visit.length) {
      const key = visit.shift();
      for (const route of blueprint.nodes.find(node => node.key === key)!.paths) if (route.to && !reached.has(route.to)) { reached.add(route.to); visit.push(route.to); }
    }
    expect([...reached].sort()).toEqual(blueprint.nodes.map(node => node.key).sort());
    expect(new Set(blueprint.nodes.map(node => node.key)).size).toBe(blueprint.nodes.length);
  });

  it("waits for a real contractor estimate decision, then follows only the selected path", () => {
    const graph = definition(MEGA_MIXES[0]), start = new Date("2026-09-22T10:00:00Z"), completedAt = new Date("2026-10-04T10:00:00Z");
    const state = startWorkflow(graph, { mixId: "estimate", stepId: null }, start.toISOString());
    observeWorkflow(state, state.visits.map(visit => ({ visitId: visit.id, status: "DONE", outcome: "completed", completedAt: completedAt.toISOString() })));
    const now = new Date(completedAt.getTime() + 11_000);
    advanceWorkflow(state, graph, { now, admittedAt: start });
    expect(state.runs.map(run => run.mixId)).toEqual(["estimate"]);
    expect(state.evaluations[0].status).toBe("WAITING");
    recordWorkflowDecision(state, graph, state.evaluations[0].id, "Estimate accepted", now.toISOString());
    advanceWorkflow(state, graph, { now, admittedAt: start });
    expect(state.runs.map(run => run.mixId)).toEqual(["estimate", "booked"]);
    expect(state.runs.some(run => run.mixId === "review")).toBe(false);
  });

  it("closed estimates finish without starting another campaign, including skipped Beats", () => {
    const graph = definition(MEGA_MIXES[0]), start = new Date("2026-09-22T10:00:00Z");
    const state = startWorkflow(graph, { mixId: "estimate", stepId: null }, start.toISOString());
    observeWorkflow(state, state.visits.map(visit => ({ visitId: visit.id, status: "SKIPPED", outcome: null, completedAt: start.toISOString() })));
    const now = new Date(start.getTime() + 11_000);
    advanceWorkflow(state, graph, { now, admittedAt: start });
    expect(state.runs).toHaveLength(1);
    recordWorkflowDecision(state, graph, state.evaluations[0].id, "Close this journey", now.toISOString());
    advanceWorkflow(state, graph, { now, admittedAt: start });
    expect(state.runs).toHaveLength(1);
    expect(state.transitions[0].target).toBeNull();
  });

  it("waits six months before a contractor's repeat-work follow-up", () => {
    const graph = definition(MEGA_MIXES[0]), start = new Date("2026-09-22T10:00:00Z");
    const state = startWorkflow(graph, { mixId: "referral", stepId: null }, start.toISOString());
    observeWorkflow(state, [{ visitId: state.visits[0].id, status: "DONE", outcome: "completed", completedAt: start.toISOString() }]);
    advanceWorkflow(state, graph, { now: new Date(start.getTime() + 11_000), admittedAt: start });
    expect(state.transitions[0].status).toBe("WAITING");
    expect(state.runs).toHaveLength(1);
    advanceWorkflow(state, graph, { now: new Date(start.getTime() + 180 * 86400_000), admittedAt: start });
    expect(state.runs.map(run => run.mixId)).toEqual(["referral", "nurture"]);
  });
});

describe("the Mega-Mix suggested after the one-person start", () => {
  it("names the Mega-Mix that the marketing example or a single matching business type points to", () => {
    expect(matchedMegaMix(null, "real-estate~not-ready")).toBe("real-estate");
    expect(matchedMegaMix("Professional services", "photography")).toBe("photographer");
    expect(matchedMegaMix("Home services")).toBe("contractor");
    expect(matchedMegaMix("Real estate", null)).toBe("real-estate");
  });

  it("names none when several Mega-Mixes share the business type or none fits it", () => {
    expect(matchedMegaMix("Professional services")).toBeNull();
    expect(matchedMegaMix("Insurance & finance")).toBeNull();
    expect(matchedMegaMix("Other")).toBeNull();
    expect(matchedMegaMix(null, null)).toBeNull();
  });

  it("keeps the Mega-Mix that onboarding and the library preselect unchanged", () => {
    expect(suggestedMegaMix("Professional services")).toBe("consultant");
    expect(suggestedMegaMix("Insurance & finance")).toBe("contractor");
    expect(suggestedMegaMix(null, "consulting~proposal-sent")).toBe("consultant");
    expect(suggestedMegaMix("Real estate")).toBe("real-estate");
  });
});
