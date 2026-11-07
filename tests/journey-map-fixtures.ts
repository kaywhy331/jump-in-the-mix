import type { WorkflowRule } from "@/lib/mix-workflow-types";

const rule = (source: string, targets: string[], join?: string, returning = false): WorkflowRule => ({
  id: `rule-${source}-${targets.join("-")}`, name: "Review the next conversation", enabled: true, mode: "PARALLEL",
  source: { mixId: source, stepId: null },
  join: join ? { mode: "ALL", target: { mixId: join, stepId: null }, cancelRemaining: false } : null,
  routes: targets.map(destination => ({ id: `${source}-${destination}`, label: "After completing the conversation and reviewing the next step", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mixId: destination, stepId: null }, maxVisits: returning ? 2 : null, replace: false })),
});

// The same four graphs are used for rendered measurements and layout regression checks.
export const journeyMapFixtures = {
  dense: [rule("a", ["f", "e", "d"]), rule("b", ["d", "e", "f"]), rule("c", ["f", "d", "e"])],
  fork: [rule("a", ["d", "b", "c"])],
  join: [rule("a", ["d", "b", "c"], "e")],
  return: [rule("a", ["b"]), rule("b", ["c"]), rule("c", ["a"], undefined, true), rule("b", ["b"], undefined, true)],
};

export function fixtureMixes(rules: WorkflowRule[]) {
  const ids = new Set(rules.flatMap(rule => [rule.source.mixId, ...rule.routes.map(route => route.target!.mixId), ...(rule.join ? [rule.join.target.mixId] : [])]));
  return [...ids].sort().map((id, index) => ({ id, name: `${id.toUpperCase()} ${index % 2 ? "Follow through" : "A longer conversation about the next steps and the customer's plans"}`, steps: Array.from({ length: index % 3 + 1 }, (_, i) => ({ id: `${id}-${i}` })) }));
}

export function fixturePaths(rules: WorkflowRule[]) {
  return rules.flatMap(rule => rule.routes.flatMap(route => [
    { id: route.id, source: rule.source.mixId, destination: route.target!.mixId, sourceStep: null, destinationStep: null, label: route.label },
    ...(rule.join ? [{ id: `${rule.id}:join:${route.id}`, source: route.target!.mixId, destination: rule.join.target.mixId, sourceStep: null, destinationStep: null, label: "After all selected paths" }] : []),
  ]));
}
