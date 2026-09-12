import { logicalDateInTimezone, logicalDateKey } from "@/lib/jump-schedule";

// A planned beat goes out at one specific instant instead of a day offset from the trigger.
// It reaches every contact who has made it to that beat or past it by then: the beat before
// it (in mix order) must already have come due at or before the planned instant. Contacts who
// are still earlier in the mix wait until they get there.
export function plannedStepApplies(previousScheduledAt: Date | null, plannedAt: Date): boolean {
  return previousScheduledAt === null || previousScheduledAt.getTime() <= plannedAt.getTime();
}

// Wall-clock minutes of an instant in a timezone, for uniqueness keys and quiet-hours checks.
export function minutesInTimezone(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const read = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return read("hour") * 60 + read("minute");
}

// The instant as the editor's datetime-local value, in the workspace timezone.
export function plannedAtInput(at: Date, timezone: string): string {
  const minutes = minutesInTimezone(at, timezone);
  return `${logicalDateKey(logicalDateInTimezone(at, timezone))}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
