import type { JumpStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { renderJumpSnapshot } from "@/lib/jump-render";
import {
  addLogicalDays,
  addUtcDays,
  createJumpUniquenessKey,
  getJumpDateOccurrences,
  logicalDateFromDate,
  logicalDateKey,
  scheduledLocalDateTimeKey,
  zonedDateTimeToUtc,
  type LogicalDate
} from "@/lib/jump-schedule";

const PENDING_STATUSES: JumpStatus[] = ["PENDING", "COPIED"];
const MUTABLE_STATUSES: JumpStatus[] = ["PENDING", "COPIED", "CANCELED"];
const BATCH_SIZE = 500;

type ReconciliationFilters = {
  workspaceId?: string;
  contactId?: string;
  mixId?: string;
};

export type JumpReconciliationResult = {
  desired: number;
  created: number;
  updated: number;
  canceled: number;
};

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

function triggerForManualAssignment(date: Date): { logicalDate: LogicalDate; occurrenceKey: string } {
  const logicalDate = logicalDateFromDate(date);
  return { logicalDate, occurrenceKey: `manual:${logicalDateKey(logicalDate)}` };
}

function stopKey(mixId: string, contactId: string): string {
  return `${mixId}:${contactId}`;
}

export async function reconcileJumps(filters: ReconciliationFilters = {}): Promise<JumpReconciliationResult> {
  const now = new Date();
  const horizonStart = startOfUtcDay(addUtcDays(now, -45));
  const horizonEnd = endOfUtcDay(addUtcDays(now, 60));
  const occurrenceStart = addUtcDays(horizonStart, -60);
  const occurrenceEnd = addUtcDays(horizonEnd, 60);

  const [assignments, stops] = await Promise.all([
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
        contact: {
          include: {
            emails: true,
            phones: true,
            addresses: true,
            jumpDates: { include: { dateType: true }, where: { isActive: true } }
          }
        },
        group: {
          include: {
            memberships: {
              include: {
                contact: {
                  include: {
                    emails: true,
                    phones: true,
                    addresses: true,
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
    prisma.mixStop.findMany({
      where: {
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters.contactId ? { contactId: filters.contactId } : {}),
        ...(filters.mixId ? { mixId: filters.mixId } : {})
      },
      select: { mixId: true, contactId: true }
    })
  ]);

  const stopped = new Set(stops.map((item) => stopKey(item.mixId, item.contactId)));
  const desired = new Map<string, DesiredJump>();

  for (const assignment of assignments) {
    const contacts = new Map<string, NonNullable<typeof assignment.contact>>();
    if (assignment.contact && !assignment.contact.archivedAt) contacts.set(assignment.contact.id, assignment.contact);
    for (const membership of assignment.group?.memberships ?? []) {
      if (!membership.contact.archivedAt) contacts.set(membership.contact.id, membership.contact);
    }

    for (const contact of contacts.values()) {
      if (filters.contactId && contact.id !== filters.contactId) continue;
      if (stopped.has(stopKey(assignment.mixId, contact.id))) continue;

      const triggers: {
        logicalDate: LogicalDate;
        jumpDateId: string | null;
        occurrenceKey: string;
        reason: string;
        timezone: string;
        timeMinutes: number | null;
      }[] = [];

      if (assignment.mix.triggerMode === "DATE_TRIGGERED") {
        for (const jumpDate of contact.jumpDates.filter((item) => item.dateTypeId === assignment.mix.dateTypeId)) {
          for (const occurrence of getJumpDateOccurrences(jumpDate, occurrenceStart, occurrenceEnd)) {
            triggers.push({
              logicalDate: occurrence,
              jumpDateId: jumpDate.id,
              occurrenceKey: `jump-date:${jumpDate.id}:${logicalDateKey(occurrence)}`,
              reason: jumpDate.label || jumpDate.dateType.name,
              timezone: jumpDate.timezone || assignment.workspace.profile?.timezone || "UTC",
              timeMinutes: jumpDate.timeMinutes
            });
          }
        }
      } else {
        const manual = triggerForManualAssignment(assignment.startDate ?? assignment.createdAt);
        triggers.push({
          ...manual,
          jumpDateId: null,
          reason: assignment.mix.name,
          timezone: assignment.workspace.profile?.timezone || "UTC",
          timeMinutes: null
        });
      }

      for (const trigger of triggers) {
        for (const mixStep of assignment.mix.steps) {
          const scheduledLogicalDate = addLogicalDays(trigger.logicalDate, mixStep.dayOffset);
          const sendTimeMinutes = mixStep.sendTimeMinutes ?? trigger.timeMinutes ?? 600;
          const scheduledAt = zonedDateTimeToUtc(scheduledLogicalDate, sendTimeMinutes, trigger.timezone);
          if (scheduledAt < horizonStart || scheduledAt > horizonEnd) continue;

          const localDateTime = scheduledLocalDateTimeKey(scheduledLogicalDate, sendTimeMinutes);
          const uniquenessKey = createJumpUniquenessKey({
            workspaceId: assignment.workspaceId,
            contactId: contact.id,
            mixId: assignment.mixId,
            mixStepId: mixStep.id,
            occurrenceKey: trigger.occurrenceKey,
            scheduledLocalDateTime: localDateTime,
            timezone: trigger.timezone
          });
          const channel = mixStep.stepVersion.stepTemplate.channel;
          const renderedSnapshot = renderJumpSnapshot(
            {
              subject: mixStep.stepVersion.subject,
              body: mixStep.stepVersion.body,
              script: mixStep.stepVersion.script
            },
            contact,
            assignment.workspace.profile,
            assignment.workspace.owner,
            channel
          );

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
            templateSnapshot: {
              subject: mixStep.stepVersion.subject,
              body: mixStep.stepVersion.body,
              script: mixStep.stepVersion.script,
              channel,
              localDateTime,
              timezone: trigger.timezone
            },
            renderedSnapshot
          });
        }
      }
    }
  }

  const desiredKeys = [...desired.keys()];
  const existingDesired: { id: string; uniquenessKey: string; status: JumpStatus }[] = [];
  for (const batch of chunks(desiredKeys)) {
    existingDesired.push(...await prisma.jump.findMany({ where: { uniquenessKey: { in: batch } }, select: { id: true, uniquenessKey: true, status: true } }));
  }
  const existingByKey = new Map(existingDesired.map((item) => [item.uniquenessKey, item]));

  let created = 0;
  let updated = 0;
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  for (const desiredJump of desired.values()) {
    const existing = existingByKey.get(desiredJump.uniquenessKey);
    const sharedData = {
      workspaceId: desiredJump.workspaceId,
      contactId: desiredJump.contactId,
      jumpDateId: desiredJump.jumpDateId,
      mixId: desiredJump.mixId,
      mixStepId: desiredJump.mixStepId,
      stepVersionId: desiredJump.stepVersionId,
      scheduledAt: desiredJump.scheduledAt,
      reason: desiredJump.reason,
      templateSnapshot: desiredJump.templateSnapshot,
      renderedSnapshot: desiredJump.renderedSnapshot
    };
    if (!existing) {
      created += 1;
      writes.push(prisma.jump.upsert({
        where: { uniquenessKey: desiredJump.uniquenessKey },
        create: { ...sharedData, uniquenessKey: desiredJump.uniquenessKey, status: "PENDING" },
        update: sharedData
      }));
    } else if (MUTABLE_STATUSES.includes(existing.status)) {
      updated += 1;
      writes.push(prisma.jump.update({
        where: { id: existing.id },
        data: { ...sharedData, status: existing.status === "CANCELED" ? "PENDING" : existing.status, completedAt: null, completionMethod: null }
      }));
    }
  }
  for (const batch of chunks(writes, 100)) await prisma.$transaction(batch);

  const staleCandidates = await prisma.jump.findMany({
    where: {
      ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
      ...(filters.contactId ? { contactId: filters.contactId } : {}),
      ...(filters.mixId ? { mixId: filters.mixId } : {}),
      mix: { source: { not: "ONE_TIME" } },
      status: { in: PENDING_STATUSES },
      scheduledAt: { gte: horizonStart, lte: horizonEnd }
    },
    select: { id: true, uniquenessKey: true }
  });
  const staleIds = staleCandidates.filter((item) => !desired.has(item.uniquenessKey)).map((item) => item.id);
  for (const batch of chunks(staleIds)) {
    await prisma.jump.updateMany({
      where: { id: { in: batch }, status: { in: PENDING_STATUSES } },
      data: { status: "CANCELED", completedAt: null, completionMethod: "reconciled" }
    });
  }

  return { desired: desired.size, created, updated, canceled: staleIds.length };
}

export async function generateJumps(filters: ReconciliationFilters = {}): Promise<number> {
  return (await reconcileJumps(filters)).created;
}
