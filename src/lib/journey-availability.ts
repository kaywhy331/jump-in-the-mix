import { addLogicalDays, logicalDateInTimezone, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { minutesInTimezone } from "@/lib/planned-step";
import { quietAt, readJourneyPreferences } from "@/lib/journey-preferences";

export type AvailabilityRule = { journeyPreferences?: unknown; quietHoursStart: number; quietHoursEnd: number; appointmentBufferMinutes?: number };
export type BusyTime = { startsAt: Date; endsAt: Date; kind: string };

/** Opt-in working windows. Always moves forward; calendar data and manual times remain intact. */
export function nextJourneyAvailability(at: Date, timezone: string, rule: AvailabilityRule, busy: BusyTime[] = []): Date {
  const p = readJourneyPreferences(rule.journeyPreferences);
  if (!p) return at;
  const buffer = (rule.appointmentBufferMinutes ?? 0) * 60_000;
  let candidate = at;
  for (let attempt = 0; attempt < 400 + busy.length; attempt++) {
    const date = logicalDateInTimezone(candidate, timezone), minutes = minutesInTimezone(candidate, timezone);
    const day = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    const nextMinute = p.workDays.includes(day) ? Array.from({ length: Math.max(0, p.workEnd - Math.max(p.workStart, minutes)) }, (_, i) => Math.max(p.workStart, minutes) + i).find(n => !quietAt(n, rule.quietHoursStart, rule.quietHoursEnd)) : undefined;
    if (nextMinute === undefined) { candidate = zonedDateTimeToUtc(addLogicalDays(date, 1), p.workStart, timezone); continue; }
    if (nextMinute !== minutes) {
      const moved = zonedDateTimeToUtc(date, nextMinute, timezone);
      // A wall-clock time inside a DST gap may resolve backward. Advance on the
      // real timeline and recheck the window rather than returning an invalid hour.
      candidate = new Date(Math.max(candidate.getTime() + 60_000, moved.getTime()));
      continue;
    }
    const conflict = p.avoidAppointments ? busy.find(item => candidate.getTime() >= item.startsAt.getTime() - (item.kind === "BLOCK" ? 0 : buffer) && candidate.getTime() < item.endsAt.getTime() + (item.kind === "BLOCK" ? 0 : buffer)) : undefined;
    if (conflict) { candidate = new Date(conflict.endsAt.getTime() + (conflict.kind === "BLOCK" ? 0 : buffer)); continue; }
    return candidate;
  }
  throw new Error("No available follow-up time was found. Review your working hours and calendar.");
}
