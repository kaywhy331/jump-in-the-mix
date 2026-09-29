import { nextJourneyAvailability } from "@/lib/journey-availability";
import { addLogicalDays, logicalDateInTimezone, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { outsideQuietHours, shiftWeekend, type PersonalSchedulingRule } from "@/lib/personal-scheduling";
import { anchoredStepInstant, type BoundStepTiming } from "@/lib/step-timing";
import { minutesInTimezone, plannedStepApplies } from "@/lib/planned-step";

/** Uses the scheduler's timing primitives; a preview never creates assignments. */
export function previewSchedule(steps: BoundStepTiming[], start: Date, end: Date, timezone: string, rules: PersonalSchedulingRule, appointment: boolean) {
  let previous: Date | null = null;
  return steps.map(step => {
    let at: Date | null = null;
    let note = "";
    if (step.anchor !== "CALENDAR_DAY") {
      at = appointment ? anchoredStepInstant(step, { startsAt: start, endsAt: end, outcome: null, outcomeAt: null }) : null;
      note = step.anchor === "VISIT_COMPLETED" ? "Waits until you record that the visit happened; then counts the selected minutes." : !appointment ? "Needs a linked appointment." : "Exact appointment offset; quiet hours and weekends do not move it. After-visit steps wait for the outcome.";
    } else if (step.plannedAt) {
      at = plannedStepApplies(previous, step.plannedAt) ? step.plannedAt : null;
      note = at ? "Exact planned time; quiet hours and weekends do not move it." : "The preceding Beat has not been reached by this planned time.";
      previous = step.plannedAt;
    } else {
      const date = shiftWeekend(addLogicalDays(logicalDateInTimezone(start, timezone), step.dayOffset), rules.weekendScheduling);
      const minutes = outsideQuietHours(step.sendTimeMinutes ?? (appointment ? minutesInTimezone(start, timezone) : rules.defaultFollowUpMinutes), rules.quietHoursStart, rules.quietHoursEnd);
      at = rules.journeyPreferences ? nextJourneyAvailability(zonedDateTimeToUtc(date, step.sendTimeMinutes ?? (appointment ? minutesInTimezone(start, timezone) : rules.defaultFollowUpMinutes), timezone), timezone, rules) : zonedDateTimeToUtc(date, minutes, timezone);
      note = rules.journeyPreferences ? "Includes working days and quiet times. Calendar conflicts are checked when the follow-up is scheduled." : "Includes your weekend and quiet-hour rules.";
    }
    if (at) previous = at;
    return { at: at?.toISOString() ?? null, note };
  });
}
