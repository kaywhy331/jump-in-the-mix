import { isDeepStrictEqual } from "node:util";
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
  DEFAULT_PERSONAL_SCHEDULING,
  outsideQuietHours,
  personalSchedulingRules,
  shiftWeekend,
  type PersonalSchedulingRule
} from "@/lib/personal-scheduling";
import { minutesInTimezone, plannedStepApplies } from "@/lib/planned-step";
import { isValidTimezone } from "@/lib/mix-broadcast";
import type { AppointmentContext } from "@/lib/appointment-context";

const STALE_CANCELLATION_STATUSES: JumpStatus[] = ["PENDING"];
// Holds scoped to one appointment binding. Each is cleared only by the event that set it: the
// owner lifting the hold, the appointment being restored, its evaluation succeeding again, or the
// visit's outcome being recorded, changed or cleared.
export const APPOINTMENT_HOLD_METHODS = { held: "appointment_held", canceled: "appointment_canceled", unresolved: "appointment_unresolved", noShow: "appointment_no_show", completed: "appointment_completed", outcomePending: "appointment_outcome_pending" } as const;
// A stop the journey records when a person leaves the stage that ran a plan. It ends the journey's
// own enrollment only; a plan bound to one of the person's appointments keeps running.
const JOURNEY_STAGE_EXIT_STOP = "journey.stage.exit";
const RECONCILABLE_CANCELLATION_METHODS = new Set([
  "reconciled",
  "mix_paused",
  "contact_archived",
  "do_not_contact",
  ...Object.values(APPOINTMENT_HOLD_METHODS)
]);
// Owner-initiated holds. Their rows come back when the hold is lifted, so they keep the window open
// for an old base occurrence the way a pending row does.
const HELD_CANCELLATION_METHODS = ["mix_paused", "contact_archived", "do_not_contact", ...Object.values(APPOINTMENT_HOLD_METHODS)];
// Appointment-anchored rows keep one identity across moves: the time is not part of their key.
const ANCHORED_KEY_PART = "anchored";
const BATCH_SIZE = 500;
const DEFAULT_PAST_DAYS = 45;
const DEFAULT_FUTURE_DAYS = 365;

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
  /** Follow-ups held for an appointment binding this pass: an owner hold, a canceled or missed appointment, a beat a completed visit made moot, a beat waiting for the visit's outcome, or a binding that could not be evaluated. Includes rows whose hold reason changed. */
  held: number;
  /** Bindings that could not be evaluated; their rows are held, never treated as stale. */
  failedBindings: number;
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
  baseScheduledAt: Date;
  reason: string;
  templateSnapshot: Prisma.InputJsonValue;
  renderedSnapshot: Prisma.InputJsonValue;
  appointmentBindingId: string | null;
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
  baseScheduledAt: Date | null;
  snoozedUntil: Date | null;
  updatedAt: Date;
  reason: string;
  templateSnapshot: Prisma.JsonValue;
  renderedSnapshot: Prisma.JsonValue;
  appointmentBindingId: string | null;
};

export function originalLocalDateOf(snapshot: Prisma.JsonValue | Prisma.InputJsonValue): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = (snapshot as { originalLocalDate?: unknown }).originalLocalDate;
  return typeof value === "string" ? value : null;
}

function occurrenceCarryKey(contactId: string, mixStepId: string, jumpDateId: string | null, originalLocalDate: string): string {
  return `${contactId}:${mixStepId}:${jumpDateId ?? ""}:${originalLocalDate}`;
}

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

// PostgreSQL returns jsonb keys in its own order, so a string comparison never matched a freshly
// built snapshot and every pass rewrote every pending follow-up. Compare structurally instead.
function jsonEqual(left: Prisma.JsonValue | Prisma.InputJsonValue, right: Prisma.JsonValue | Prisma.InputJsonValue): boolean {
  return isDeepStrictEqual(left, right);
}

function sameDesired(existing: ExistingJump, desired: DesiredJump): boolean {
  return existing.workspaceId === desired.workspaceId
    && existing.contactId === desired.contactId
    && existing.jumpDateId === desired.jumpDateId
    && existing.mixId === desired.mixId
    && existing.mixStepId === desired.mixStepId
    && existing.stepVersionId === desired.stepVersionId
    && existing.scheduledAt.getTime() === desired.scheduledAt.getTime()
    && existing.baseScheduledAt?.getTime() === desired.baseScheduledAt.getTime()
    && existing.appointmentBindingId === desired.appointmentBindingId
    && existing.reason === desired.reason
    && jsonEqual(existing.templateSnapshot, desired.templateSnapshot)
    && jsonEqual(existing.renderedSnapshot, desired.renderedSnapshot);
}

function canReconcile(existing: ExistingJump): boolean {
  if (existing.status === "PENDING") return true;
  return existing.status === "CANCELED"
    && Boolean(existing.completionMethod && RECONCILABLE_CANCELLATION_METHODS.has(existing.completionMethod));
}

function baseJumpWhere(filters: ReconciliationFilters): Prisma.JumpWhereInput {
  return {
    ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(filters.mixId ? { mixId: filters.mixId } : {}),
    mix: { source: { not: "ONE_TIME" } }
  };
}

function schedulingRule(stored: PersonalSchedulingRule | undefined): PersonalSchedulingRule {
  return stored ?? DEFAULT_PERSONAL_SCHEDULING;
}

export async function reconcileJumps(filters: ReconciliationFilters = {}): Promise<JumpReconciliationResult> {
  const now = new Date();
  const [assignments, stops, pendingBounds, snoozedPending, mergedDrafted] = await Promise.all([
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
            customFieldValues: { include: { definition: true } },
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
        },
        appointmentBinding: { include: { calendarEntry: true } }
      }
    }),
    prisma.mixStop.findMany({
      where: {
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters.contactId ? { contactId: filters.contactId } : {}),
        ...(filters.mixId ? { mixId: filters.mixId } : {})
      },
      select: { mixId: true, contactId: true, reason: true }
    }),
    prisma.jump.aggregate({
      where: { AND: [baseJumpWhere(filters), { OR: [{ status: "PENDING" }, { status: "CANCELED", completionMethod: { in: HELD_CANCELLATION_METHODS } }] }] },
      _min: { baseScheduledAt: true, scheduledAt: true },
      _max: { scheduledAt: true }
    }),
    // Pending rows carrying owner state, a snooze or a draft, so a follow-up regenerated for the
    // same occurrence keeps it. Draft text is never read here; only the row's identity is.
    prisma.jump.findMany({
      where: { ...baseJumpWhere(filters), status: "PENDING", OR: [{ snoozedUntil: { not: null } }, { drafts: { some: {} } }] },
      select: { id: true, uniquenessKey: true, contactId: true, mixStepId: true, jumpDateId: true, snoozedUntil: true, templateSnapshot: true }
    }),
    // Drafted follow-ups of a merged contact wait on their cancelled row until the survivor's row
    // for the same beat and occurrence is generated, then move onto it.
    prisma.jump.findMany({
      where: { ...baseJumpWhere(filters), status: "CANCELED", completionMethod: "contact_merged", drafts: { some: {} } },
      select: { id: true, uniquenessKey: true, workspaceId: true, contactId: true, mixStepId: true, jumpDateId: true, snoozedUntil: true, templateSnapshot: true }
    })
  ]);
  const mergedSurvivors = new Map<string, string>();
  if (mergedDrafted.length) {
    const records = await prisma.contactMergeRecord.findMany({
      where: { workspaceId: { in: [...new Set(mergedDrafted.map((item) => item.workspaceId))] }, mergedContactId: { in: [...new Set(mergedDrafted.map((item) => item.contactId))] } },
      select: { mergedContactId: true, survivorContactId: true },
      orderBy: { createdAt: "asc" }
    });
    for (const record of records) mergedSurvivors.set(record.mergedContactId, record.survivorContactId);
  }
  // A time edit changes a legacy row's key while its occurrence stays the same. The snooze and the
  // drafts are carried onto the regenerated row so a settings save does not drop them. Keys are
  // untouched, and a moved occurrence carries nothing.
  const ownedByOccurrence = new Map<string, { id: string; uniquenessKey: string; snoozedUntil: Date | null }>();
  for (const item of snoozedPending) {
    const originalLocalDate = originalLocalDateOf(item.templateSnapshot);
    if (originalLocalDate) {
      ownedByOccurrence.set(occurrenceCarryKey(item.contactId, item.mixStepId, item.jumpDateId, originalLocalDate), { id: item.id, uniquenessKey: item.uniquenessKey, snoozedUntil: item.snoozedUntil });
    }
  }
  for (const item of mergedDrafted) {
    const survivor = mergedSurvivors.get(item.contactId);
    const originalLocalDate = originalLocalDateOf(item.templateSnapshot);
    if (!survivor || !originalLocalDate) continue;
    const key = occurrenceCarryKey(survivor, item.mixStepId, item.jumpDateId, originalLocalDate);
    // A pending row of the survivor's own takes precedence over a merged row's state.
    if (!ownedByOccurrence.has(key)) ownedByOccurrence.set(key, { id: item.id, uniquenessKey: item.uniquenessKey, snoozedUntil: item.snoozedUntil });
  }

  const offsets = assignments.flatMap((assignment) => assignment.mix.steps.map((step) => step.dayOffset));
  const minimumOffset = offsets.length ? Math.min(...offsets) : 0;
  const maximumOffset = offsets.length ? Math.max(...offsets) : 0;
  const defaultStart = startOfUtcDay(addUtcDays(now, -DEFAULT_PAST_DAYS));
  const defaultEnd = endOfUtcDay(addUtcDays(now, DEFAULT_FUTURE_DAYS));
  // A snooze moves a follow-up's time inside the window while its base occurrence can lie before it,
  // so the window reaches back to the earliest base as well as the earliest scheduled time. Identities
  // are untouched; only the scan window widens.
  const earliestPending = [pendingBounds._min.baseScheduledAt, pendingBounds._min.scheduledAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
  const horizonStart = earliestPending && earliestPending < defaultStart ? startOfUtcDay(earliestPending) : defaultStart;
  const horizonEnd = pendingBounds._max.scheduledAt && pendingBounds._max.scheduledAt > defaultEnd
    ? endOfUtcDay(pendingBounds._max.scheduledAt)
    : defaultEnd;
  const occurrenceStart = addUtcDays(horizonStart, -Math.max(maximumOffset, 0) - 7);
  const occurrenceEnd = addUtcDays(horizonEnd, -Math.min(minimumOffset, 0) + 7);

  const workspaceIds = [...new Set(assignments.map((assignment) => assignment.workspaceId))];
  const ownerIds = [...new Set(assignments.map((assignment) => assignment.workspace.ownerId))];
  const [inactiveGroupStates, broadcastSchedules, schedulingByDataSpace, doNotContactStates, ownerPreferences] = await Promise.all([
    workspaceIds.length
      ? prisma.contactGroupState.findMany({
          where: { workspaceId: { in: workspaceIds }, isActive: false },
          select: { groupId: true }
        })
      : [],
    assignments.length
      ? prisma.mixBroadcastSchedule.findMany({
        where: {
          mixId: { in: [...new Set(assignments.map((assignment) => assignment.mixId))] },
          ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {})
        }
      })
      : [],
    personalSchedulingRules(workspaceIds),
    workspaceIds.length
      ? prisma.contactRelationshipState.findMany({ where: { workspaceId: { in: workspaceIds }, doNotContact: true }, select: { contactId: true } })
      : [],
    ownerIds.length ? prisma.userPreference.findMany({ where: { userId: { in: ownerIds } }, select: { userId: true, timezone: true } }) : []
  ]);
  const inactiveGroupIds = new Set(inactiveGroupStates.map((state) => state.groupId));
  const doNotContactIds = new Set(doNotContactStates.map((state) => state.contactId));
  const broadcastByMixId = new Map(broadcastSchedules.map((schedule) => [schedule.mixId, schedule]));
  const timezoneByOwnerId = new Map(ownerPreferences.map((preference) => [preference.userId, preference.timezone]));
  const stopped = new Set(stops.map((item) => stopKey(item.mixId, item.contactId)));
  const stoppedByJourneyOnly = new Set(stops.filter((item) => item.reason === JOURNEY_STAGE_EXIT_STOP).map((item) => stopKey(item.mixId, item.contactId)));
  const desired = new Map<string, DesiredJump>();
  // Appointment bindings this pass evaluated. A hold keeps the binding's pending rows out of the
  // desired set and cancels them with its own reason, so they return when the reason lifts and are
  // never mistaken for stale work.
  const bindingHolds = new Map<string, { method: string; error: string | null; mixStepIds?: string[] }>();
  const evaluatedBindingIds: string[] = [];

  for (const assignment of assignments) {
    if (assignment.groupId && inactiveGroupIds.has(assignment.groupId)) continue;
    const personalRule = schedulingRule(schedulingByDataSpace.get(assignment.workspaceId));
    const workspaceTimezone = timezoneByOwnerId.get(assignment.workspace.ownerId) ?? "UTC";
    const binding = assignment.appointmentBinding;
    // A binding evaluates once per pass, before its contact is considered, so a hold applies even
    // when the contact is filtered out of this pass.
    let appointment: AppointmentContext | null = null;
    if (binding) {
      if (filters.contactId && binding.contactId !== filters.contactId) continue;
      const entry = binding.calendarEntry;
      const problem = !entry ? "The appointment no longer exists."
        : binding.contactId !== entry.contactId ? "The appointment belongs to a different person now."
        : !isValidTimezone(entry.timezone) ? "The appointment's timezone is not valid."
        : null;
      if (problem) { bindingHolds.set(binding.id, { method: APPOINTMENT_HOLD_METHODS.unresolved, error: problem }); continue; }
      if (binding.heldAt) { bindingHolds.set(binding.id, { method: APPOINTMENT_HOLD_METHODS.held, error: null }); evaluatedBindingIds.push(binding.id); continue; }
      if (entry.canceledAt) { bindingHolds.set(binding.id, { method: APPOINTMENT_HOLD_METHODS.canceled, error: null }); evaluatedBindingIds.push(binding.id); continue; }
      // Beats are day-based around the visit. One scheduled before the visit starts is preparation,
      // a same-day morning reminder included; one at or after the start follows the visit. A missed
      // visit holds everything bound to it. A completed visit lets preparation lapse, since a
      // reminder for a visit that already happened is moot, and releases what follows. With no
      // outcome recorded, what follows the visit waits, so wording that presumes the visit happened
      // is never prepared or sent on the calendar alone. None of this moves a beat's time.
      if (entry.outcome === "NO_SHOW") { bindingHolds.set(binding.id, { method: APPOINTMENT_HOLD_METHODS.noShow, error: null }); evaluatedBindingIds.push(binding.id); continue; }
      const appointmentMinutes = minutesInTimezone(entry.startsAt, entry.timezone);
      const preparation = (step: { plannedAt: Date | null; dayOffset: number; sendTimeMinutes: number | null }) => step.plannedAt
        ? step.plannedAt < entry.startsAt
        : step.dayOffset < 0 || (step.dayOffset === 0 && (step.sendTimeMinutes ?? appointmentMinutes) < appointmentMinutes);
      if (entry.outcome === "COMPLETED") {
        const lapsed = assignment.mix.steps.filter(preparation).map((step) => step.id);
        if (lapsed.length) bindingHolds.set(binding.id, { method: APPOINTMENT_HOLD_METHODS.completed, error: null, mixStepIds: lapsed });
      } else {
        const waiting = assignment.mix.steps.filter((step) => !preparation(step)).map((step) => step.id);
        if (waiting.length) bindingHolds.set(binding.id, { method: APPOINTMENT_HOLD_METHODS.outcomePending, error: null, mixStepIds: waiting });
      }
      evaluatedBindingIds.push(binding.id);
      appointment = { title: entry.title, startsAt: entry.startsAt, timezone: entry.timezone, location: entry.location, link: entry.link, details: entry.details };
    }

    const contacts = new Map<string, NonNullable<typeof assignment.contact>>();
    if (assignment.contact && !assignment.contact.archivedAt) contacts.set(assignment.contact.id, assignment.contact);
    for (const membership of assignment.group?.memberships ?? []) {
      if (!membership.contact.archivedAt) contacts.set(membership.contact.id, membership.contact);
    }

    for (const contact of contacts.values()) {
      if (filters.contactId && contact.id !== filters.contactId) continue;
      if (doNotContactIds.has(contact.id)) continue;
      // A journey stage exit stops the plan the journey ran on its own, not a visit's binding.
      if (stopped.has(stopKey(assignment.mixId, contact.id)) && !(binding && stoppedByJourneyOnly.has(stopKey(assignment.mixId, contact.id)))) continue;

      const triggers: {
        logicalDate: LogicalDate;
        jumpDateId: string | null;
        occurrenceKey: string;
        reason: string;
        timezone: string;
        timeMinutes: number | null;
      }[] = [];

      if (binding && appointment) {
        // Anchored to the visit: day offsets count from the appointment's local date, and a beat
        // with no time of its own goes out at the appointment's time. The occurrence is the
        // binding itself, so a moved appointment updates these rows in place.
        triggers.push({
          logicalDate: logicalDateInTimezone(appointment.startsAt, appointment.timezone),
          jumpDateId: null,
          occurrenceKey: `appointment:${binding.id}`,
          reason: appointment.title,
          timezone: appointment.timezone,
          timeMinutes: minutesInTimezone(appointment.startsAt, appointment.timezone)
        });
      } else if (assignment.mix.triggerMode === "DATE_TRIGGERED") {
        for (const jumpDate of contact.jumpDates.filter((item) => item.dateTypeId === assignment.mix.dateTypeId)) {
          for (const occurrence of getJumpDateOccurrences(jumpDate, occurrenceStart, occurrenceEnd)) {
            triggers.push({
              logicalDate: occurrence,
              jumpDateId: jumpDate.id,
              occurrenceKey: `jump-date:${jumpDate.id}:${logicalDateKey(occurrence)}`,
              reason: jumpDate.label || jumpDate.dateType.name,
              timezone: jumpDate.timezone || workspaceTimezone,
              timeMinutes: jumpDate.timeMinutes
            });
          }
        }
      } else if (assignment.mix.triggerMode === "BROADCAST") {
        const schedule = broadcastByMixId.get(assignment.mixId);
        if (schedule) {
          const logicalDate = logicalDateFromDate(schedule.localDate);
          triggers.push({
            logicalDate,
            jumpDateId: null,
            occurrenceKey: `broadcast:${schedule.id}:${logicalDateKey(logicalDate)}`,
            reason: assignment.mix.name,
            timezone: schedule.timezone,
            timeMinutes: schedule.timeMinutes
          });
        }
      } else {
        const timezone = workspaceTimezone;
        const startDate = assignment.startDate ?? assignment.createdAt;
        const logicalDate = logicalDateInTimezone(startDate, timezone);
        triggers.push({
          logicalDate,
          jumpDateId: null,
          occurrenceKey: `manual:${logicalDateKey(logicalDate)}`,
          reason: assignment.mix.name,
          timezone,
          timeMinutes: null
        });
      }

      for (const trigger of triggers) {
        let previousScheduledAt: Date | null = null;
        for (const mixStep of assignment.mix.steps) {
          // Beats a completed visit made moot, or that wait for the visit's outcome, are held, not desired.
          if (binding && bindingHolds.get(binding.id)?.mixStepIds?.includes(mixStep.id)) continue;
          let originalLogicalDate: LogicalDate;
          let scheduledLogicalDate: LogicalDate;
          let sendTimeMinutes: number;
          let scheduledAt: Date;
          let occurrenceKey = trigger.occurrenceKey;
          if (mixStep.plannedAt) {
            // A planned beat goes out at its instant to everyone who has reached it or passed it by
            // then; contacts still earlier in the mix wait. Weekend shifts and quiet hours do not
            // move it, because the time is explicit.
            if (!plannedStepApplies(previousScheduledAt, mixStep.plannedAt)) { previousScheduledAt = mixStep.plannedAt; continue; }
            scheduledAt = mixStep.plannedAt;
            scheduledLogicalDate = logicalDateInTimezone(scheduledAt, trigger.timezone);
            originalLogicalDate = scheduledLogicalDate;
            sendTimeMinutes = minutesInTimezone(scheduledAt, trigger.timezone);
            occurrenceKey = `planned:${mixStep.id}`;
          } else {
            originalLogicalDate = addLogicalDays(trigger.logicalDate, mixStep.dayOffset);
            scheduledLogicalDate = shiftWeekend(originalLogicalDate, personalRule.weekendScheduling);
            const requestedMinutes = mixStep.sendTimeMinutes ?? trigger.timeMinutes ?? personalRule.defaultFollowUpMinutes;
            sendTimeMinutes = outsideQuietHours(requestedMinutes, personalRule.quietHoursStart, personalRule.quietHoursEnd);
            scheduledAt = zonedDateTimeToUtc(scheduledLogicalDate, sendTimeMinutes, trigger.timezone);
          }
          previousScheduledAt = scheduledAt;
          if (scheduledAt < horizonStart || scheduledAt > horizonEnd) continue;

          const localDateTime = scheduledLocalDateTimeKey(scheduledLogicalDate, sendTimeMinutes);
          const anchored = Boolean(binding && appointment);
          const uniquenessKey = createJumpUniquenessKey({
            workspaceId: assignment.workspaceId,
            contactId: contact.id,
            mixId: assignment.mixId,
            mixStepId: mixStep.id,
            occurrenceKey: anchored ? `appointment:${binding!.id}` : occurrenceKey,
            scheduledLocalDateTime: anchored ? ANCHORED_KEY_PART : localDateTime,
            timezone: anchored ? ANCHORED_KEY_PART : trigger.timezone
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
            channel,
            appointment
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
            baseScheduledAt: scheduledAt,
            reason: trigger.reason,
            templateSnapshot: {
              subject: mixStep.stepVersion.subject,
              body: mixStep.stepVersion.body,
              script: mixStep.stepVersion.script,
              channel,
              localDateTime,
              timezone: trigger.timezone,
              originalLocalDate: logicalDateKey(originalLogicalDate),
              weekendRule: personalRule.weekendScheduling
            },
            renderedSnapshot,
            appointmentBindingId: anchored ? binding!.id : null
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
      select: {
        id: true,
        uniquenessKey: true,
        status: true,
        completionMethod: true,
        workspaceId: true,
        contactId: true,
        jumpDateId: true,
        mixId: true,
        mixStepId: true,
        stepVersionId: true,
        scheduledAt: true,
        baseScheduledAt: true,
        snoozedUntil: true,
        updatedAt: true,
        reason: true,
        templateSnapshot: true,
        renderedSnapshot: true, completedAt: true,
        appointmentBindingId: true
      }
    }));
  }
  const existingByKey = new Map(existingDesired.map((item) => [item.uniquenessKey, item]));

  let created = 0;
  let updated = 0;
  const creates: Prisma.JumpCreateManyInput[] = [];
  // Draft rows to move from the replaced row to the regenerated one, keyed by the new row's key.
  const draftCarries = new Map<string, string>();
  const updates: Array<{ existing: ExistingJump; desired: DesiredJump }> = [];
  for (const desiredJump of desired.values()) {
    const existing = existingByKey.get(desiredJump.uniquenessKey);
    if (!existing) {
      const originalLocalDate = originalLocalDateOf(desiredJump.templateSnapshot);
      const carried = originalLocalDate ? ownedByOccurrence.get(occurrenceCarryKey(desiredJump.contactId, desiredJump.mixStepId, desiredJump.jumpDateId, originalLocalDate)) : undefined;
      if (carried && !desired.has(carried.uniquenessKey)) {
        if (carried.snoozedUntil && carried.snoozedUntil > desiredJump.scheduledAt) desiredJump.scheduledAt = carried.snoozedUntil;
        creates.push({ ...desiredJump, status: "PENDING", snoozedUntil: carried.snoozedUntil });
        draftCarries.set(desiredJump.uniquenessKey, carried.id);
      } else {
        creates.push({ ...desiredJump, status: "PENDING" });
      }
      continue;
    }
    if (!canReconcile(existing)) continue;
    // A snooze is user-owned: the follow-up is never moved earlier than the chosen not-before time.
    if (existing.snoozedUntil && existing.snoozedUntil > desiredJump.scheduledAt) desiredJump.scheduledAt = existing.snoozedUntil;
    const targetStatus: JumpStatus = existing.status === "CANCELED" ? "PENDING" : existing.status;
    if (targetStatus === existing.status && sameDesired(existing, desiredJump)) continue;
    updates.push({ existing, desired: desiredJump });
  }

  for (const batch of chunks(creates)) {
    const carries = batch.flatMap((item) => (draftCarries.has(item.uniquenessKey) ? [{ uniquenessKey: item.uniquenessKey, fromJumpId: draftCarries.get(item.uniquenessKey)! }] : []));
    if (!carries.length) {
      created += (await prisma.jump.createMany({ data: batch, skipDuplicates: true })).count;
      continue;
    }
    // The regenerated rows and their carried drafts land together. Whole draft rows are re-keyed;
    // their text is never inspected. The source must still be pending, so a draft on a row the
    // owner completed after this pass read it stays where it is.
    created += await prisma.$transaction(async (tx) => {
      const result = await tx.jump.createMany({ data: batch, skipDuplicates: true });
      const createdRows = await tx.jump.findMany({ where: { uniquenessKey: { in: carries.map((carry) => carry.uniquenessKey) } }, select: { id: true, uniquenessKey: true } });
      const idByKey = new Map(createdRows.map((row) => [row.uniquenessKey, row.id]));
      for (const carry of carries) {
        const toJumpId = idByKey.get(carry.uniquenessKey);
        if (!toJumpId || toJumpId === carry.fromJumpId) continue;
        const occupied = (await tx.jumpDraft.findMany({ where: { jumpId: toJumpId }, select: { family: true } })).map((row) => row.family);
        await tx.jumpDraft.updateMany({
          where: {
            jumpId: carry.fromJumpId,
            jump: { OR: [{ status: "PENDING" }, { status: "CANCELED", completionMethod: "contact_merged" }] },
            ...(occupied.length ? { family: { notIn: occupied } } : {})
          },
          data: { jumpId: toJumpId }
        });
      }
      return result.count;
    });
  }
  for (const batch of chunks(updates, 100)) {
    const results = await prisma.$transaction(batch.map(({ existing, desired: desiredJump }) => prisma.jump.updateMany({
      // Guarded on the row exactly as this pass read it, so a snooze, stop, pause, completion or
      // outcome recorded in the meantime is never overwritten. The next pass sees the new state.
      where: { id: existing.id, status: existing.status, updatedAt: existing.updatedAt },
      data: {
        workspaceId: desiredJump.workspaceId,
        contactId: desiredJump.contactId,
        jumpDateId: desiredJump.jumpDateId,
        mixId: desiredJump.mixId,
        mixStepId: desiredJump.mixStepId,
        stepVersionId: desiredJump.stepVersionId,
        scheduledAt: desiredJump.scheduledAt,
        baseScheduledAt: desiredJump.baseScheduledAt,
        reason: desiredJump.reason,
        templateSnapshot: desiredJump.templateSnapshot,
        renderedSnapshot: desiredJump.renderedSnapshot,
        appointmentBindingId: desiredJump.appointmentBindingId,
        status: existing.status === "CANCELED" ? "PENDING" : existing.status,
        completedAt: null,
        completionMethod: null
      }
    })));
    updated += results.reduce((sum, result) => sum + result.count, 0);
  }

  // Holds run before the stale pass, so a held binding's rows carry their own reason and a binding
  // that failed evaluation never has its work treated as stale.
  let held = 0;
  const heldBindingIds = [...bindingHolds.entries()].filter(([, hold]) => !hold.mixStepIds).map(([id]) => id);
  for (const [bindingId, hold] of bindingHolds) {
    const result = await prisma.jump.updateMany({
      where: {
        appointmentBindingId: bindingId,
        ...(hold.mixStepIds ? { mixStepId: { in: hold.mixStepIds } } : {}),
        // Pending rows are held; a row already held for another appointment reason takes the current one.
        OR: [
          { status: { in: STALE_CANCELLATION_STATUSES } },
          { status: "CANCELED", completionMethod: { in: Object.values(APPOINTMENT_HOLD_METHODS).filter((method) => method !== hold.method) } }
        ]
      },
      data: { status: "CANCELED", completedAt: null, completionMethod: hold.method }
    });
    held += result.count;
  }
  const failedBindings = [...bindingHolds.entries()].filter(([, hold]) => hold.method === APPOINTMENT_HOLD_METHODS.unresolved);
  if (evaluatedBindingIds.length) await prisma.appointmentBinding.updateMany({ where: { id: { in: evaluatedBindingIds } }, data: { lastEvaluatedAt: now, lastEvaluationError: null } });
  for (const [bindingId, hold] of failedBindings) {
    await prisma.appointmentBinding.updateMany({ where: { id: bindingId }, data: { lastEvaluatedAt: now, lastEvaluationError: hold.error } });
  }

  const staleCandidates = await prisma.jump.findMany({
    where: {
      ...baseJumpWhere(filters),
      status: { in: STALE_CANCELLATION_STATUSES },
      scheduledAt: { gte: horizonStart, lte: horizonEnd },
      // A whole-binding hold keeps every row of that binding out of the stale pass; a completed
      // visit's remaining beats are still desired and reconcile normally.
      ...(heldBindingIds.length ? { OR: [{ appointmentBindingId: null }, { appointmentBindingId: { notIn: heldBindingIds } }] } : {})
    },
    select: { id: true, uniquenessKey: true }
  });
  const staleIds = staleCandidates.filter((item) => !desired.has(item.uniquenessKey)).map((item) => item.id);
  let canceled = 0;
  for (const batch of chunks(staleIds)) {
    const result = await prisma.jump.updateMany({
      where: { id: { in: batch }, status: { in: STALE_CANCELLATION_STATUSES } },
      data: { status: "CANCELED", completedAt: null, completionMethod: "reconciled" }
    });
    canceled += result.count;
  }

  return { desired: desired.size, created, updated, canceled, held, failedBindings: failedBindings.length };
}

export async function generateJumps(filters: ReconciliationFilters = {}): Promise<number> {
  return (await reconcileJumps(filters)).created;
}
