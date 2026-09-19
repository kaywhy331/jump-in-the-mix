import type { Prisma } from "@/generated/prisma/client";
import { addLogicalDays, logicalDateInTimezone, zonedDateTimeToUtc } from "@/lib/jump-schedule";

export const JOURNEY_DUE_FILTERS = ["all", "late", "today", "week", "later", "quiet"] as const;
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
  return { start: zonedDateTimeToUtc(day, 0, timezone), tomorrow: zonedDateTimeToUtc(addLogicalDays(day, 1), 0, timezone), week: zonedDateTimeToUtc(addLogicalDays(day, 7), 0, timezone) };
}
// These exclusive filters classify people by their earliest pending follow-up.
export function journeyDueWhere(filter: JourneyDueFilter, dates: ReturnType<typeof journeyDates>, mixId?: string): Prisma.ContactWhereInput {
  const base: Prisma.JumpWhereInput = { status: "PENDING", ...(mixId ? { mixId } : {}) };
  if (filter === "all") return {};
  if (filter === "quiet") return { jumps: { none: base } };
  const range = filter === "late" ? { lt: dates.start }
    : filter === "today" ? { gte: dates.start, lt: dates.tomorrow }
    : filter === "week" ? { gte: dates.tomorrow, lt: dates.week }
    : { gte: dates.week };
  const before = filter === "today" ? dates.start : filter === "week" ? dates.tomorrow : filter === "later" ? dates.week : null;
  return { AND: [{ jumps: { some: { ...base, scheduledAt: range } } }, ...(before ? [{ jumps: { none: { ...base, scheduledAt: { lt: before } } } }] : [])] };
}
export function journeyDueBucket(date: Date | null, dates: ReturnType<typeof journeyDates>): JourneyDueFilter {
  return !date ? "quiet" : date < dates.start ? "late" : date < dates.tomorrow ? "today" : date < dates.week ? "week" : "later";
}
