import type { Prisma } from "@/generated/prisma/client";
import { contactIdsInMix, contactMixStatus } from "@/lib/contact-mix-status";
import { readWorkflowDefinition } from "@/lib/mix-workflow";
import { prisma } from "@/lib/prisma";

/** `oneTimeFollowUp`: a one-time follow-up is still open for them, though no Mix is. */
export type MixEndQuestion = { contactId: string; contactName: string; mixId: string; mixName: string; oneTimeFollowUp: boolean };

/**
 * The run a follow-up belongs to: the scheduler's occurrence (a start day, a saved date, a fixed date or a visit), or
 * the Journey record's run. Planned Beats are keyed by the Beat and belong to every run of the Mix.
 */
function runKeyOf(snapshot: Prisma.JsonValue): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const { occurrenceKey, workflowRunKey } = snapshot as { occurrenceKey?: unknown; workflowRunKey?: unknown };
  const key = typeof occurrenceKey === "string" ? occurrenceKey : typeof workflowRunKey === "string" ? workflowRunKey : null;
  return key && !key.startsWith("planned:") ? key : null;
}

/**
 * Whether the follow-up the owner just finished closed out a Mix that has no connection after it, so Today asks
 * what's next for the person (JITM-09 §2.77). The Mix has ended for them when every one of its Beats has come due in
 * this run and none is still open, a date-based Mix has no next date waiting, and nothing else is still to come in it
 * for them: no visit ahead or awaiting its outcome, and no Journey work (END-01). Beats of an earlier run, such as a
 * previous visit's, don't count for this one. A connection from any Beat of the Mix, or from the whole Mix, decides
 * what follows, so nothing is asked. It asks only when the person is left with no Mix (D48): someone still in another
 * Mix isn't falling through, so the owner isn't interrupted. People marked Do not contact are not asked about.
 */
export async function mixEndQuestion(workspaceId: string, jumpId: string, now = new Date()): Promise<MixEndQuestion | null> {
  const jump = await prisma.jump.findFirst({
    where: { id: jumpId, workspaceId, status: { in: ["DONE", "SKIPPED"] } },
    select: { contactId: true, mixId: true, templateSnapshot: true, contact: { select: { displayName: true, archivedAt: true } }, mix: { select: { name: true, source: true, triggerMode: true, dateTypeId: true, steps: { where: { isActive: true }, select: { id: true } } } } }
  });
  if (!jump || jump.mix.source === "ONE_TIME" || jump.contact.archivedAt) return null;
  const { contactId, mixId, mix } = jump;
  // A follow-up whose run can't be told apart, such as a planned Beat, says nothing about whether a run is over.
  const runKey = runKeyOf(jump.templateSnapshot);
  if (!runKey) return null;
  const stepIds = mix.steps.map(step => step.id);
  const [open, reached, nextDate, inMix] = await Promise.all([
    prisma.jump.count({ where: { workspaceId, contactId, mixId, status: "PENDING" } }),
    // A Beat still waiting for a visit, for a visit's outcome or for a connection has no follow-up in this run yet,
    // so the Mix isn't over.
    prisma.jump.groupBy({ by: ["mixStepId"], where: { workspaceId, contactId, mixId, mixStepId: { in: stepIds }, OR: [
      { templateSnapshot: { path: ["occurrenceKey"], equals: runKey } },
      { templateSnapshot: { path: ["workflowRunKey"], equals: runKey } },
      { templateSnapshot: { path: ["occurrenceKey"], string_starts_with: "planned:" } }
    ] } }),
    mix.triggerMode === "DATE_TRIGGERED" && mix.dateTypeId
      ? prisma.jumpDate.count({ where: { workspaceId, contactId, dateTypeId: mix.dateTypeId, isActive: true, OR: [{ recurrence: { not: "NONE" } }, { dateValue: { gt: now } }] } })
      : 0,
    // Anything else still to come in this Mix, by any route: a visit ahead or awaiting its outcome, or Journey work.
    contactIdsInMix(prisma, workspaceId, mixId, [contactId], now)
  ]);
  if (open || nextDate || inMix.size || reached.length < stepIds.length) return null;
  const definition = await readWorkflowDefinition(prisma, workspaceId);
  if (definition.rules.some(rule => rule.enabled && rule.source.mixId === mixId)) return null;
  const [status, oneTime] = await Promise.all([
    contactMixStatus(workspaceId, contactId, now),
    prisma.jump.count({ where: { workspaceId, contactId, status: "PENDING", mix: { source: "ONE_TIME" } } })
  ]);
  if (status !== "no-mix") return null;
  return { contactId, contactName: jump.contact.displayName, mixId, mixName: mix.name, oneTimeFollowUp: oneTime > 0 };
}
