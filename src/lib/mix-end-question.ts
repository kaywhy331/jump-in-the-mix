import { contactMixStatus } from "@/lib/contact-mix-status";
import { readWorkflowDefinition } from "@/lib/mix-workflow";
import { prisma } from "@/lib/prisma";

export type MixEndQuestion = { contactId: string; contactName: string; mixName: string; stillInMix: boolean };

/**
 * Whether the follow-up the owner just finished closed out a Mix that has no connection after it, so Today asks
 * what's next for the person (JITM-09 §2.77). The Mix has ended for them when every one of its Beats has come due
 * and none is still open, and a date-based Mix has no next date waiting. A connection from any Beat of the Mix, or
 * from the whole Mix, decides what follows, so nothing is asked. People marked Do not contact are not asked about.
 */
export async function mixEndQuestion(workspaceId: string, jumpId: string, now = new Date()): Promise<MixEndQuestion | null> {
  const jump = await prisma.jump.findFirst({
    where: { id: jumpId, workspaceId, status: { in: ["DONE", "SKIPPED"] } },
    select: { contactId: true, mixId: true, contact: { select: { displayName: true, archivedAt: true } }, mix: { select: { name: true, source: true, triggerMode: true, dateTypeId: true, steps: { where: { isActive: true }, select: { id: true } } } } }
  });
  if (!jump || jump.mix.source === "ONE_TIME" || jump.contact.archivedAt) return null;
  const { contactId, mixId, mix } = jump;
  const stepIds = mix.steps.map(step => step.id);
  const [open, reached, nextDate] = await Promise.all([
    prisma.jump.count({ where: { workspaceId, contactId, mixId, status: "PENDING" } }),
    // A Beat still waiting for a visit or a connection has no follow-up yet, so the Mix isn't over.
    prisma.jump.groupBy({ by: ["mixStepId"], where: { workspaceId, contactId, mixId, mixStepId: { in: stepIds } } }),
    mix.triggerMode === "DATE_TRIGGERED" && mix.dateTypeId
      ? prisma.jumpDate.count({ where: { workspaceId, contactId, dateTypeId: mix.dateTypeId, isActive: true, OR: [{ recurrence: { not: "NONE" } }, { dateValue: { gt: now } }] } })
      : 0
  ]);
  if (open || nextDate || reached.length < stepIds.length) return null;
  const definition = await readWorkflowDefinition(prisma, workspaceId);
  if (definition.rules.some(rule => rule.enabled && rule.source.mixId === mixId)) return null;
  const status = await contactMixStatus(workspaceId, contactId, now);
  if (!status || status === "do-not-contact") return null;
  return { contactId, contactName: jump.contact.displayName, mixName: mix.name, stillInMix: status === "in-mix" };
}
