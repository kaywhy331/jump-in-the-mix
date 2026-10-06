import type { Prisma } from "@/generated/prisma/client";
import { startMixForContact, visitTimedBeats } from "@/lib/contact-mix-start";
import { timezoneForWorkspace } from "@/lib/display-preferences";
import { logicalDateFromDate, logicalDateInTimezone, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { assertRoomForPeople } from "@/lib/plan-limits";
import { UserFacingError } from "@/lib/user-facing-error";

type Tx = Prisma.TransactionClient;

/** Mixes new people can be put into: on, and started when the owner starts them for someone. */
export const placeableMixWhere = (workspaceId: string) => ({ workspaceId, status: "ACTIVE" as const, triggerMode: "MANUAL_START" as const, source: { not: "ONE_TIME" } });

export type NewContactPlacementSetting = { placement: "NONE" | "MIX" | "ASK"; mix: { id: string; name: string } | null };

/** The business's New contacts setting (JITM-09 §2.78). A chosen Mix that is no longer placeable counts as none. */
export async function newContactPlacementSetting(db: Pick<Tx, "workspacePreference" | "mix">, workspaceId: string): Promise<NewContactPlacementSetting> {
  const preference = await db.workspacePreference.findUnique({ where: { workspaceId }, select: { newContactPlacement: true, newContactMixId: true } });
  const placement = preference?.newContactPlacement ?? "NONE";
  const mix = placement === "MIX" && preference?.newContactMixId
    ? await db.mix.findFirst({ where: { id: preference.newContactMixId, ...placeableMixWhere(workspaceId) }, select: { id: true, name: true } })
    : null;
  return { placement, mix };
}

export type PlacementResult = { mix: { id: string; name: string } | null; started: string[]; skipped: string[] };

/**
 * Puts people who were just added where the owner said new people go (JITM-09 §2.78, D34).
 *
 * Every Mix whose audience is "Everyone" takes them in, the same way it took in everyone who existed when it was
 * saved. A Mix that starts when the owner chooses starts for the newcomer from the moment they were added. A
 * broadcast whose time has passed is left out, so nobody receives it late as an overdue follow-up. Do not contact
 * and the plan's people limit hold these follow-ups exactly as they hold any audience's.
 *
 * Then one Mix can start for them from today: the one the owner chose for these people (`mixId`), or, when the
 * caller passes no choice, the Mix in the New contacts setting. `null` starts none. It is not added on top of the
 * Mix their Contact stage just started. When the owner chose it just now (`chosenByOwner`), the plan's limit and
 * the start checks refuse with their reason; otherwise a person who can't start it is skipped, like any automatic
 * addition (§2.75).
 *
 * Call it inside the transaction that created the people, after their stage event. It queues their preparation.
 */
export async function placeNewContacts(tx: Tx, input: {
  workspaceId: string;
  contactIds: readonly string[];
  mixId?: string | null;
  chosenByOwner?: boolean;
  actorUserId?: string | null;
  timezone?: string;
  source?: string;
  now?: Date;
}): Promise<PlacementResult> {
  const { workspaceId } = input;
  const contactIds = [...new Set(input.contactIds)];
  const result: PlacementResult = { mix: null, started: [], skipped: [] };
  if (!contactIds.length) return result;
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

  const mix = input.mixId === undefined
    ? (await newContactPlacementSetting(tx, workspaceId)).mix
    : input.mixId ? await tx.mix.findFirst({ where: { id: input.mixId, ...placeableMixWhere(workspaceId) }, select: { id: true, name: true } }) : null;
  const beats = mix ? await tx.mixStep.findMany({ where: { mixId: mix.id, ...visitTimedBeats.where }, select: visitTimedBeats.select, take: visitTimedBeats.take }) : [];
  if (input.mixId && !mix && input.chosenByOwner) throw new UserFacingError("Choose a Mix that is on and starts when you start it for someone.");
  if (!mix) return result;
  result.mix = mix;
  if (input.chosenByOwner) await assertRoomForPeople(tx, workspaceId, contactIds);
  const timezone = input.timezone ?? await timezoneForWorkspace(workspaceId);
  const start = logicalDateInTimezone(now, timezone);
  for (const contactId of contactIds) {
    const [journey, running] = await Promise.all([
      tx.contactJourney.findUnique({ where: { contactId }, select: { stage: { select: { planId: true } } } }),
      tx.mixAssignment.findFirst({ where: { workspaceId, contactId, mixId: mix.id, isActive: true }, select: { id: true } })
    ]);
    const stageMix = journey?.stage.planId
      ? await tx.mixAssignment.findFirst({ where: { workspaceId, contactId, mixId: journey.stage.planId, isActive: true }, select: { id: true } })
      : null;
    // Their Contact stage started its own Mix, or they are already in this one.
    if (stageMix || running) { result.skipped.push(contactId); continue; }
    try {
      await startMixForContact(tx, { workspaceId, userId: input.actorUserId ?? null, contactId, mix: { ...mix, triggerMode: "MANUAL_START", dateTypeId: null, steps: beats }, start, timezone, source: input.source ?? "contacts.new" });
      result.started.push(contactId);
    } catch (error) {
      if (input.chosenByOwner || !(error instanceof UserFacingError)) throw error;
      result.skipped.push(contactId);
    }
  }
  return result;
}
