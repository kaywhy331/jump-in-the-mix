import { Prisma } from "@/generated/prisma/client";
import { billingReady } from "@/lib/billing-config";
import { prisma } from "@/lib/prisma";
import { planById, type Plan, type PlanId } from "@/lib/plans";
import { UserFacingError } from "@/lib/user-facing-error";

// Kevin's plan limits (JITM-01 §2.9, docs/PRICING_DECISION_2026-09-29.md) and his decisions of 2026-09-30
// (docs/PLAN_LIMITS_IMPLEMENTATION_2026-10-01.md): limits apply only while billing is on; reaching one stops new
// additions, never what the account already has; someone added automatically beyond the people limit is skipped
// and the owner is told on Today; the onboarding first follow-up Mix doesn't count toward active Mixes.

/** `MixStop.reason` for a person the plan's people limit skipped. The owner can resume it once there is room. */
export const PLAN_LIMIT_STOP = "plan.limit";

// A place taken by an explicit start is kept this long before the enrollment it was taken for has to exist,
// so a pass that runs between the check and the write never gives the place away.
const RESERVATION_GRACE_MS = 10 * 60_000;
// The active-Mix count leaves out hidden one-time Mixes and the first follow-up Mix.
const UNCOUNTED_MIX_SOURCES = ["ONE_TIME", "STARTER"];

export type PlanLimits = { on: boolean; plan: Plan };

export async function planLimits(workspaceId: string, db: Pick<Prisma.TransactionClient, "workspaceBilling"> = prisma): Promise<PlanLimits> {
  const on = billingReady();
  const row = on ? await db.workspaceBilling.findUnique({ where: { workspaceId }, select: { plan: true } }) : null;
  return { on, plan: planById((row?.plan ?? "FREE") as PlanId) };
}

async function lockPlanPeople(tx: Prisma.TransactionClient, workspaceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(814735, hashtext(${workspaceId}))`;
}

type Enrollment = { contactId: string; mixId: string | null; since: Date };

/**
 * Everyone a Mix is running for: an active assignment on an active Mix, made directly or through a visible tag, or
 * a workflow that is running or paused, for a contact who is neither archived nor marked do-not-contact, and not stopped in that Mix.
 */
async function enrollments(tx: Prisma.TransactionClient, workspaceId: string): Promise<Enrollment[]> {
  const [assignments, instances, stops, hiddenGroups, doNotContact] = await Promise.all([
    tx.mixAssignment.findMany({
      where: { workspaceId, isActive: true, mix: { status: "ACTIVE", source: { not: "ONE_TIME" } } },
      select: {
        mixId: true, createdAt: true, groupId: true,
        contact: { select: { id: true, archivedAt: true } },
        group: { select: { memberships: { select: { createdAt: true, contact: { select: { id: true, archivedAt: true } } } } } }
      }
    }),
    tx.mixWorkflowInstance.findMany({ where: { workspaceId, status: { in: ["ACTIVE", "PAUSED"] }, contact: { archivedAt: null } }, select: { contactId: true, createdAt: true } }),
    tx.mixStop.findMany({ where: { workspaceId }, select: { mixId: true, contactId: true } }),
    tx.contactGroupState.findMany({ where: { workspaceId, isActive: false }, select: { groupId: true } }),
    tx.contactRelationshipState.findMany({ where: { workspaceId, doNotContact: true }, select: { contactId: true } })
  ]);
  const stopped = new Set(stops.map(stop => `${stop.mixId}:${stop.contactId}`));
  const hidden = new Set(hiddenGroups.map(state => state.groupId));
  const excluded = new Set(doNotContact.map(state => state.contactId));
  const result: Enrollment[] = [];
  const add = (contactId: string, mixId: string | null, since: Date) => {
    if (excluded.has(contactId) || (mixId && stopped.has(`${mixId}:${contactId}`))) return;
    result.push({ contactId, mixId, since });
  };
  for (const assignment of assignments) {
    if (assignment.contact && !assignment.contact.archivedAt) add(assignment.contact.id, assignment.mixId, assignment.createdAt);
    if (assignment.groupId && hidden.has(assignment.groupId)) continue;
    for (const membership of assignment.group?.memberships ?? []) {
      if (membership.contact.archivedAt) continue;
      // A person joins a tag's Mix when the later of the two happened: the tag's Mix started or they joined the tag.
      add(membership.contact.id, assignment.mixId, membership.createdAt > assignment.createdAt ? membership.createdAt : assignment.createdAt);
    }
  }
  for (const instance of instances) add(instance.contactId, null, instance.createdAt);
  return result;
}

export type PeopleLimitResult = { counted: number; admitted: number; skipped: number };

/**
 * Brings the plan's count of people with follow-ups on up to date before follow-ups are generated. A person who no
 * longer has any Mix running leaves the count. Someone new joins it while there is room, earliest first; anyone left
 * over is skipped in each Mix that would have started for them. Runs under the workspace's own lock.
 */
export async function applyPeopleLimit(workspaceId: string, now = new Date()): Promise<PeopleLimitResult> {
  return prisma.$transaction(async (tx) => {
    await lockPlanPeople(tx, workspaceId);
    const [limits, current, seats] = await Promise.all([
      planLimits(workspaceId, tx),
      enrollments(tx, workspaceId),
      tx.planPerson.findMany({ where: { workspaceId }, select: { contactId: true, admittedAt: true } })
    ]);
    const enrolled = new Map<string, Enrollment[]>();
    for (const item of current) enrolled.set(item.contactId, [...(enrolled.get(item.contactId) ?? []), item]);

    const graceStart = new Date(now.getTime() - RESERVATION_GRACE_MS);
    const released = seats.filter(seat => !enrolled.has(seat.contactId) && seat.admittedAt < graceStart).map(seat => seat.contactId);
    if (released.length) await tx.planPerson.deleteMany({ where: { workspaceId, contactId: { in: released } } });
    const held = new Set(seats.map(seat => seat.contactId).filter(id => !released.includes(id)));

    const newcomers = [...enrolled.entries()]
      .filter(([contactId]) => !held.has(contactId))
      .map(([contactId, items]) => ({ contactId, items, since: Math.min(...items.map(item => item.since.getTime())) }))
      .sort((left, right) => left.since - right.since || left.contactId.localeCompare(right.contactId));
    const room = limits.on ? Math.max(0, limits.plan.people - held.size) : newcomers.length;
    const admitted = newcomers.slice(0, room);
    const skipped = newcomers.slice(room);

    if (admitted.length) await tx.planPerson.createMany({ data: admitted.map(item => ({ workspaceId, contactId: item.contactId })), skipDuplicates: true });
    const stops = skipped.flatMap(item => item.items.filter(entry => entry.mixId).map(entry => ({ workspaceId, mixId: entry.mixId!, contactId: item.contactId, reason: PLAN_LIMIT_STOP })));
    if (stops.length) {
      await tx.mixStop.createMany({ data: stops, skipDuplicates: true });
      await tx.auditLog.create({
        data: { workspaceId, actorType: "SYSTEM", action: "plan.limit.people_skipped", entityType: "Workspace", entityId: workspaceId, source: "worker",
          metadata: { plan: limits.plan.id, limit: limits.plan.people, skipped: skipped.length } }
      });
    }
    return { counted: held.size + admitted.length, admitted: admitted.length, skipped: skipped.length };
  }, { timeout: 30_000 });
}

/**
 * Takes a place for people the owner is starting a Mix for themselves, or explains why there is no room. A person who
 * already has follow-ups on always fits. Call it before writing the enrollment, and inside its transaction before any
 * contact row is locked, so the plan's lock always comes first.
 */
export async function reservePeople(workspaceId: string, contactIds: readonly string[], tx?: Prisma.TransactionClient): Promise<string | null> {
  const ids = [...new Set(contactIds)];
  if (!ids.length) return null;
  const run = async (db: Prisma.TransactionClient) => {
    await lockPlanPeople(db, workspaceId);
    const limits = await planLimits(workspaceId, db);
    const [seated, total] = await Promise.all([
      db.planPerson.findMany({ where: { workspaceId, contactId: { in: ids } }, select: { contactId: true } }),
      db.planPerson.count({ where: { workspaceId } })
    ]);
    const known = new Set(seated.map(seat => seat.contactId));
    // Only this account's own people take a place; the caller refuses anyone else.
    const own = await db.contact.findMany({ where: { workspaceId, id: { in: ids.filter(id => !known.has(id)) } }, select: { id: true } });
    const fresh = own.map(contact => contact.id);
    if (!fresh.length) return null;
    if (limits.on && total + fresh.length > limits.plan.people) return peopleLimitMessage(limits.plan);
    await db.planPerson.createMany({ data: fresh.map(contactId => ({ workspaceId, contactId })), skipDuplicates: true });
    return null;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/** `reservePeople` for a start inside a transaction: refuses with a message the owner sees. */
export async function assertRoomForPeople(tx: Prisma.TransactionClient, workspaceId: string, contactIds: readonly string[]): Promise<void> {
  const refusal = await reservePeople(workspaceId, contactIds, tx);
  if (refusal) throw new UserFacingError(refusal);
}

/** Read-only: whether `newPeople` more people fit the plan right now. For a form's check before it saves anything. */
export async function peopleLimitRefusal(workspaceId: string, newPeople: number): Promise<string | null> {
  const limits = await planLimits(workspaceId);
  if (!limits.on || newPeople <= 0) return null;
  const total = await prisma.planPerson.count({ where: { workspaceId } });
  return total + newPeople > limits.plan.people ? peopleLimitMessage(limits.plan) : null;
}

export function peopleLimitMessage(plan: Plan): string {
  return `Your ${plan.name} plan has room for ${plan.people.toLocaleString("en-US")} people with follow-ups on. Upgrade your plan to add more.`;
}

export function activeMixLimitMessage(plan: Plan): string {
  return `Your ${plan.name} plan allows ${plan.activeMixes.toLocaleString("en-US")} active Mixes. Pause one or upgrade your plan to turn on another.`;
}

/** How the plan counts a Mix: a Mega-Mix's Mixes count as one; hidden one-time Mixes and the first follow-up Mix don't count. */
function mixUnit(mix: { id: string; source: string; megaMixMembership: { pipelineId: string } | null }): string | null {
  if (UNCOUNTED_MIX_SOURCES.includes(mix.source)) return null;
  return mix.megaMixMembership ? `mega:${mix.megaMixMembership.pipelineId}` : `mix:${mix.id}`;
}

export async function activeMixUnits(workspaceId: string, db: Pick<Prisma.TransactionClient, "mix"> = prisma): Promise<Set<string>> {
  const mixes = await db.mix.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { id: true, source: true, megaMixMembership: { select: { pipelineId: true } } } });
  return new Set(mixes.map(mixUnit).filter((unit): unit is string => unit !== null));
}

/**
 * Whether the plan has room to turn these Mixes on, or a new Mix or Mega-Mix (`newUnits`). Mixes that are already
 * active, or whose Mega-Mix already counts, take no new place. Returns the refusal, or null when there is room.
 * Call it inside the transaction that turns the Mixes on, after the workspace row is locked, so two requests can't
 * both take the last place.
 */
export async function activeMixLimitRefusal(
  workspaceId: string,
  request: { mixIds?: readonly string[]; newUnits?: number },
  db: Pick<Prisma.TransactionClient, "mix" | "workspaceBilling"> = prisma
): Promise<string | null> {
  const limits = await planLimits(workspaceId, db);
  if (!limits.on) return null;
  const units = await activeMixUnits(workspaceId, db);
  const turning = request.mixIds?.length
    ? await db.mix.findMany({ where: { workspaceId, id: { in: [...request.mixIds] } }, select: { id: true, source: true, megaMixMembership: { select: { pipelineId: true } } } })
    : [];
  const added = new Set(turning.map(mixUnit).filter((unit): unit is string => unit !== null && !units.has(unit)));
  const after = units.size + added.size + (request.newUnits ?? 0);
  return after > limits.plan.activeMixes && after > units.size ? activeMixLimitMessage(limits.plan) : null;
}

/** People skipped by the plan's limit in the last week, for Today. */
export async function recentPlanLimitSkips(workspaceId: string, now = new Date()): Promise<number> {
  const rows = await prisma.mixStop.findMany({
    where: { workspaceId, reason: PLAN_LIMIT_STOP, stoppedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60_000) } },
    distinct: ["contactId"], select: { contactId: true }
  });
  return rows.length;
}
