import type { Prisma } from "@/generated/prisma/client";
import { addLogicalDays, logicalDateInTimezone, zonedDateTimeToUtc } from "@/lib/jump-schedule";

export const JOURNEY_DUE_FILTERS = ["all", "late", "today", "tomorrow", "week", "next-week", "later", "quiet"] as const;
export type JourneyDueFilter = typeof JOURNEY_DUE_FILTERS[number];
export function journeyDueFilter(value?: string): JourneyDueFilter {
  return JOURNEY_DUE_FILTERS.includes(value as JourneyDueFilter) ? value as JourneyDueFilter : "all";
}
/** Assigned directly, through a group, or still awaiting a prepared follow-up. */
export function journeyMixMembers(workspaceId: string, mixId: string): Prisma.ContactWhereInput {
  return { OR: [
    { mixAssignments: { some: { workspaceId, mixId, isActive: true } } },
    { groupMemberships: { some: { group: { workspaceId, assignments: { some: { workspaceId, mixId, isActive: true } } } } } },
    { jumps: { some: { workspaceId, mixId, status: "PENDING" } } }
  ] };
}
export function journeyDates(now: Date, timezone: string) {
  const day = logicalDateInTimezone(now, timezone);
  const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
  const untilMonday = ((8 - weekday) % 7) || 7;
  const at = (offset: number) => zonedDateTimeToUtc(addLogicalDays(day, offset), 0, timezone);
  // Tomorrow always wins, including a Sunday -> Monday boundary.
  return { start: at(0), tomorrow: at(1), dayAfterTomorrow: at(2), thisWeekEnd: at(Math.max(2, untilMonday)), nextWeekEnd: at(untilMonday + 7), week: at(7) };
}
// These exclusive filters classify people by their earliest pending follow-up.
export function journeyDueWhere(filter: JourneyDueFilter, dates: ReturnType<typeof journeyDates>, mixId?: string): Prisma.ContactWhereInput {
  const base: Prisma.JumpWhereInput = { status: "PENDING", ...(mixId ? { mixId } : {}) };
  if (filter === "all") return {};
  if (filter === "quiet") return { jumps: { none: base } };
  const range = journeyDueRange(filter, dates);
  return { AND: [{ jumps: { some: { ...base, scheduledAt: range } } }, ...(range.gte ? [{ jumps: { none: { ...base, scheduledAt: { lt: range.gte } } } }] : [])] };
}
export function journeyDueRange(filter: JourneyDueFilter, dates: ReturnType<typeof journeyDates>): { gte?: Date; lt?: Date } {
  return filter === "late" ? { lt: dates.start }
    : filter === "today" ? { gte: dates.start, lt: dates.tomorrow }
    : filter === "tomorrow" ? { gte: dates.tomorrow, lt: dates.dayAfterTomorrow }
    : filter === "week" ? { gte: dates.dayAfterTomorrow, lt: dates.thisWeekEnd }
    : filter === "next-week" ? { gte: dates.thisWeekEnd, lt: dates.nextWeekEnd }
    : { gte: dates.nextWeekEnd };
}
export function journeyDueBucket(date: Date | null, dates: ReturnType<typeof journeyDates>): JourneyDueFilter {
  return !date ? "quiet" : date < dates.start ? "late" : date < dates.tomorrow ? "today" : date < dates.dayAfterTomorrow ? "tomorrow" : date < dates.thisWeekEnd ? "week" : date < dates.nextWeekEnd ? "next-week" : "later";
}
