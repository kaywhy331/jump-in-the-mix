import { z } from "zod";
import { emptyWorkflow, type WorkflowConfiguration } from "@/lib/mix-workflow-types";

const identifier = z.string().min(1).max(160);
const target = z.object({ mixId: identifier, stepId: identifier.nullable() }).strict();
export const workflowRuleSchema = z.object({
    id: identifier, name: z.string().trim().min(1).max(160), source: target,
    enabled: z.boolean(), mode: z.enum(["CHOICE", "PARALLEL"]),
    routes: z.array(z.object({
      id: identifier, label: z.string().trim().min(1).max(160), when: z.enum(["FINISHED", "OUTCOME", "TIMEOUT"]),
      outcome: z.string().trim().max(160), delayMinutes: z.number().int().min(0).max(525600),
      target: target.nullable(), maxVisits: z.number().int().min(1).max(100).nullable(), replace: z.boolean()
    }).strict()).min(1).max(50),
    join: z.object({ mode: z.enum(["ALL", "ANY"]), target, cancelRemaining: z.boolean() }).strict().nullable()
  }).strict();
export const workflowConfigurationSchema = z.object({
  rules: z.array(workflowRuleSchema).max(1000),
  gatedStepIds: z.array(identifier).max(25000), intentionalEnds: z.array(identifier).max(25000)
}).strict();

export function workflowConfiguration(value: unknown): WorkflowConfiguration {
  if (!value) return emptyWorkflow();
  return workflowConfigurationSchema.parse(value);
}

export { validateWorkflow } from "@/lib/mix-workflow-validation";
