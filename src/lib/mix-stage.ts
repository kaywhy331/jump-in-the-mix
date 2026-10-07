import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/user-facing-error";
import { joinArrivalStage } from "@/lib/journey";
import { MAX_CONTACT_STAGES, newStageLabels } from "@/lib/mix-stage-labels";

type Tx = Prisma.TransactionClient;

/**
 * One person starting one Mix. When one call starts several Mixes for the same person, the last entry wins.
 * `assignmentId` is the person's own enrollment this start created or restarted, for a start the owner made for them;
 * only that one can come under a stage's management (STG-04).
 */
export type MixStart = { contactId: string; mixId: string; assignmentId?: string };

/** What a start did to one person's Contact stage, recorded so an Undo can put it back (UNDO-02). */
export type StageSet = {
  contactId: string;
  mixId: string;
  stageId: string;
  /** The stage history entry the start wrote. */
  eventKey: string;
  /** The person's stage record version after the change. An Undo acts only while it is unchanged. */
  version: number;
  /** The record as it was before, or null when the start created it. */
  previous: { stageId: string; stageSince: string; managedAssignmentId: string | null } | null;
};

/** The words a stage change set by a Mix leaves in the person's activity. */
export function mixStageSummary(previousStage: string | null, stage: string, mixName: string): string {
  return `${previousStage ? `${previousStage} → ${stage}` : `Joined ${stage}`}, set by the Mix “${mixName}”.`;
}

/**
 * A Mix can name the Contact stage its people are in (JITM-09 §2.79, D35). Starting the Mix sets that stage. Callers
 * pass every person who starts a Mix, by any route; Mixes that name no stage are ignored.
 *
 * - Setting the stage changes only the label. It never starts or stops another Mix, and the new stage's own Mix does
 *   not start. The previous stage's Mix keeps running as the person's own (detached from the stage), so a later stage
 *   move does not stop it either. When the Mix that sets the stage is that stage's own Mix, the stage manages it, as if
 *   the person had entered the stage, so the stage's "Mix completed" rule applies (STG-01).
 * - Someone still waiting for the worker's stage pass first joins the stage new people join, with its Mix, as the pass
 *   would have done (`joinArrivalStage`, STG-02). Every way of adding people then ends the same way.
 * - The latest start wins, among the starts that can set a stage. Nothing is set while automatic transitions are
 *   paused for the business, or for a person whose own stage changes are paused, or when the stage is retired.
 * - A person the Mix doesn't run for is left as they are: archived, Do not contact, or stopped in that Mix.
 * - Each change is a stage history entry (a manual move whose source names the Mix) and an activity line.
 *
 * It does the work in a few statements, so a Mix starting for a whole audience fits in the caller's transaction. It
 * takes the people's row locks in id order, the lock a recorded milestone takes (`applyJourneyEvent`), then shares the
 * stages' rows so a stage can't be retired underneath it. Returns what it changed.
 */
export async function setStagesFromMixStarts(tx: Tx, input: { workspaceId: string; starts: readonly MixStart[]; actorUserId?: string | null; now?: Date }): Promise<StageSet[]> {
  const { workspaceId } = input;
  if (!input.starts.length) return [];
  const preference = await tx.journeyPreference.findUnique({ where: { workspaceId }, select: { enabled: true, enabledAt: true } });
  if (!preference?.enabled) return [];
  const mixes = new Map((await tx.mix.findMany({
    where: { workspaceId, id: { in: [...new Set(input.starts.map(start => start.mixId))] }, stageId: { not: null } },
    select: { id: true, name: true, stageId: true }
  })).map(mix => [mix.id, mix]));
  if (!mixes.size) return [];
  const candidates = [...new Set(input.starts.filter(start => mixes.has(start.mixId)).map(start => start.contactId))];
  if (!candidates.length) return [];
  // A start the person is stopped in can't set the stage, so an earlier start that can still wins (ORD-01).
  const stopped = new Set((await tx.mixStop.findMany({ where: { workspaceId, contactId: { in: candidates }, mixId: { in: [...mixes.keys()] } }, select: { contactId: true, mixId: true } })).map(stop => `${stop.contactId}:${stop.mixId}`));
  const latestStart = new Map<string, MixStart>();
  for (const start of input.starts) if (mixes.has(start.mixId) && !stopped.has(`${start.contactId}:${start.mixId}`)) { latestStart.delete(start.contactId); latestStart.set(start.contactId, start); }
  const latest = new Map([...latestStart].map(([contactId, start]) => [contactId, start.mixId]));
  if (!latest.size) return [];
  const now = input.now ?? new Date();

  const people = [...latest.keys()].sort();
  const locked = new Set((await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Contact" WHERE "workspaceId" = ${workspaceId} AND "archivedAt" IS NULL AND id IN (${Prisma.join(people)}) ORDER BY id FOR NO KEY UPDATE`).map(row => row.id));
  const stageIds = [...new Set([...latest.values()].map(mixId => mixes.get(mixId)!.stageId!))].sort();
  const stages = new Map((await tx.$queryRaw<Array<{ id: string; name: string; planId: string | null }>>`
    SELECT id, name, "planId" FROM "JourneyStage" WHERE "workspaceId" = ${workspaceId} AND "isActive" AND id IN (${Prisma.join(stageIds)}) ORDER BY id FOR SHARE`).map(row => [row.id, row]));
  const restricted = await tx.contactRelationshipState.findMany({ where: { workspaceId, contactId: { in: people }, doNotContact: true }, select: { contactId: true } });
  const doNotContact = new Set(restricted.map(row => row.contactId));
  const eligible = people.filter(contactId => locked.has(contactId) && !doNotContact.has(contactId) && stages.has(mixes.get(latest.get(contactId)!)!.stageId!));
  if (!eligible.length) return [];
  await joinArrivalStage(tx, { workspaceId, contactIds: eligible, enabledAt: preference.enabledAt, now });
  const current = await tx.contactJourney.findMany({ where: { contactId: { in: eligible } }, select: { contactId: true, workspaceId: true, stageId: true, stageSince: true, managedAssignmentId: true, automatic: true, version: true, stage: { select: { name: true } } } });
  const records = new Map(current.map(record => [record.contactId, record]));

  const changes: Array<StageSet & { mixName: string; stageName: string; previousName: string | null; managedAssignmentId: string | null }> = [];
  // People already in the stage whose own Mix they just started, with nothing managed: the stage takes it on.
  const adopting: Array<{ contactId: string; assignmentId: string }> = [];
  // The stage's own Mix, started by a start the owner made for the person (STG-01), is the one the stage manages, as
  // when they enter the stage. A start through a tag, an audience or Journey work has no own enrollment to take over,
  // and an earlier run of theirs isn't taken over either (STG-04, as entering the stage wouldn't take it over).
  const ownRun = (contactId: string, stage: { planId: string | null }) => {
    const start = latestStart.get(contactId)!;
    return stage.planId === start.mixId ? start.assignmentId ?? null : null;
  };
  for (const contactId of eligible) {
    const mixId = latest.get(contactId)!;
    const mix = mixes.get(mixId)!;
    const stage = stages.get(mix.stageId!)!;
    const record = records.get(contactId);
    if (record && (record.workspaceId !== workspaceId || !record.automatic)) continue;
    if (record?.stageId === mix.stageId) {
      const assignmentId = ownRun(contactId, stage);
      if (assignmentId && !record.managedAssignmentId) adopting.push({ contactId, assignmentId });
      continue;
    }
    changes.push({
      contactId, mixId, stageId: mix.stageId!, eventKey: `mix-stage:${randomUUID()}`, version: (record?.version ?? 0) + 1,
      previous: record ? { stageId: record.stageId, stageSince: record.stageSince.toISOString(), managedAssignmentId: record.managedAssignmentId } : null,
      mixName: mix.name, stageName: stage.name, previousName: record?.stage.name ?? null, managedAssignmentId: ownRun(contactId, stage)
    });
  }
  for (const { contactId, assignmentId } of adopting) await tx.contactJourney.updateMany({ where: { workspaceId, contactId, managedAssignmentId: null }, data: { managedAssignmentId: assignmentId } });
  if (!changes.length) return [];

  const created = changes.filter(change => !change.previous);
  if (created.length) await tx.contactJourney.createMany({ data: created.map(change => ({ workspaceId, contactId: change.contactId, stageId: change.stageId, stageSince: now, lastCheckedAt: now, managedAssignmentId: change.managedAssignmentId })) });
  const moved = changes.filter(change => change.previous);
  for (const key of new Set(moved.map(change => `${change.stageId}:${change.managedAssignmentId ?? ""}`))) {
    const group = moved.filter(change => `${change.stageId}:${change.managedAssignmentId ?? ""}` === key);
    await tx.contactJourney.updateMany({
      where: { workspaceId, contactId: { in: group.map(change => change.contactId) } },
      data: { stageId: group[0].stageId, stageSince: now, lastCheckedAt: now, managedAssignmentId: group[0].managedAssignmentId, version: { increment: 1 } }
    });
  }
  await tx.journeyEvent.createMany({ data: changes.map(change => ({
    workspaceId, contactId: change.contactId, eventKey: change.eventKey, eventType: "MANUAL" as const, source: `Mix: ${change.mixName}`,
    resultingStageId: change.stageId, occurredAt: now
  })) });
  await tx.contactActivity.createMany({ data: changes.map(change => ({
    workspaceId, contactId: change.contactId, actorUserId: input.actorUserId ?? null, kind: "SYSTEM" as const, visibility: "WORKSPACE" as const,
    summary: mixStageSummary(change.previousName, change.stageName, change.mixName),
    metadata: { setByMixId: change.mixId, previousStageId: change.previous?.stageId ?? null, stageId: change.stageId, eventKey: change.eventKey }
  })) });
  return changes.map(({ contactId, mixId, stageId, eventKey, version, previous }) => ({ contactId, mixId, stageId, eventKey, version, previous }));
}

/**
 * People who start a Mix because a tag they were just given runs it (JITM-09 §2.79): active Mixes assigned to a shown
 * tag, for each person newly given that tag. Sets their stage the way any start does.
 */
export async function setStagesFromTagJoins(tx: Tx, input: { workspaceId: string; joins: ReadonlyArray<{ contactId: string; groupId: string }>; actorUserId?: string | null; now?: Date }): Promise<StageSet[]> {
  const { workspaceId } = input;
  if (!input.joins.length) return [];
  const groupIds = [...new Set(input.joins.map(join => join.groupId))];
  const [assignments, hidden] = await Promise.all([
    tx.mixAssignment.findMany({
      where: { workspaceId, isActive: true, groupId: { in: groupIds }, mix: { workspaceId, status: "ACTIVE", stageId: { not: null } } },
      select: { groupId: true, mixId: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    }),
    tx.contactGroupState.findMany({ where: { workspaceId, groupId: { in: groupIds }, isActive: false }, select: { groupId: true } })
  ]);
  const hiddenIds = new Set(hidden.map(state => state.groupId));
  const runs = assignments.filter(assignment => assignment.groupId && !hiddenIds.has(assignment.groupId));
  if (!runs.length) return [];
  const starts = input.joins.flatMap(join => runs.filter(run => run.groupId === join.groupId).map(run => ({ contactId: join.contactId, mixId: run.mixId })));
  return setStagesFromMixStarts(tx, { workspaceId, starts, actorUserId: input.actorUserId, now: input.now });
}

/**
 * The people a Mix's audience starts it for when it begins for them all at once: the people its own assignments name
 * and the members of its shown tags, among the given assignments; a hidden tag runs nothing, as in the scheduler.
 * Archived people are left out by the stage step itself.
 */
export async function audienceOf(tx: Tx, workspaceId: string, assignmentIds: readonly string[]): Promise<string[]> {
  if (!assignmentIds.length) return [];
  const hidden = (await tx.contactGroupState.findMany({ where: { workspaceId, isActive: false }, select: { groupId: true } })).map(state => state.groupId);
  const assignments = await tx.mixAssignment.findMany({
    where: { workspaceId, id: { in: [...assignmentIds] }, isActive: true, OR: [{ groupId: null }, { groupId: { notIn: hidden } }] },
    select: { contactId: true, group: { select: { memberships: { select: { contactId: true } } } } }
  });
  return [...new Set(assignments.flatMap(assignment => assignment.contactId ? [assignment.contactId] : (assignment.group?.memberships ?? []).map(member => member.contactId)))];
}

/**
 * Takes back the stage change one start made (UNDO-02), only while nothing has changed the person's stage since. The
 * previous stage comes back with its date and its own Mix, or a person who had no stage has none again. The history
 * entry the start wrote goes with it; the activity log keeps both lines.
 */
export async function undoStageSet(tx: Tx, input: { workspaceId: string; set: StageSet; actorUserId?: string | null }): Promise<boolean> {
  const { workspaceId, set } = input;
  const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Contact" WHERE id = ${set.contactId} AND "workspaceId" = ${workspaceId} FOR NO KEY UPDATE`;
  if (!locked.length) return false;
  const record = await tx.contactJourney.findUnique({ where: { contactId: set.contactId }, select: { workspaceId: true, stageId: true, version: true, stage: { select: { name: true } } } });
  if (!record || record.workspaceId !== workspaceId || record.version !== set.version || record.stageId !== set.stageId) return false;
  let summary: string;
  if (set.previous) {
    const [previous] = await tx.$queryRaw<Array<{ name: string }>>`SELECT name FROM "JourneyStage" WHERE id = ${set.previous.stageId} AND "workspaceId" = ${workspaceId} AND "isActive" FOR SHARE`;
    // A stage retired since can't take people back; the person keeps the stage the start gave them.
    if (!previous) return false;
    await tx.contactJourney.update({ where: { contactId: set.contactId }, data: { stageId: set.previous.stageId, stageSince: new Date(set.previous.stageSince), managedAssignmentId: set.previous.managedAssignmentId, version: { increment: 1 } } });
    summary = `${record.stage.name} → ${previous.name}: the stage is back as it was before the start was undone.`;
  } else {
    await tx.contactJourney.delete({ where: { contactId: set.contactId } });
    summary = `Left ${record.stage.name}: the stage is back as it was before the start was undone.`;
  }
  await tx.journeyEvent.deleteMany({ where: { workspaceId, contactId: set.contactId, eventKey: set.eventKey } });
  await tx.contactActivity.create({ data: { workspaceId, contactId: set.contactId, actorUserId: input.actorUserId ?? null, kind: "SYSTEM", visibility: "WORKSPACE", summary, metadata: { undoneEventKey: set.eventKey } } });
  return true;
}

/** Reads a recorded `StageSet` back from an audit record's JSON, or null when it isn't one. */
export function stageSetFrom(value: unknown): StageSet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const previous = item.previous && typeof item.previous === "object" && !Array.isArray(item.previous) ? item.previous as Record<string, unknown> : null;
  if (typeof item.contactId !== "string" || typeof item.mixId !== "string" || typeof item.stageId !== "string" || typeof item.eventKey !== "string" || typeof item.version !== "number") return null;
  if (item.previous !== null && (!previous || typeof previous.stageId !== "string" || typeof previous.stageSince !== "string" || !(previous.managedAssignmentId === null || typeof previous.managedAssignmentId === "string"))) return null;
  return {
    contactId: item.contactId, mixId: item.mixId, stageId: item.stageId, eventKey: item.eventKey, version: item.version,
    previous: previous ? { stageId: previous.stageId as string, stageSince: previous.stageSince as string, managedAssignmentId: previous.managedAssignmentId as string | null } : null
  };
}

/**
 * Adds a Mega-Mix's stage labels to Contact stages (JITM-09 §2.79, P8). A label the business already has, under any
 * case, is reused, and brought back if it was retired; nothing the owner has is renamed, reordered or removed. New
 * labels follow the existing stages in the Mega-Mix's order. When the business had no Contact stages, this turns them
 * on with these labels only: no starter stages or rules. A business that paused automatic transitions stays paused.
 * Refuses when the new labels would pass the stage limit. Call it under the workspace lock. Returns each label's stage
 * id, by the label as given.
 */
export async function addStageLabels(tx: Tx, workspaceId: string, labels: readonly string[]): Promise<Map<string, string>> {
  const existing = await tx.journeyStage.findMany({ where: { workspaceId }, select: { id: true, name: true, position: true, isActive: true }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  const missing = newStageLabels(existing.map(stage => stage.name), labels);
  if (existing.length + missing.length > MAX_CONTACT_STAGES) throw new StageLimitRefusal(MAX_CONTACT_STAGES - existing.length, missing.length);
  if (!await tx.journeyPreference.findUnique({ where: { workspaceId }, select: { workspaceId: true } })) await tx.journeyPreference.create({ data: { workspaceId } });
  let position = Math.max(-1, ...existing.map(stage => stage.position));
  const ids = new Map<string, string>();
  for (const label of labels) {
    const found = existing.find(stage => stage.name.toLowerCase() === label.toLowerCase());
    if (found) {
      if (!found.isActive) { await tx.journeyStage.update({ where: { id: found.id }, data: { isActive: true } }); found.isActive = true; }
      ids.set(label, found.id);
      continue;
    }
    const created = await tx.journeyStage.create({ data: { workspaceId, name: label, position: ++position }, select: { id: true, name: true, position: true, isActive: true } });
    existing.push(created);
    ids.set(label, created.id);
  }
  return ids;
}

/** The stage labels don't fit under the limit. */
export class StageLimitRefusal extends UserFacingError {
  constructor(readonly room: number, readonly needed: number) {
    super(`Contact stages has room for ${Math.max(0, room)} more ${room === 1 ? "label" : "labels"}, and this Mega-Mix adds ${needed}. Add it without its stage labels.`);
  }
}

export type ContactStageChoices = { stages: Array<{ id: string; name: string }>; paused: boolean };

/**
 * The stages a Mix can name in the editor: the business's active Contact stages in order, and whether automatic
 * transitions are paused, when nothing moves (COPY-01); or null when it has no stages.
 */
export async function contactStageChoices(workspaceId: string, db: Pick<Tx, "journeyPreference" | "journeyStage"> = prisma): Promise<ContactStageChoices | null> {
  const [preference, stages] = await Promise.all([
    db.journeyPreference.findUnique({ where: { workspaceId }, select: { enabled: true } }),
    db.journeyStage.findMany({ where: { workspaceId, isActive: true }, select: { id: true, name: true }, orderBy: [{ position: "asc" }, { id: "asc" }] })
  ]);
  return preference && stages.length ? { stages, paused: !preference.enabled } : null;
}

/**
 * How many people of an audience would move to a Mix's stage if it started for all of them now, and how many of those
 * are in another stage now, for the review before turning the Mix on (UX-01). It counts as the start decides: nobody
 * while automatic transitions are paused or the stage is retired, and never people who are archived, Do not contact,
 * stopped in this Mix, whose own stage changes are paused, or who are in the stage already. Hidden tags run nothing.
 */
export async function stageMovesForAudience(db: Pick<Tx, "journeyPreference" | "journeyStage" | "contactGroupState" | "mixStop" | "contact">, input: { workspaceId: string; stageId: string; all: boolean; groupIds: readonly string[]; mixId?: string | null }): Promise<{ moving: number; fromOtherStages: number }> {
  const { workspaceId, stageId } = input;
  const none = { moving: 0, fromOtherStages: 0 };
  const [preference, stage, hidden, stops] = await Promise.all([
    db.journeyPreference.findUnique({ where: { workspaceId }, select: { enabled: true } }),
    db.journeyStage.findFirst({ where: { id: stageId, workspaceId, isActive: true }, select: { id: true } }),
    db.contactGroupState.findMany({ where: { workspaceId, isActive: false }, select: { groupId: true } }),
    input.mixId ? db.mixStop.findMany({ where: { workspaceId, mixId: input.mixId }, select: { contactId: true } }) : Promise.resolve([])
  ]);
  const hiddenIds = new Set(hidden.map(state => state.groupId));
  const groupIds = input.groupIds.filter(id => !hiddenIds.has(id));
  if (!preference?.enabled || !stage || (!input.all && !groupIds.length)) return none;
  const where: Prisma.ContactWhereInput = { AND: [
    { workspaceId, archivedAt: null },
    input.all ? {} : { groupMemberships: { some: { groupId: { in: groupIds }, group: { workspaceId } } } },
    { NOT: { relationshipState: { is: { doNotContact: true } } } },
    stops.length ? { id: { notIn: stops.map(stop => stop.contactId) } } : {},
    { OR: [{ journey: { is: null } }, { journey: { is: { automatic: true, stageId: { not: stageId } } } }] }
  ] };
  const [moving, fromOtherStages] = await Promise.all([
    db.contact.count({ where }),
    db.contact.count({ where: { AND: [where, { journey: { isNot: null } }] } })
  ]);
  return { moving, fromOtherStages };
}
