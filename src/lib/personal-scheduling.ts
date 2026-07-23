import type { WeekendScheduling } from "@/generated/prisma/client";
import { addLogicalDays, type LogicalDate } from "@/lib/jump-schedule";
import { prisma } from "@/lib/prisma";

export type PersonalSchedulingRule = {
  defaultFollowUpMinutes: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  weekendScheduling: WeekendScheduling;
};

export const DEFAULT_PERSONAL_SCHEDULING: PersonalSchedulingRule = {
  defaultFollowUpMinutes: 600,
  quietHoursStart: 1200,
  quietHoursEnd: 480,
  weekendScheduling: "KEEP"
};

export async function personalSchedulingRules(dataSpaceIds: string[]): Promise<Map<string, PersonalSchedulingRule>> {
  if (!dataSpaceIds.length) return new Map();
  const rows = await prisma.workspacePreference.findMany({ where: { workspaceId: { in: dataSpaceIds } } });
  return new Map(rows.map((row) => [row.workspaceId, {
    defaultFollowUpMinutes: row.defaultFollowUpMinutes,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    weekendScheduling: row.weekendScheduling
  }]));
}

export function shiftWeekend(value: LogicalDate, rule: WeekendScheduling): LogicalDate {
  if (rule === "KEEP") return value;
  const weekday = new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCDay();
  if (weekday === 6) return addLogicalDays(value, rule === "NEXT_MONDAY" ? 2 : -1);
  if (weekday === 0) return addLogicalDays(value, rule === "NEXT_MONDAY" ? 1 : -2);
  return value;
}

export function outsideQuietHours(minutes: number, start: number, end: number): number {
  if (start === end) return minutes;
  const inside = start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  return inside ? end : minutes;
}
