import { z } from "zod";
import { emptyWorkflow, type WorkflowConfiguration, type WorkflowDefinition, workflowNodeKey } from "@/lib/mix-workflow-types";

const identifier = z.string().min(1).max(160);
const target = z.object({ mixId: identifier, stepId: identifier.nullable() }).strict();
export const workflowConfigurationSchema = z.object({
  rules: z.array(z.object({
    id: identifier, name: z.string().trim().min(1).max(160), source: target,
    enabled: z.boolean(), mode: z.enum(["CHOICE", "PARALLEL"]),
    routes: z.array(z.object({
      id: identifier, label: z.string().trim().min(1).max(160), when: z.enum(["FINISHED", "OUTCOME", "TIMEOUT"]),
      outcome: z.string().trim().max(160), delayMinutes: z.number().int().min(0).max(525600),
      target: target.nullable(), maxVisits: z.number().int().min(1).max(100).nullable(), replace: z.boolean()
    }).strict()).min(1).max(50),
    join: z.object({ mode: z.enum(["ALL", "ANY"]), target, cancelRemaining: z.boolean() }).strict().nullable()
  }).strict()).max(1000),
  gatedStepIds: z.array(identifier).max(25000), intentionalEnds: z.array(identifier).max(25000)
}).strict();

export function workflowConfiguration(value: unknown): WorkflowConfiguration {
  if (!value) return emptyWorkflow();
  return workflowConfigurationSchema.parse(value);
}

export function validateWorkflow(configuration: WorkflowConfiguration, definition: Pick<WorkflowDefinition, "mixes">): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const nodes = new Map<string, string[]>();
  const edge = (from: string, to: string) => nodes.set(from, [...(nodes.get(from) ?? []), to]);
  const checkTarget = (value: { mixId: string; stepId: string | null }) => {
    const mix = definition.mixes.find(item => item.id === value.mixId);
    if (!mix || mix.source === "ONE_TIME") issues.push("Choose an available Mix in this account.");
    if (value.stepId && !mix?.steps.some(item => item.id === value.stepId)) issues.push("A connected Beat is no longer available in that Mix.");
  };
  for (const mix of definition.mixes) for (const step of mix.steps) {
    if (!configuration.gatedStepIds.includes(step.id)) edge(`start:${mix.id}`, `beat:${step.id}`);
    edge(`beat:${step.id}`, `mix:${mix.id}`);
  }
  for (const rule of configuration.rules) {
    for (const value of [rule.id, ...rule.routes.map(route => route.id)]) { if (ids.has(value)) issues.push("Connection identifiers must be unique."); ids.add(value); }
    checkTarget(rule.source);
    if (rule.routes.some(route => route.when === "FINISHED") && rule.routes.some(route => route.when !== "FINISHED")) issues.push(`${rule.name}: put immediate completion paths and recorded-outcome paths in separate connections, so no decision is skipped.`);
    if (rule.mode === "CHOICE") {
      const choices = rule.routes.filter(route => route.when !== "TIMEOUT").map(route => route.when === "FINISHED" ? "*" : route.outcome);
      if (new Set(choices).size !== choices.length || (choices.includes("*") && choices.length > 1)) issues.push(`${rule.name}: choose-one paths need distinct outcomes or a single completion route.`);
      if (rule.routes.filter(route => route.when === "TIMEOUT").length > 1) issues.push(`${rule.name}: use one timeout path per decision.`);
    }
    for (const route of rule.routes) {
      if (route.when === "OUTCOME" && !route.outcome) issues.push(`${rule.name}: name the recorded outcome.`);
      if (route.when === "TIMEOUT" && route.delayMinutes < 1) issues.push(`${rule.name}: a wait needs a duration.`);
      if (route.target) {
        checkTarget(route.target);
        if (route.target.stepId && !configuration.gatedStepIds.includes(route.target.stepId)) issues.push("A connected target Beat must be set to wait for its connection, so it is not also scheduled independently.");
        if (rule.enabled && route.maxVisits === null) edge(workflowNodeKey(rule.source), route.target.stepId ? workflowNodeKey(route.target) : `start:${route.target.mixId}`);
      }
    }
    if (rule.join) {
      checkTarget(rule.join.target);
      if (rule.join.target.stepId && !configuration.gatedStepIds.includes(rule.join.target.stepId)) issues.push("A join's target Beat must wait for its connection.");
      for (const route of rule.routes.filter(item => item.target && rule.enabled)) edge(workflowNodeKey(route.target!), rule.join.target.stepId ? workflowNodeKey(rule.join.target) : `start:${rule.join.target.mixId}`);
    }
  }
  for (const stepId of configuration.gatedStepIds) if (!definition.mixes.some(mix => mix.steps.some(step => step.id === stepId))) issues.push("A Beat waiting for a connection no longer exists.");
  const visiting = new Set<string>(), visited = new Set<string>();
  const cycle = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of nodes.get(node) ?? []) if (cycle(next)) return true;
    visiting.delete(node); visited.add(node); return false;
  };
  if ([...nodes.keys()].some(cycle)) issues.push("This return path needs a repeat limit. Set a maximum number of visits on a connection in each loop.");
  return [...new Set(issues)];
}
