import type { JumpStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { renderJumpSnapshot } from "@/lib/jump-render";
import {
  addLogicalDays,
  addUtcDays,
  createJumpUniquenessKey,
  getJumpDateOccurrences,
  logicalDateFromDate,
  logicalDateInTimezone,
  logicalDateKey,
  scheduledLocalDateTimeKey,
  zonedDateTimeToUtc,
  type LogicalDate
} from "@/lib/jump-schedule";
import {
  DEFAULT_WORKSPACE_SCHEDULING,
  outsideQuietHours,
  shiftWeekend,
  workspaceSchedulingRules,
  type WorkspaceSchedulingRule
} from "@/lib/workspace-scheduling";

const RECONCILIATION_UPDATE_STATUSES: JumpStatus[] = ["PENDING", "CANCELED"];
const STALE_CANCELLATION_STATUSES: JumpStatus[] = ["PENDING", "COPIED"];
const RECONCILABLE_CANCELLATION_METHODS = new Set(["reconciled", "mix_paused", "plan_downgrade", "contact_archived", "do_not_contact"]);
const BATCH_SIZE = 500;
const DEFAULT_PAST_DAYS = 45;
const DEFAULT_FUTURE_DAYS = 365;

type ReconciliationFilters = { workspaceId?: string; contactId?: string; mixId?: string };

export type JumpReconciliationResult = { desired: number; created: number; updated: number; canceled: number };

type DesiredJump = {
  uniquenessKey: string;
  workspaceId: string;
  contactId: string;
  jumpDateId: string | null;
  mixId: string;
  mixStepId: string;
  stepVersionId: string;
  scheduledAt: Date;
  reason: string;
  templateSnapshot: Prisma.InputJsonValue;
  renderedSnapshot: Prisma.InputJsonValue;
};

type ExistingJump = {
  id: string;
  uniquenessKey: string;
  status: JumpStatus;
  completionMethod: string | null;
  workspaceId: string;
  contactId: string;
  jumpDateId: string | null;
  mixId: string;
  mixStepId: string;
  stepVersionId: string;
  scheduledAt: Date;
  reason: string;
  templateSnapshot: Prisma.JsonValue;
  renderedSnapshot: Prisma.JsonValue;
};

function chunks<T>(items: T[], size = BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function endOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999));
}

function stopKey(mixId: string, contactId: string): string {
  return `${mixId}:${contactId}`;
}

function jsonEqual(left: Prisma.JsonValue | Prisma.InputJsonValue, right: Prisma.JsonValue | Prisma.InputJsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameDesired(existing: ExistingJump, desired: DesiredJump): boolean {
  return existing.workspaceId === desired.workspaceId
    && existing.contactId === desired.contactId
    && existing.jumpDateId === desired.jumpDateId
    && existing.mixId === desired.mixId
    && existing.mixStepId === desired.mixStepId
    && existing.stepVersionId === desired.stepVersionId
    && existing.scheduledAt.getTime() === desired.scheduledAt.getTime()
    && existing.reason === desired.reason
    && jsonEqual(existing.templateSnapshot, desired.templateSnapshot)
    && jsonEqual(existing.renderedSnapshot, desired.renderedSnapshot);
}

function canReconcile(existing: ExistingJump): boolean {
  if (existing.status === "PENDING") return true;
  return existing.status === "CANCELED" && Boolean(existing.completionMethod && RECONCILABLE_CANCELLATION_METHODS.has(existing.completionMethod));
}

function baseJumpWhere(filters: ReconciliationFilters): Prisma.JumpWhereInput {
  return {
    ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(filters.mixId ? { mixId: filters.mixId } : {}),
    mix: { source: { not: "ONE_TIME" } }
  };
}

function schedulingRule(
  stored: WorkspaceSchedulingRule | undefined,
  profile: { quietHoursStart?: number | null; quietHoursEnd?: number | null } | null
): WorkspaceSchedulingRule {
  if (stored) return stored;
  return {
    ...DEFAULT_WORKSPACE_SCHEDULING,
    quietHoursStart: profile?.quietHoursStart ?? DEFAULT_WORKSPACE_SCHEDULING.quietHoursStart,
    quietHoursEnd: profile?.quietHoursEnd ?? DEFAULT_WORKSPACE_SCHEDULING.quietHoursEnd
  };
}

export async function reconcileJumps(filters: ReconciliationFilters = {}): Promise<JumpReconciliationResult> {
  const now = new Date();
  const [assignments, stops, pendingBounds] = await Promise.all([
    prisma.mixAssignment.findMany({
      where: {
        isActive: true,
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters.mixId ? { mixId: filters.mixId } : {}),
        ...(filters.contactId ? { OR: [{ contactId: filters.contactId }, { group: { memberships: { some: { contactId: filters.contactId } } } }] } : {}),
        mix: { status: "ACTIVE" }
      },
      include: {
        workspace: { include: { profile: true, owner: true } },
        contact: { include: { emails: true, phones: true, addresses: true, customFieldValues: { include: { definition: true } }, jumpDates: { include: { dateType: true }, where: { isActive: true } } } },
        group: {
          include: {
            memberships: {
              include: {
                contact: {
                  include: {
                    emails: true,
                    phones: true,
                    addresses: true,
                    customFieldValues: { include: { definition: true } },
                    jumpDates: { include: { dateType: true }, where: { isActive: true } }
                  }
                }
              }
            }
          }
        },
        mix: {
          include: {
            steps: {
              where: { isActive: true },
              include: { stepVersion: { include: { stepTemplate: true } } },
              orderBy: { sortOrder: "asc" }
            },
            dateType: true
          }
        }
      }
    }),
    prisma.mixStop.findMany({ where: { ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}), ...(filters.contactId ? { contactId: filters.contactId } : {}), ...(filters.mixId ? { mixId: filters.mixId } : {}) }, select: { mixId: true, contactId: true } }),
    prisma.jump.aggregate({ where: { ...baseJumpWhere(filters), status: { in: STALE_CANCELLATION_STATUSES } }, _min: { scheduledAt: true }, _max: { scheduledAt: true } })
  ]);

  const offsets = assignments.flatMap((assignment) => assignment.mix.steps.map((step) => step.dayOffset));
  const minimumOffset = offsets.length ? Math.min(...offsets) : 0;
  const maximumOffset = offsets.length ? Math.max(...offsets) : 0;
  const defaultStart = startOfUtcDay(addUtcDays(now, -DEFAULT_PAST_DAYS));
  const defaultEnd = endOfUtcDay(addUtcDays(now, DEFAULT_FUTURE_DAYS));
  const horizonStart = pendingBounds._min.scheduledAt && pendingBounds._min.scheduledAt < defaultStart ? startOfUtcDay(pendingBounds._min.scheduledAt) : defaultStart;
  const horizonEnd = pendingBounds._max.scheduledAt && pendingBounds._max.scheduledAt > defaultEnd ? endOfUtcDay(pendingBounds._max.scheduledAt) : defaultEnd;
  const occurrenceStart = addUtcDays(horizonStart, -Math.max(maximumOffset, 0) - 7);
  const occurrenceEnd = addUtcDays(horizonEnd, -Math.min(minimumOffset, 0) + 7);

  const workspaceIds = [...new Set(assignments.map((assignment) => assignment.workspaceId))];
  const [inactiveStates, broadcastSchedules, schedulingByWorkspace, doNotContactStates] = await Promise.all([
    workspaceIds.length ? prisma.contactGroupState.findMany({ where: { workspaceId: { in: workspaceIds }, isActive: false }, select: { groupId: true } }) : [],
    assignments.length ? prisma.mixBroadcastSchedule.findMany({ where: { mixId: { in: [...new Set(assignments.map((assignment) => assignment.mixId))] }, ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}) } }) : [],
    workspaceSchedulingRules(workspaceIds),
    workspaceIds.length ? prisma.contactRelationshipState.findMany({ where: { workspaceId: { in: workspaceIds }, doNotContact: true }, select: { contactId: true } }) : []
  ]);
  const inactiveGroupIds = new Set(inactiveStates.map((state) => state.groupId));
  const doNotContactIds = new Set(doNotContactStates.map((state) => state.contactId));
  const broadcastByMixId = new Map(broadcastSchedules.map((schedule) => [schedule.mixId, schedule]));
  const stopped = new Set(stops.map((item) => stopKey(item.mixId, item.contactId)));
  const desired = new Map<string, DesiredJump>();

  for (const assignment of assignments) {
    if (assignment.groupId && inactiveGroupIds.has(assignment.groupId)) continue;
    const rule = schedulingRule(schedulingByWorkspace.get(assignment.workspaceId), assignment.workspace.profile);
    const contacts = new Map<string, NonNullable<typeof assignment.contact>>();
    if (assignment.contact && !assignment.contact.archivedAt) contacts.set(assignment.contact.id, assignment.contact);
    for (const membership of assignment.group?.memberships ?? []) if (!membership.contact.archivedAt) contacts.set(membership.contact.id, membership.contact);

    for (const contact of contacts.values()) {
      if (filters.contactId && contact.id !== filters.contactId) continue;
      if (doNotContactIds.has(contact.id)) continue;
      if (stopped.has(stopKey(assignment.mixId, contact.id))) continue;
      const triggers: Array<{ logicalDate: LogicalDate; jumpDateId: string | null; occurrenceKey: string; reason: string; timezone: string; timeMinutes: number | null }> = [];

      if (assignment.mix.triggerMode === "DATE_TRIGGERED") {
        for (const jumpDate of contact.jumpDates.filter((item) => item.dateTypeId === assignment.mix.dateTypeId)) {
          for (const occurrence of getJumpDateOccurrences(jumpDate, occurrenceStart, occurrenceEnd)) {
            triggers.push({ logicalDate: occurrence, jumpDateId: jumpDate.id, occurrenceKey: `jump-date:${jumpDate.id}:${logicalDateKey(occurrence)}`, reason: jumpDate.label || jumpDate.dateType.name, timezone: jumpDate.timezone || assignment.workspace.profile?.timezone || "UTC", timeMinutes: jumpDate.timeMinutes });
          }
        }
      } else if (assignment.mix.triggerMode === "BROADCAST") {
        const schedule = broadcastByMixId.get(assignment.mixId);
        if (schedule) {
          const logicalDate = logicalDateFromDate(schedule.localDate);
          triggers.push({ logicalDate, jumpDateId: null, occurrenceKey: `broadcast:${schedule.id}:${logicalDateKey(logicalDate)}`, reason: assignment.mix.name, timezone: schedule.timezone, timeMinutes: schedule.timeMinutes });
        }
      } else {
        const timezone = assignment.workspace.profile?.timezone || "UTC";
        const startDate = assignment.startDate ?? assignment.createdAt;
        const logicalDate = logicalDateInTimezone(startDate, timezone);
        triggers.push({ logicalDate, jumpDateId: null, occurrenceKey: `manual:${logicalDateKey(logicalDate)}`, reason: assignment.mix.name, timezone, timeMinutes: null });
      }

      for (const trigger of triggers) {
        for (const mixStep of assignment.mix.steps) {
          const unshiftedDate = addLogicalDays(trigger.logicalDate, mixStep.dayOffset);
          const scheduledLogicalDate = shiftWeekend(unshiftedDate, rule.weekendScheduling);
          const requestedMinutes = mixStep.sendTimeMinutes ?? trigger.timeMinutes ?? rule.defaultFollowUpMinutes;
          const sendTimeMinutes = outsideQuietHours(requestedMinutes, rule.quietHoursStart, rule.quietHoursEnd);
          const scheduledAt = zonedDateTimeToUtc(scheduledLogicalDate, sendTimeMinutes, trigger.timezone);
          if (scheduledAt < horizonStart || scheduledAt > horizonEnd) continue;
          const localDateTime = scheduledLocalDateTimeKey(scheduledLogicalDate, sendTimeMinutes);
          const uniquenessKey = createJumpUniquenessKey({ workspaceId: assignment.workspaceId, contactId: contact.id, mixId: assignment.mixId, mixStepId: mixStep.id, occurrenceKey: trigger.occurrenceKey, scheduledLocalDateTime: localDateTime, timezone: trigger.timezone });
          const channel = mixStep.stepVersion.stepTemplate.channel;
          const renderedSnapshot = renderJumpSnapshot({ subject: mixStep.stepVersion.subject, body: mixStep.stepVersion.body, script: mixStep.stepVersion.script }, contact, assignment.workspace.profile, assignment.workspace.owner, channel);
          desired.set(uniquenessKey, {
            uniquenessKey,
            workspaceId: assignment.workspaceId,
            contactId: contact.id,
            jumpDateId: trigger.jumpDateId,
            mixId: assignment.mixId,
            mixStepId: mixStep.id,
            stepVersionId: mixStep.stepVersionId,
            scheduledAt,
            reason: trigger.reason,
            templateSnapshot: { subject: mixStep.stepVersion.subject, body: mixStep.stepVersion.body, script: mixStep.stepVersion.script, channel, localDateTime, timezone: trigger.timezone, originalLocalDate: logicalDateKey(unshiftedDate), weekendRule: rule.weekendScheduling },
            renderedSnapshot
          });
        }
      }
    }
  }

  const desiredKeys = [...desired.keys()];
  const existingDesired: ExistingJump[] = [];
  for (const batch of chunks(desiredKeys)) {
    existingDesired.push(...await prisma.jump.findMany({
      where: { uniquenessKey: { in: batch } },
      select: { id: true, uniquenessKey: true, status: true, completionMethod: true, workspaceId: true, contactId: true, jumpDateId: true, mixId: true, mixStepId: true, stepVersionId: true, scheduledAt: true, reason: true, templateSnapshot: true, renderedSnapshot: true }
    }));
  }
  const existingByKey = new Map(existingDesired.map((item) => [item.uniquenessKey, item]));
  let created = 0;
  let updated = 0;
  const creates: Prisma.JumpCreateManyInput[] = [];
  const updates: Array<{ existing: ExistingJump; desired: DesiredJump }> = [];
  for (const desiredJump of desired.values()) {
    const existing = existingByKey.get(desiredJump.uniquenessKey);
    if (!existing) { creates.push({ ...desiredJump, status: "PENDING" }); continue; }
    if (!canReconcile(existing)) continue;
    const targetStatus: JumpStatus = existing.status === "CANCELED" ? "PENDING" : existing.status;
    if (targetStatus === existing.status && sameDesired(existing, desiredJump)) continue;
    updates.push({ existing, desired: desiredJump });
  }

  for (const batch of chunks(creates)) created += (await prisma.jump.createMany({ data: batch, skipDuplicates: true })).count;
  for (const batch of chunks(updates, 100)) {
    const results = await prisma.$transaction(batch.map(({ existing, desired: desiredJump }) => prisma.jump.updateMany({
      where: { id: existing.id, status: { in: RECONCILIATION_UPDATE_STATUSES } },
      data: { workspaceId: desiredJump.workspaceId, contactId: desiredJump.contactId, jumpDateId: desiredJump.jumpDateId, mixId: desiredJump.mixId, mixStepId: desiredJump.mixStepId, stepVersionId: desiredJump.stepVersionId, scheduledAt: desiredJump.scheduledAt, reason: desiredJump.reason, templateSnapshot: desiredJump.templateSnapshot, renderedSnapshot: desiredJump.renderedSnapshot, status: existing.status === "CANCELED" ? "PENDING" : existing.status, completedAt: null, completionMethod: null }
    })));
    updated += results.reduce((sum, result) => sum + result.count, 0);
  }

  const staleCandidates = await prisma.jump.findMany({ where: { ...baseJumpWhere(filters), status: { in: STALE_CANCELLATION_STATUSES }, scheduledAt: { gte: horizonStart, lte: horizonEnd } }, select: { id: true, uniquenessKey: true } });
  const staleIds = staleCandidates.filter((item) => !desired.has(item.uniquenessKey)).map((item) => item.id);
  let canceled = 0;
  for (const batch of chunks(staleIds)) canceled += (await prisma.jump.updateMany({ where: { id: { in: batch }, status: { in: STALE_CANCELLATION_STATUSES } }, data: { status: "CANCELED", completedAt: null, completionMethod: "reconciled" } })).count;
  return { desired: desired.size, created, updated, canceled };
}

export async function generateJumps(filters: ReconciliationFilters = {}): Promise<number> {
  return (await reconcileJumps(filters)).created;
}
