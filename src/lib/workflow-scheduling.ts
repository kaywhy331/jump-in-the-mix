import { nextJourneyAvailability, type AvailabilityRule, type BusyTime } from "@/lib/journey-availability";
import { addLogicalDays, logicalDateInTimezone, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { outsideQuietHours, shiftWeekend, type PersonalSchedulingRule } from "@/lib/personal-scheduling";
import type { WorkflowStep } from "@/lib/mix-workflow-types";

/** Shared by the explicit-start preview and materialization of calendar-day Beats. */
export function workflowCalendarStepTime(step: WorkflowStep, readyAt: Date, timezone: string, scheduling: PersonalSchedulingRule & AvailabilityRule, busy: BusyTime[] = [], snoozedUntil?: Date | null): Date {
  const logical = shiftWeekend(addLogicalDays(logicalDateInTimezone(readyAt, timezone), step.dayOffset), scheduling.weekendScheduling);
  const planned = step.plannedAt ? new Date(step.plannedAt) : zonedDateTimeToUtc(logical, scheduling.journeyPreferences ? step.sendTimeMinutes ?? scheduling.defaultFollowUpMinutes : outsideQuietHours(step.sendTimeMinutes ?? scheduling.defaultFollowUpMinutes, scheduling.quietHoursStart, scheduling.quietHoursEnd), timezone);
  const due = new Date(Math.max(planned.getTime(), readyAt.getTime(), snoozedUntil?.getTime() ?? 0));
  return !step.plannedAt && !snoozedUntil ? nextJourneyAvailability(due, timezone, scheduling, busy) : due;
}
