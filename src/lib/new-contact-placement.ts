import type { Prisma } from "@/generated/prisma/client";
import { startMixForContact, visitTimedBeats } from "@/lib/contact-mix-start";
import { contactIdsInMix } from "@/lib/contact-mix-status";
import { timezoneForWorkspace } from "@/lib/display-preferences";
import { newContactStage } from "@/lib/journey";
import { setStagesFromMixStarts } from "@/lib/mix-stage";
import { logicalDateFromDate, logicalDateInTimezone, zonedDateTimeToUtc, type LogicalDate } from "@/lib/jump-schedule";
import { assertRoomForPeople } from "@/lib/plan-limits";
import { UserFacingError } from "@/lib/user-facing-error";

type Tx = Prisma.TransactionClient;

/**
 * Mixes the editor set to start "After another Mix". They are saved as Mixes the owner starts, with a `mix-start:`
 * connection from the other Mix, so they can't sensibly start "today" for a new person (D49).
 */
export async function afterAnotherMixIds(db: Pick<Tx, "mixWorkflow">, workspaceId: string): Promise<string[]> {
  const saved = await db.mixWorkflow.findUnique({ where: { workspaceId }, select: { configuration: true } });
  // Only the connection ids are needed, so a rule the full Journey check would question still counts.
  const rules = (saved?.configuration as { rules?: unknown } | null)?.rules;
  return Array.isArray(rules) ? rules.flatMap(rule => {
    const id = (rule as { id?: unknown } | null)?.id;
    return typeof id === "string" && id.startsWith("mix-start:") ? [id.slice("mix-start:".length)] : [];
  }) : [];
}

/**
 * Mixes new people can be put into: on, started when the owner starts them for someone, and not after another Mix
 * (D49). The exclusion sits under NOT, so a caller's own `id` in the same filter is never replaced.
 */
export const placeableMixWhere = (workspaceId: string, afterAnotherMix: readonly string[] = []) => ({
  workspaceId, status: "ACTIVE" as const, triggerMode: "MANUAL_START" as const, source: { not: "ONE_TIME" },
  ...(afterAnotherMix.length ? { NOT: { id: { in: [...afterAnotherMix] } } } : {})
});

/** `placeableMixWhere` for this account, with its after-another-Mix Mixes left out. */
export async function placeableMixFilter(db: Pick<Tx, "mixWorkflow">, workspaceId: string) {
  return placeableMixWhere(workspaceId, await afterAnotherMixIds(db, workspaceId));
}

export type NewContactPlacementSetting = { placement: "NONE" | "MIX" | "ASK"; mix: { id: string; name: string } | null };

/** The business's New contacts setting (JITM-09 §2.78). A chosen Mix that is no longer placeable counts as none. */
export async function newContactPlacementSetting(db: Pick<Tx, "workspacePreference" | "mix" | "mixWorkflow">, workspaceId: string): Promise<NewContactPlacementSetting> {
  const preference = await db.workspacePreference.findUnique({ where: { workspaceId }, select: { newContactPlacement: true, newContactMixId: true } });
  const placement = preference?.newContactPlacement ?? "NONE";
  const mix = placement === "MIX" && preference?.newContactMixId
    ? await db.mix.findFirst({ where: { id: preference.newContactMixId, ...await placeableMixFilter(db, workspaceId) }, select: { id: true, name: true } })
    : null;
  return { placement, mix };
}

/**
 * The Mixes for "Everyone" that take in a person added now: on, not one-time, and not a broadcast whose time has
 * passed, so nobody receives it late as an overdue follow-up.
 */
export async function everyoneMixesForNewPeople(db: Pick<Tx, "mix" | "mixBroadcastSchedule">, workspaceId: string, now = new Date()): Promise<Array<{ id: string; name: string; triggerMode: string }>> {
  const everyone = await db.mix.findMany({
    where: { workspaceId, status: "ACTIVE", audienceEveryone: true, source: { not: "ONE_TIME" } },
    select: { id: true, name: true, triggerMode: true },
    orderBy: [{ name: "asc" }, { id: "asc" }]
  });
  const broadcasts = new Map((await db.mixBroadcastSchedule.findMany({
    where: { workspaceId, mixId: { in: everyone.filter(item => item.triggerMode === "BROADCAST").map(item => item.id) } },
    select: { mixId: true, localDate: true, timeMinutes: true, timezone: true }
  })).map(schedule => [schedule.mixId, zonedDateTimeToUtc(logicalDateFromDate(schedule.localDate), schedule.timeMinutes, schedule.timezone)]));
  return everyone.filter(item => item.triggerMode !== "BROADCAST" || (broadcasts.get(item.id) ?? now) > now);
}

/** `skipped` people, by why their Mix didn't start: their Contact stage's own Mix starts instead, they are already in it, or a start check refused them. */
export type PlacementResult = { mix: { id: string; name: string } | null; started: string[]; skipped: string[]; skippedBecause: Record<string, "stage" | "already-in" | "refused"> };

/**
 * Shares the rows of the business's active Everyone Mixes. A save that unticks Everyone and a placement wait for each
 * other on the Mix's row, so neither leaves an Everyone place on a Mix that is no longer for Everyone (REL-03). Taken
 * before anything in the transaction sets a stage, so a stage being retired, which locks its Mixes before the stage,
 * can't wait on it the other way round (LCK-02, LCK-03). Returns their ids.
 */
export async function shareEveryoneMixes(tx: Tx, workspaceId: string): Promise<Set<string>> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Mix" WHERE "workspaceId" = ${workspaceId} AND status = 'ACTIVE' AND "audienceEveryone" AND source <> 'ONE_TIME' ORDER BY id FOR SHARE`;
  return new Set(locked.map(row => row.id));
}

/**
 * People in a Mix by another route than its Everyone audience: their own enrollment (a start the owner made, a visit,
 * Journey's own enrollment) or a shown tag the Mix runs for. An Everyone Mix that comes back on leaves them where they
 * are, as the placement does for newcomers (UX-04).
 */
export async function peopleInMixByOtherRoutes(tx: Tx, workspaceId: string, mixId: string): Promise<Set<string>> {
  const hidden = (await tx.contactGroupState.findMany({ where: { workspaceId, isActive: false }, select: { groupId: true } })).map(state => state.groupId);
  const assignments = await tx.mixAssignment.findMany({
    where: { workspaceId, mixId, isActive: true, OR: [{ contactId: { not: null }, NOT: { assignmentKey: { contains: ":audience:" } } }, { groupId: { not: null, notIn: hidden } }] },
    select: { contactId: true, group: { select: { memberships: { select: { contactId: true } } } } }
  });
  return new Set(assignments.flatMap(assignment => assignment.contactId ? [assignment.contactId] : (assignment.group?.memberships ?? []).map(member => member.contactId)));
}

/**
 * Puts people who were just added where the owner said new people go (JITM-09 §2.78, D34).
 *
 * One Mix can start for them from today, or from `start`: the one the owner chose for these people (`mixId`), or,
 * when the caller passes no choice, the Mix in the New contacts setting. `null` starts none.
 * - It is never a second run: someone already in that Mix by any route is left as they are (BLK-02 of the #125
 *   review).
 * - A Contact stage's own Mix comes first. The setting's Mix, or one set up in advance for a lead connection, is not
 *   added on top of it, whether the stage already started it or, for people added without the stage event (imports
 *   and phone contacts), the stage pass will. A Mix the owner picked just now (`explicit`) still starts.
 * - When the owner chose it just now (`chosenByOwner`), the plan's limit and the start checks refuse with their
 *   reason; otherwise a person who can't start it is skipped, like any automatic addition (§2.75).
 *
 * Then every Mix whose audience is "Everyone" takes them in, the same way it took in everyone who existed when it was
 * saved, except a Mix they are already in by their own start or a shown tag. A Mix that starts when the owner
 * chooses starts for the newcomer from the moment they were added. A broadcast whose time has passed is left out, so
 * nobody receives it late as an overdue follow-up. Do not contact and the plan's people limit hold these follow-ups
 * exactly as they hold any audience's. A Mix that names a Contact stage sets it for the people it starts.
 *
 * Call it inside the transaction that created the people, after their stage event when the path has one. It queues
 * their preparation unless the caller does (`queuePreparation: false`).
 */
export async function placeNewContacts(tx: Tx, input: {
  workspaceId: string;
  contactIds: readonly string[];
  mixId?: string | null;
  chosenByOwner?: boolean;
  explicit?: boolean;
  start?: LogicalDate;
  queuePreparation?: boolean;
  /** Everyone Mixes not to take them in, such as the one a Journey Start is about to start for them (EVR-02). */
  exceptEveryone?: readonly string[];
  actorUserId?: string | null;
  timezone?: string;
  source?: string;
  now?: Date;
}): Promise<PlacementResult> {
  const { workspaceId } = input;
  const contactIds = [...new Set(input.contactIds)];
  const result: PlacementResult = { mix: null, started: [], skipped: [], skippedBecause: {} };
  if (!contactIds.length) return result;
  const now = input.now ?? new Date();
  const queuePreparation = input.queuePreparation !== false;
  const hiddenTags = (await tx.contactGroupState.findMany({ where: { workspaceId, isActive: false }, select: { groupId: true } })).map(state => state.groupId);
  const skip = (contactId: string, because: PlacementResult["skippedBecause"][string]) => { result.skipped.push(contactId); result.skippedBecause[contactId] = because; };

  const lockedIds = await shareEveryoneMixes(tx, workspaceId);
  const mix = input.mixId === undefined
    ? (await newContactPlacementSetting(tx, workspaceId)).mix
    : input.mixId ? await tx.mix.findFirst({ where: { id: input.mixId, ...await placeableMixFilter(tx, workspaceId) }, select: { id: true, name: true } }) : null;
  if (input.mixId && !mix && input.chosenByOwner) throw new UserFacingError("Choose a Mix that is on and starts when you start it for someone.");
  if (mix) {
    result.mix = mix;
    if (input.chosenByOwner) await assertRoomForPeople(tx, workspaceId, contactIds);
    const timezone = input.timezone ?? await timezoneForWorkspace(workspaceId);
    const start = input.start ?? logicalDateInTimezone(now, timezone);
    const beats = await tx.mixStep.findMany({ where: { mixId: mix.id, ...visitTimedBeats.where }, select: visitTimedBeats.select, take: visitTimedBeats.take });
    // The stage someone without one yet will join, for paths that add people before their stage event.
    const stageAhead = input.explicit ? null : await newContactStage(tx, workspaceId);
    // Work to come in this Mix by a visit or Journey work. A newcomer's tag or audience has nothing prepared yet, so
    // those routes are checked from the enrollment itself below.
    const alreadyInMix = await contactIdsInMix(tx, workspaceId, mix.id, contactIds, now);
    for (const contactId of contactIds) {
      const [journey, running] = await Promise.all([
        tx.contactJourney.findUnique({ where: { contactId }, select: { stage: { select: { planId: true } } } }),
        // Already in this Mix by any route: their own start, the Mix's Everyone audience, or a shown tag it runs for.
        tx.mixAssignment.findFirst({ where: { workspaceId, mixId: mix.id, isActive: true, OR: [{ contactId }, { groupId: { notIn: hiddenTags }, group: { memberships: { some: { contactId } } } }] }, select: { id: true } })
      ]);
      if (running || alreadyInMix.has(contactId)) { skip(contactId, "already-in"); continue; }
      if (!input.explicit) {
        // The stage they joined on arrival may already be behind them: a Mix that names a stage, started by a tag, moves
        // them on and their arrival stage's Mix keeps running as their own. Either Mix counts (D54, STG-02).
        const stageMixIds = [...new Set([journey?.stage.planId, stageAhead?.mix?.id].filter((id): id is string => Boolean(id)))];
        const stageMix = journey
          ? stageMixIds.length ? await tx.mixAssignment.findFirst({ where: { workspaceId, contactId, mixId: { in: stageMixIds }, isActive: true }, select: { id: true } }) : null
          : stageAhead?.mix ?? null;
        if (stageMix) { skip(contactId, "stage"); continue; }
      }
      try {
        await startMixForContact(tx, { workspaceId, userId: input.actorUserId ?? null, contactId, mix: { ...mix, triggerMode: "MANUAL_START", dateTypeId: null, steps: beats }, start, timezone, source: input.source ?? "contacts.new", queuePreparation });
        result.started.push(contactId);
      } catch (error) {
        if (input.chosenByOwner || !(error instanceof UserFacingError)) throw error;
        skip(contactId, "refused");
      }
    }
  }

  const audiences = (await everyoneMixesForNewPeople(tx, workspaceId, now)).filter(item => lockedIds.has(item.id) && !input.exceptEveryone?.includes(item.id));
  if (!audiences.length) return result;
  // People already in one of these Mixes, by their own start (just above, or the one Add a contact made) or a shown
  // tag, are left as they are, so nobody runs the same Mix twice.
  const enrolled = new Set((await tx.mixAssignment.findMany({
    where: { workspaceId, isActive: true, mixId: { in: audiences.map(item => item.id) }, OR: [{ contactId: { in: contactIds } }, { groupId: { notIn: hiddenTags }, group: { memberships: { some: { contactId: { in: contactIds } } } } }] },
    select: { mixId: true, contactId: true, group: { select: { memberships: { where: { contactId: { in: contactIds } }, select: { contactId: true } } } } }
  })).flatMap(assignment => assignment.contactId ? [`${assignment.mixId}:${assignment.contactId}`] : (assignment.group?.memberships ?? []).map(member => `${assignment.mixId}:${member.contactId}`)));
  const placed = new Set<string>();
  const starts: Array<{ contactId: string; mixId: string }> = [];
  for (const audience of audiences) {
    for (const contactId of contactIds) {
      if (enrolled.has(`${audience.id}:${contactId}`)) continue;
      const assignmentKey = `${workspaceId}:${audience.id}:audience:${contactId}`;
      const startDate = audience.triggerMode === "MANUAL_START" ? now : null;
      await tx.mixAssignment.upsert({
        where: { assignmentKey },
        create: { assignmentKey, workspaceId, mixId: audience.id, contactId, mode: "DYNAMIC", startDate },
        update: { isActive: true, mode: "DYNAMIC", startDate }
      });
      placed.add(contactId);
      starts.push({ contactId, mixId: audience.id });
    }
  }
  // An Everyone Mix that names a Contact stage sets it, as any start does (JITM-09 §2.79). A Mix the owner picked while
  // adding them comes last, so its stage wins over an Everyone Mix's (ORD-01).
  if (input.explicit && mix) starts.push(...result.started.map(contactId => ({ contactId, mixId: mix.id })));
  await setStagesFromMixStarts(tx, { workspaceId, starts, actorUserId: input.actorUserId, now });
  if (placed.size && queuePreparation) {
    await tx.job.createMany({ data: [...placed].map(contactId => ({ workspaceId, task: "generate-jumps", payload: { contactId } })) });
  }
  return result;
}
