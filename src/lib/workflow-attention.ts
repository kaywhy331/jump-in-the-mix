import { prisma } from "@/lib/prisma";
import { workflowDefinition, workflowState } from "@/lib/mix-workflow";
import type { WorkflowDefinition, WorkflowState } from "@/lib/mix-workflow-types";

export type WorkflowAttentionItem = { id: string; contactId: string; contactName: string; label: string; reason: string; href: string; action: string };
export type WorkflowAttention = { items: WorkflowAttentionItem[]; total: number; preparing: boolean; offset?: number; future?: Array<WorkflowAttentionItem & { dueAt: string; timezone: string }>; futureTotal?: number; futureOffset?: number };

/** A missing owner decision is not evidence that the customer has not answered. */
export function workflowAttentionReasons(definition: WorkflowDefinition, state: WorkflowState, now = new Date()): Array<{ id: string; reason: string; action: string }> {
  const items: Array<{ id: string; reason: string; action: string }> = [];
  if (state.pendingBusinessUpdate) return [{ id: "saved-update", reason: "Update saved; waiting for an already-processing message.", action: "Review progress" }];
  for (const commitment of state.commitments ?? []) if (commitment.status === "OPEN" && Date.parse(commitment.dueAt) <= now.getTime()) items.push({ id: commitment.id, reason: commitment.source === "CUSTOMER" ? "The customer's callback time has arrived." : "It is time for the check-in you chose.", action: "Record update" });
  for (const evaluation of state.evaluations) {
    if (state.commitments?.some(item => item.runId === evaluation.runId && item.status === "OPEN")) continue;
    const rule = definition.rules.find(rule => rule.id === evaluation.ruleId);
    if (evaluation.status === "WAITING" && !evaluation.outcome && rule?.routes.some(route => route.when === "OUTCOME")) {
      items.push({ id: evaluation.id, reason: rule.name, action: "Record update" });
    }
  }
  const repairs = new Map<string, string>();
  for (const visit of state.visits.filter(visit => visit.status === "HELD" && !/^(This instance is paused|This Mix or the Mix that started|Contact is archived)/.test(visit.reason ?? ""))) repairs.set(visit.reason ?? "A follow-up needs its timing checked.", visit.id);
  for (const path of state.transitions.filter(path => path.status === "HELD")) repairs.set(path.reason ?? "A connection needs attention.", path.id);
  if (state.issue) repairs.set(state.issue, "issue");
  if (state.pendingChoices?.length && !items.length && !repairs.size) repairs.set("An update is saved and needs its connection checked.", "saved-choice");
  for (const [reason, id] of repairs) items.push({ id: `repair:${id}`, reason, action: /appointment/i.test(reason) ? "Choose a date" : "Review progress" });
  return items;
}

/** Page through all active work so a roster limit cannot hide obligations or undercount a digest. */
export async function readWorkflowAttention(workspaceId: string, limit = 30, offset = 0, now = new Date(), futureOffset = 0): Promise<WorkflowAttention> {
  const items: WorkflowAttentionItem[] = [];
  const future: NonNullable<WorkflowAttention["future"]> = [];
  let futureTotal = 0;
  let total = 0, cursor: string | undefined;
  for (;;) {
    const page = await prisma.mixWorkflowInstance.findMany({
      where: { workspaceId, status: "ACTIVE", contact: { archivedAt: null, OR: [{ relationshipState: null }, { relationshipState: { doNotContact: false } }] } },
      select: { id: true, updatedAt: true, contactId: true, label: true, state: true, definition: true, contact: { select: { displayName: true } } },
      orderBy: { id: "asc" }, take: 250, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    const failures = await workflowPreparationFailures(workspaceId, page);
    for (const instance of page) {
      const state = workflowState(instance.state);
      for (const commitment of state.commitments ?? []) if (commitment.status === "OPEN" && Date.parse(commitment.dueAt) > now.getTime()) {
        futureTotal++;
        future.push({ id: commitment.id, contactId: instance.contactId, contactName: instance.contact.displayName, label: instance.label, reason: commitment.source === "CUSTOMER" ? "Customer requested a callback" : "Your planned check-in", action: "Review work", dueAt: commitment.dueAt, timezone: commitment.timezone, href: `/journey?${new URLSearchParams({ contactId: instance.contactId, work: instance.id })}` });
      }
      const reasons = workflowAttentionReasons(workflowDefinition(instance.definition), state, now);
      if (failures.has(instance.id)) reasons.push({ id: "preparation-failed", reason: "Follow-up preparation needs another try.", action: "Review progress" });
      for (const item of reasons) {
      total++;
      if (total > offset && items.length < limit) items.push({ ...item, id: `${instance.id}:${item.id}`, contactId: instance.contactId, contactName: instance.contact.displayName, label: instance.label,
        href: `/journey?${new URLSearchParams({ contactId: instance.contactId, work: instance.id })}` });
    }
    }
    if (page.length < 250) break;
    cursor = page.at(-1)!.id;
  }
  const preparing = Boolean(await prisma.job.findFirst({ where: { workspaceId, task: "mix-workflow", completedAt: null, failedAt: null }, select: { id: true } }));
  return { items, total, preparing, offset, future: future.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id)).slice(futureOffset, futureOffset + limit), futureTotal, futureOffset };
}

export async function workflowPreparationFailures(workspaceId: string, instances: Array<{ id: string; updatedAt: Date }>): Promise<Set<string>> {
  if (!instances.length) return new Set();
  const failures = await prisma.job.findMany({ where: { workspaceId, task: "mix-workflow", completedAt: null, failedAt: { not: null }, OR: instances.map(instance => ({ payload: { path: ["instanceId"], equals: instance.id }, failedAt: { gt: instance.updatedAt } })) }, select: { payload: true } });
  return new Set(failures.flatMap(job => { const id = (job.payload as { instanceId?: unknown })?.instanceId; return typeof id === "string" ? [id] : []; }));
}
