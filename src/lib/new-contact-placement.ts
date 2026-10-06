import type { Prisma } from "@/generated/prisma/client";
import { logicalDateFromDate, zonedDateTimeToUtc } from "@/lib/jump-schedule";

type Tx = Prisma.TransactionClient;

/**
 * Puts people who were just added into every Mix whose audience is "Everyone" (JITM-09 §2.78, D34), the same way
 * the Mix took in everyone who existed when it was saved. A Mix that starts when the owner chooses starts for the
 * newcomer from the moment they were added. A broadcast whose time has passed is left out, so nobody receives it
 * late as an overdue follow-up. Do not contact and the plan's people limit hold these follow-ups exactly as they
 * hold any audience's.
 *
 * Call it inside the transaction that created the people, after their stage event. It queues their preparation.
 */
export async function placeNewContacts(tx: Tx, input: { workspaceId: string; contactIds: readonly string[]; now?: Date }): Promise<void> {
  const { workspaceId } = input;
  const contactIds = [...new Set(input.contactIds)];
  if (!contactIds.length) return;
  const now = input.now ?? new Date();
  const everyone = await tx.mix.findMany({
    where: { workspaceId, status: "ACTIVE", audienceEveryone: true, source: { not: "ONE_TIME" } },
    select: { id: true, triggerMode: true }
  });
  const broadcasts = new Map((await tx.mixBroadcastSchedule.findMany({
    where: { workspaceId, mixId: { in: everyone.filter(mix => mix.triggerMode === "BROADCAST").map(mix => mix.id) } },
    select: { mixId: true, localDate: true, timeMinutes: true, timezone: true }
  })).map(schedule => [schedule.mixId, zonedDateTimeToUtc(logicalDateFromDate(schedule.localDate), schedule.timeMinutes, schedule.timezone)]));
  const audiences = everyone.filter(mix => mix.triggerMode !== "BROADCAST" || (broadcasts.get(mix.id) ?? now) > now);
  for (const mix of audiences) {
    for (const contactId of contactIds) {
      const assignmentKey = `${workspaceId}:${mix.id}:audience:${contactId}`;
      const startDate = mix.triggerMode === "MANUAL_START" ? now : null;
      await tx.mixAssignment.upsert({
        where: { assignmentKey },
        create: { assignmentKey, workspaceId, mixId: mix.id, contactId, mode: "DYNAMIC", startDate },
        update: { isActive: true, mode: "DYNAMIC", startDate }
      });
    }
  }
  if (audiences.length) {
    await tx.job.createMany({ data: contactIds.map(contactId => ({ workspaceId, task: "generate-jumps", payload: { contactId } })) });
  }
}
