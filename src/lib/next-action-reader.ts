import { readIntakeReviewWorkItems } from "@/lib/intake-review-reader";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { readPreparationStatus } from "@/lib/preparation";
import { workflowAttentionReasons } from "@/lib/workflow-attention";
import type { WorkflowAttention } from "@/lib/workflow-attention";
import type { WorkflowDefinition, WorkflowState } from "@/lib/mix-workflow-types";
import { logicalDateInTimezone, logicalDateKey } from "@/lib/jump-schedule";
import { resolveNextActions, type NextActionCandidate, type NextActionProjection } from "@/lib/next-action";

export type NextActionReadOptions = {
  now: Date; timeZone: string; contactId?: string;
  /** Trusted server-built follow-up filter, never a client-supplied workspace selector. */
  followUpWhere?: Prisma.JumpWhereInput;
  query?: string; includeOtherActions?: boolean; overdueOnly?: boolean;
  from?: Date; before?: Date;
};
const PAGE_SIZE = 250;

/** Seek by value, not by a row that another device could have deleted. */
async function allPages<T extends { id: string }>(read: (after?: string) => Promise<T[]>): Promise<T[]> {
  const result: T[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await read(after);
    result.push(...page);
    if (page.length < PAGE_SIZE) return result;
    const next = page.at(-1)!.id;
    if (next === after) throw new Error("Next action page did not advance");
    after = next;
  }
}

/** Read-only projection from one database snapshot. Both callers obtain workspaceId from requireWorkspace(). */
export async function readNextActionSnapshot(db: Prisma.TransactionClient, workspaceId: string, options: NextActionReadOptions): Promise<NextActionProjection> {
  const activeContact: Prisma.ContactWhereInput = { workspaceId, archivedAt: null,
    OR: [{ relationshipState: null }, { relationshipState: { doNotContact: false } }],
    ...(options.contactId ? { id: options.contactId } : {}) };
  // Read preparation in the same snapshot, before the obligations it describes.
  const preparation = await readPreparationStatus(workspaceId, options.contactId, db);
  const jumps = await allPages(after => db.jump.findMany({
    where: { workspaceId, status: "PENDING", contact: activeContact, ...(after ? { id: { gt: after } } : {}) },
    select: { id: true, contactId: true, reason: true, scheduledAt: true, updatedAt: true, mixId: true,
      workflowInstanceId: true, workflowVisitId: true, contact: { select: { displayName: true } }, mix: { select: { source: true } } },
    orderBy: { id: "asc" }, take: PAGE_SIZE
  }));
  const matching = options.followUpWhere ? new Set((await allPages(after => db.jump.findMany({
    where: { AND: [{ workspaceId, status: "PENDING", contact: activeContact }, options.followUpWhere!, ...(after ? [{ id: { gt: after } }] : [])] },
    select: { id: true }, orderBy: { id: "asc" }, take: PAGE_SIZE
  }))).map(item => item.id)) : null;
  const candidates: NextActionCandidate[] = jumps.map(jump => ({
    id: jump.workflowInstanceId && jump.workflowVisitId ? `${workspaceId}:visit:${jump.workflowInstanceId}:${jump.workflowVisitId}` : `${workspaceId}:jump:${jump.id}`,
    contactId: jump.contactId, contactName: jump.contact.displayName, kind: "follow-up", title: jump.reason,
    detail: "Prepared follow-up", action: jump.mix.source === "ONE_TIME" ? "Review message" : "Review", href: `/jumps?jump=${encodeURIComponent(jump.id)}&range=all`,
    dueAt: jump.scheduledAt.toISOString(), updatedAt: jump.updatedAt.toISOString(), jumpId: jump.id, mixId: jump.mixId, inView: !matching || matching.has(jump.id),
    ...(jump.workflowInstanceId ? { workId: jump.workflowInstanceId } : {})
  }));
  let preparing = preparation.state === "preparing" || preparation.state === "delayed";
  const other: NextActionCandidate[] = [];
  {
    const instances = await allPages(after => db.mixWorkflowInstance.findMany({
      where: { workspaceId, status: "ACTIVE", contact: activeContact, ...(after ? { id: { gt: after } } : {}) },
      select: { id: true, contactId: true, label: true, state: true, definition: true, updatedAt: true, contact: { select: { displayName: true } } },
      orderBy: { id: "asc" }, take: PAGE_SIZE
    }));
    for (const instance of instances) {
      const state = instance.state as unknown as WorkflowState, definition = instance.definition as unknown as WorkflowDefinition;
      // Invalid/unreadable saved work must never turn into an apparently empty contact.
      if (!state || !definition || !Array.isArray(state.evaluations) || !Array.isArray(state.visits)
        || !Array.isArray(state.transitions) || !Array.isArray(definition.rules)) throw new Error("Unreadable next action source");
      if (state.commitments?.some(item => item.status === "OPEN" && !Number.isFinite(Date.parse(item.dueAt)))) throw new Error("Unreadable commitment date");
      const href = `/journey?${new URLSearchParams({ contactId: instance.contactId, work: instance.id })}`;
      const base = { contactId: instance.contactId, contactName: instance.contact.displayName, title: instance.label,
        href, updatedAt: instance.updatedAt.toISOString(), workId: instance.id };
      const reasons = workflowAttentionReasons(definition, state, options.now);
      // The legacy digest groups identical repair text; Next keeps each distinct blocked obligation.
      if (!state.pendingBusinessUpdate) {
        const repairs = [
          ...state.visits.filter(visit => visit.status === "HELD" && !/^(This instance is paused|This Mix or the Mix that started|Contact is archived)/.test(visit.reason ?? "")).map(visit => ({ id: `repair:${visit.id}`, reason: visit.reason ?? "A follow-up needs its timing checked." })),
          ...state.transitions.filter(path => path.status === "HELD").map(path => ({ id: `repair:${path.id}`, reason: path.reason ?? "A connection needs attention." }))
        ];
        for (const repair of repairs) if (!reasons.some(reason => reason.id === repair.id)) reasons.push({ ...repair, action: /appointment/i.test(repair.reason) ? "Choose a date" : "Review progress" });
      }
      for (const reason of reasons) {
        const commitment = state.commitments?.find(item => item.id === reason.id);
        const outcome = state.evaluations.some(item => item.id === reason.id);
        const visit = reason.id.startsWith("repair:") ? state.visits.find(item => `repair:${item.id}` === reason.id) : null;
        const pending = visit ? jumps.find(jump => jump.workflowInstanceId === instance.id && jump.workflowVisitId === visit.id) : null;
        other.push({ ...base, id: visit ? `${workspaceId}:visit:${instance.id}:${visit.id}` : `${workspaceId}:work:${instance.id}:${reason.id}`,
          kind: commitment ? "commitment" : outcome ? "outcome" : "repair", detail: reason.reason,
          action: outcome ? "Record outcome" : reason.action, dueAt: commitment?.dueAt ?? null, dueTimeZone: commitment?.timezone,
          // Editing the prepared text must not override the current visit's hold.
          ...(pending ? { jumpId: pending.id, updatedAt: new Date(Math.max(instance.updatedAt.getTime(), pending.updatedAt.getTime())).toISOString() } : {}) });
      }
      for (const commitment of state.commitments ?? []) if (commitment.status === "OPEN" && Date.parse(commitment.dueAt) > options.now.getTime()) {
        other.push({ ...base, id: `${workspaceId}:work:${instance.id}:${commitment.id}`, kind: "commitment",
          detail: commitment.source === "CUSTOMER" ? "Customer requested a callback" : "Your planned check-in", action: "Review work", dueAt: commitment.dueAt, dueTimeZone: commitment.timezone });
      }
    }
    // Failed preparation is scoped to the instance and its current revision, as in the existing workflow reader.
    for (let offset = 0; offset < instances.length; offset += PAGE_SIZE) {
      const page = instances.slice(offset, offset + PAGE_SIZE);
      const failures = await db.job.findMany({ where: { workspaceId, task: "mix-workflow", completedAt: null, failedAt: { not: null },
        OR: page.map(instance => ({ payload: { path: ["instanceId"], equals: instance.id }, failedAt: { gt: instance.updatedAt } })) }, select: { payload: true } });
      for (const failure of failures) {
        const instance = page.find(item => item.id === (failure.payload as { instanceId?: string })?.instanceId);
        if (instance) other.push({ id: `${workspaceId}:work:${instance.id}:preparation-failed`, contactId: instance.contactId, contactName: instance.contact.displayName,
          kind: "repair", title: instance.label, detail: "Follow-up preparation needs another try.", action: "Review progress",
          href: `/journey?${new URLSearchParams({ contactId: instance.contactId, work: instance.id })}`, dueAt: null, updatedAt: instance.updatedAt.toISOString(), workId: instance.id });
      }
    }
    preparing ||= Boolean(await db.job.findFirst({ where: { workspaceId, task: "mix-workflow", completedAt: null, failedAt: null,
      ...(options.contactId ? { OR: [{ payload: { path: ["contactId"], equals: options.contactId } },
        ...instances.map(instance => ({ payload: { path: ["instanceId"], equals: instance.id } }))] } : {}) }, select: { id: true } }));
    const commitments = await allPages(after => db.contactRelationshipState.findMany({
      where: { workspaceId, nextCommitmentAt: { not: null }, contact: activeContact, ...(after ? { id: { gt: after } } : {}) },
      select: { id: true, contactId: true, nextCommitmentAt: true, updatedAt: true, contact: { select: { displayName: true } } }, orderBy: { id: "asc" }, take: PAGE_SIZE
    }));
    for (const commitment of commitments) other.push({ id: `${workspaceId}:commitment:${commitment.id}:${commitment.nextCommitmentAt!.toISOString()}`,
      contactId: commitment.contactId, contactName: commitment.contact.displayName, kind: "commitment", title: "Your next commitment", detail: "Check the commitment you saved.",
      action: "Review commitment", href: `/contacts/${encodeURIComponent(commitment.contactId)}#dates-and-mixes`, dueAt: commitment.nextCommitmentAt!.toISOString(), updatedAt: commitment.updatedAt.toISOString() });
    const appointments = await allPages(after => db.calendarEntry.findMany({
      where: { workspaceId, kind: "MEETING", canceledAt: null, outcome: null, contact: activeContact,
        OR: [{ endsAt: { gt: options.now } }, { bindings: { some: { heldAt: null, assignment: { isActive: true }, mix: { status: "ACTIVE" } } } }],
        ...(after ? { id: { gt: after } } : {}) },
      select: { id: true, contactId: true, title: true, startsAt: true, endsAt: true, updatedAt: true, contact: { select: { displayName: true } } }, orderBy: { id: "asc" }, take: PAGE_SIZE
    }));
    for (const appointment of appointments) {
      if (!appointment.contactId || !appointment.contact) continue;
      const needsOutcome = appointment.endsAt <= options.now;
      other.push({ id: `${workspaceId}:appointment:${appointment.id}`, contactId: appointment.contactId, contactName: appointment.contact.displayName,
        kind: needsOutcome ? "outcome" : "appointment", title: appointment.title, detail: needsOutcome ? "Record what happened at this appointment." : "Scheduled appointment",
        action: needsOutcome ? "Record outcome" : "View appointment", href: `/calendar?${new URLSearchParams({ edit: appointment.id, date: logicalDateKey(logicalDateInTimezone(appointment.startsAt, options.timeZone)) })}#schedule-event`,
        dueAt: needsOutcome ? null : appointment.startsAt.toISOString(), updatedAt: appointment.updatedAt.toISOString() });
    }
  }
  if (!options.contactId) other.push(...await readIntakeReviewWorkItems(db, workspaceId));
  const query = options.query?.toLocaleLowerCase();
  candidates.push(...other.map(item => ({ ...item, inView: options.includeOtherActions !== false && (!query || `${item.contactName} ${item.title} ${item.detail}`.toLocaleLowerCase().includes(query))
    && (!options.overdueOnly || item.dueAt !== null && new Date(item.dueAt) < options.now)
    && (!item.dueAt || ((!options.from || new Date(item.dueAt) >= options.from) && (!options.before || new Date(item.dueAt) < options.before))) })));
  return resolveNextActions(candidates, { ...options, state: preparation.state === "failed" ? "failed" : preparing ? "preparing" : "ready" });
}

export async function readNextActions(workspaceId: string, options: NextActionReadOptions): Promise<NextActionProjection> {
  try {
    return await prisma.$transaction(db => readNextActionSnapshot(db, workspaceId, options), { isolationLevel: "RepeatableRead" });
  } catch {
    return resolveNextActions([], { ...options, state: "unavailable" });
  }
}

/** The existing paged queues are a view of the projection, never a second count of the same obligation. */
export function nextActionAttention(projection: NextActionProjection, offset = 0, futureOffset = 0, upcomingProjection = projection): WorkflowAttention<string | null> | null {
  if (projection.state === "unavailable") return null;
  const current = projection.items.filter(item => item.kind !== "follow-up" && item.timing !== "future");
  // Today's upcoming queue keeps the complete snapshot's future context, outside its due filters.
  const future = upcomingProjection.items.filter(item => item.kind !== "follow-up" && item.timing === "future");
  offset = current.length ? Math.max(0, Math.min(offset, Math.floor((current.length - 1) / 30) * 30)) : 0;
  futureOffset = future.length ? Math.max(0, Math.min(futureOffset, Math.floor((future.length - 1) / 30) * 30)) : 0;
  const view = (item: typeof projection.items[number]) => ({ id: item.id, contactId: item.contactId, contactName: item.contactName,
    label: item.title, reason: item.detail, action: item.action, href: item.href, nextAction: item });
  return { items: current.slice(offset, offset + 30).map(view), total: current.length, offset,
    preparing: projection.state === "preparing", future: future.slice(futureOffset, futureOffset + 30).map(item => ({ ...view(item), dueAt: item.dueAt!, timezone: item.dueTimeZone ?? upcomingProjection.timeZone })), futureTotal: future.length, futureOffset };
}
