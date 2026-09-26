import { prisma } from "@/lib/prisma";
import { workflowDefinition, workflowState } from "@/lib/mix-workflow";
import { applyBusinessUpdate } from "@/lib/workflow-business-update";
import { advanceWorkflow, observeWorkflow } from "@/lib/mix-workflow-engine";
import type { WorkflowBusinessUpdate } from "@/lib/mix-workflow-types";
import { UserFacingError } from "@/lib/user-facing-error";

export type BusinessUpdatePreview = { input: WorkflowBusinessUpdate; contactName: string; label: string; mixName: string; ends: string[]; keepsCompleted: number; independentPending: number; continues: string[]; sending: string; inFlight: number; previousMessages: number; revision: number };
export async function previewBusinessUpdate(workspaceId: string, instanceId: string, input: WorkflowBusinessUpdate, expectedRevision: number): Promise<BusinessUpdatePreview> {
  const instance = await prisma.mixWorkflowInstance.findFirst({ where: { id: instanceId, workspaceId }, include: { contact: { select: { displayName: true } }, jumps: true } });
  if (!instance || instance.revision !== expectedRevision) throw new UserFacingError("This work changed. Refresh its progress before reviewing the update.");
  if (instance.status === "STOPPED") throw new UserFacingError("This work is stopped. Start new work deliberately from Journey.");
  const definition = workflowDefinition(instance.definition), state = workflowState(instance.state);
  const run = state.runs.find(run => run.id === input.runId);
  observeWorkflow(state, instance.jumps.filter(jump => jump.workflowVisitId && jump.status !== "CANCELED").map(jump => ({ visitId: jump.workflowVisitId!, status: jump.status, completedAt: jump.completedAt?.toISOString() ?? null, outcome: jump.completionMethod })));
  applyBusinessUpdate(state, definition, input, "preview", new Date().toISOString());
  advanceWorkflow(state, definition, { now: new Date(Date.now() + 10001), admittedAt: state.context?.completionCutoff ? new Date(state.context.completionCutoff) : instance.createdAt });
  const ended = instance.jumps.filter(jump => jump.status === "PENDING" && state.visits.some(visit => visit.id === jump.workflowVisitId && visit.status === "CANCELED"));
  const [preference, deliveries] = await Promise.all([
    prisma.automationPreference.findUnique({ where: { workspaceId } }),
    prisma.automatedDelivery.findMany({ where: { workspaceId, jumpId: { in: instance.jumps.map(jump => jump.id) } } })
  ]);
  const rule = definition.rules.find(rule => rule.id === input.ruleId);
  return {
    input, contactName: instance.contact.displayName, label: instance.label, mixName: definition.mixes.find(mix => mix.id === run?.mixId)?.name ?? "This Mix", revision: instance.revision,
    ends: ended.map(jump => definition.mixes.flatMap(mix => mix.steps).find(step => step.id === jump.mixStepId)?.name ?? jump.reason),
    keepsCompleted: instance.jumps.filter(jump => ["DONE", "SKIPPED"].includes(jump.status)).length,
    independentPending: instance.jumps.filter(jump => jump.status === "PENDING" && !ended.includes(jump)).length,
    continues: input.kind === "WAIT" ? ["One check-back action will appear in Today at the saved time. Choose the next step when you review it."] : (rule?.routes.filter(route => route.when === "OUTCOME" && route.outcome === input.outcome).map(route => `${route.target ? definition.mixes.find(mix => mix.id === route.target!.mixId)?.name ?? "Saved destination" : "Finish this path"}${route.delayMinutes ? ` · after ${route.delayMinutes} minutes` : ""}. Existing pauses and restrictions still apply.`) ?? []),
    sending: preference?.enabled ? `Automatic sending is on${preference.emailEnabled ? " for email" : ""}${preference.smsEnabled ? " for text messages" : ""}. Eligible messages wait at least ${preference.reviewWindowMinutes} minutes for review; other steps need you.` : "Customer messages stay available for manual review. Automatic sending is off.",
    inFlight: deliveries.filter(delivery => delivery.status === "PROCESSING").length,
    previousMessages: deliveries.filter(delivery => delivery.status === "DELIVERED" || delivery.status === "FAILED" || delivery.providerId).length
  };
}
