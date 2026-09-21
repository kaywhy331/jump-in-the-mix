import type { Prisma } from "@/generated/prisma/client";
import { workflowRuleSchema } from "@/lib/mix-workflow-config";
import { readWorkflowDefinition, saveWorkflowConfiguration } from "@/lib/mix-workflow";
import type { WorkflowConfiguration, WorkflowRule } from "@/lib/mix-workflow-types";

export class WorkflowRuleConflict extends Error {
  constructor(public readonly currentRule: WorkflowRule | null, removing = false) {
    super(removing ? "This connection changed in another window. Review the updated path before deleting it." : currentRule
      ? "This connection changed in another window. Your edits are still here. Review the saved version before replacing it."
      : "This connection was removed in another window. Your edits are still here. You can restore it or cancel.");
  }
}

export type WorkflowPathRemoval = { kind: "route"; routeId: string } | { kind: "join" } | { kind: "rule" };

/** Delete only the reviewed path, preserving unrelated changes and safe response-loss retries. */
export async function removeWorkflowPath(db: Prisma.TransactionClient, workspaceId: string, expected: WorkflowRule, removal: WorkflowPathRemoval, actorUserId: string) {
  const base = workflowRuleSchema.parse(expected);
  if (removal.kind === "route" && !base.routes.some(route => route.id === removal.routeId)) throw new Error("Select a saved path to delete.");
  if (removal.kind === "join" && !base.join) throw new Error("Select a saved join to delete.");
  await db.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
  const definition = await readWorkflowDefinition(db, workspaceId);
  const configuration: WorkflowConfiguration = { rules: definition.rules, gatedStepIds: definition.gatedStepIds, intentionalEnds: definition.intentionalEnds };
  const current = definition.rules.find(rule => rule.id === base.id);
  if (!current || removal.kind === "route" && !current.routes.some(route => route.id === removal.routeId) || removal.kind === "join" && !current.join) return { revision: definition.revision, configuration };
  if (JSON.stringify(current) !== JSON.stringify(base)) throw new WorkflowRuleConflict(current, true);
  const routes = removal.kind === "route" ? current.routes.filter(route => route.id !== removal.routeId) : current.routes;
  const replacement = removal.kind === "rule" || !routes.length ? null : { ...current, routes, join: removal.kind === "join" ? null : current.join };
  // Entry policies remain explicit: removing a path must not silently schedule its destination Beat.
  const next = { ...configuration, rules: configuration.rules.flatMap(rule => rule.id !== base.id ? [rule] : replacement ? [replacement] : []) };
  const revision = await saveWorkflowConfiguration(db, workspaceId, next, definition.revision, actorUserId);
  return { revision, configuration: next };
}

/** Merge one connection under the workspace lock; retries never replay a successful save. */
export async function saveWorkflowRule(db: Prisma.TransactionClient, workspaceId: string, input: WorkflowRule, expected: WorkflowRule | null, actorUserId: string) {
  const rule = workflowRuleSchema.parse(input), base = expected ? workflowRuleSchema.parse(expected) : null;
  if (base && base.id !== rule.id) throw new Error("The edited connection does not match its saved version. Reopen it and try again.");
  await db.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
  const definition = await readWorkflowDefinition(db, workspaceId);
  const configuration: WorkflowConfiguration = { rules: definition.rules, gatedStepIds: definition.gatedStepIds, intentionalEnds: definition.intentionalEnds };
  const current = definition.rules.find(item => item.id === rule.id) ?? null;
  // Schema parsing gives both the JSONB record and the request the same property order.
  const equal = (a: WorkflowRule | null, b: WorkflowRule | null) => JSON.stringify(a) === JSON.stringify(b);
  if (equal(current, rule)) return { revision: definition.revision, configuration };
  if (!equal(current, base)) throw new WorkflowRuleConflict(current);
  const gated = new Set(configuration.gatedStepIds);
  for (const route of rule.routes) if (route.target?.stepId) gated.add(route.target.stepId);
  if (rule.join?.target.stepId) gated.add(rule.join.target.stepId);
  const next = { ...configuration, rules: [...configuration.rules.filter(item => item.id !== rule.id), rule], gatedStepIds: [...gated] };
  const revision = await saveWorkflowConfiguration(db, workspaceId, next, definition.revision, actorUserId);
  return { revision, configuration: next };
}
