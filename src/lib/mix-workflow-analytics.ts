import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { contactIdsWithMixStatus, contactMixStatuses } from "@/lib/contact-mix-status";
import { workflowState } from "@/lib/mix-workflow";
import { readNextActions } from "@/lib/next-action-reader";
import { timezoneForWorkspace } from "@/lib/display-preferences";
import { summarizeWorkflowPeople, workflowPositions, type WorkflowPerson } from "@/lib/workflow-analytics";

/** Scan bounded database pages, then count distinct people across all matching work. */
export async function readWorkflowAnalytics(workspaceId: string, options: { now?: Date; timeZone?: string; contactId?: string; node?: string; status?: string; stage?: string; query?: string; offset?: number }) {
  const observedAt = options.now ?? new Date(), timeZone = options.timeZone ?? await timezoneForWorkspace(workspaceId);
  const people = new Map<string, WorkflowPerson>();
  const contactWhere = { workspaceId, archivedAt: null, ...(options.contactId ? { id: options.contactId } : {}) };
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.contact.findMany({ where: contactWhere, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 250, select: { id: true, displayName: true, journey: { select: { stage: { select: { id: true, name: true } } } } } });
    for (const person of page) people.set(person.id, { id: person.id, displayName: person.displayName, stageId: person.journey?.stage.id ?? "unassigned", stageName: person.journey?.stage.name ?? "No stage", positions: [] });
    if (page.length < 250) break; cursor = page.at(-1)!.id;
  }
  cursor = undefined; const now = observedAt.getTime();
  const where = { workspaceId, contact: contactWhere };
  for (;;) {
    const page: Array<{ id: string; contactId: string; status: string; state: Prisma.JsonValue; jumps: Array<{ id: string; workflowVisitId: string | null; scheduledAt: Date; status: string }> }> = await prisma.mixWorkflowInstance.findMany({ where, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 250, select: { id: true, contactId: true, status: true, state: true, jumps: { select: { id: true, workflowVisitId: true, scheduledAt: true, status: true } } } });
    for (const instance of page) people.get(instance.contactId)?.positions.push(...workflowPositions(instance.id, instance.status, workflowState(instance.state), now, instance.jumps));
    if (page.length < 250) break; cursor = page.at(-1)!.id;
  }
  // Existing scheduled follow-ups also belong in Journey, before workflow adoption.
  cursor = undefined;
  for (;;) {
    const page: Array<{ id: string; contactId: string; mixId: string; mixStepId: string; status: string; scheduledAt: Date }> = await prisma.jump.findMany({ where: { ...where, workflowInstanceId: null }, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 250, select: { id: true, contactId: true, mixId: true, mixStepId: true, status: true, scheduledAt: true } });
    for (const jump of page) {
      const pending = jump.status === "PENDING", waiting = jump.scheduledAt.getTime() > now;
      people.get(jump.contactId)?.positions.push({ mixId: jump.mixId, stepId: jump.mixStepId, instanceId: null, jumpId: jump.id, status: pending ? waiting ? "waiting" : "active" : jump.status === "DONE" || jump.status === "SKIPPED" ? "completed" : "stopped", reason: pending ? waiting ? "Scheduled" : "Follow-up ready" : jump.status === "SKIPPED" ? "Beat skipped" : jump.status === "CANCELED" ? "Follow-up stopped" : "Follow-up completed", dueAt: pending ? jump.scheduledAt.toISOString() : null });
    }
    if (page.length < 250) break; cursor = page.at(-1)!.id;
  }
  // The same No Mix definition as Contacts and Today, so the counts agree (JITM-09 §2.77).
  const noMix = new Set(options.contactId ? (await contactMixStatuses(workspaceId, [options.contactId])).get(options.contactId) === "no-mix" ? [options.contactId] : [] : await contactIdsWithMixStatus(workspaceId, "no-mix"));
  for (const person of people.values()) if (noMix.has(person.id)) person.noMix = true;
  const analytics = summarizeWorkflowPeople([...people.values()], options);
  const { items, ...nextProjection } = await readNextActions(workspaceId, { now: observedAt, timeZone, contactIds: analytics.roster.map(person => person.id) });
  analytics.nextProjection = nextProjection;
  for (const person of analytics.roster) {
    person.nextActions = items.filter(item => item.contactId === person.id);
    person.next = person.nextActions[0] ?? null;
  }
  return analytics;
}
