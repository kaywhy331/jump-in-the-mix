import {
  addLogicalDays,
  daysInMonth,
  logicalDateInTimezone,
  logicalDateKey,
  zonedDateTimeToUtc,
  type LogicalDate
} from "@/lib/jump-schedule";

export type SnoozePreset = "later-today" | "tomorrow" | "next-monday" | "next-week" | "custom";

export type SnoozeScheduleInput = {
  now: Date;
  timezone: string;
  preset: SnoozePreset;
  customDate?: string;
  preferredMinutes?: number;
  quietHoursStart?: number;
  quietHoursEnd?: number;
};

const DEFAULT_FOLLOW_UP_MINUTES = 10 * 60;
const LOCAL_PARTS = new Map<string, Intl.DateTimeFormat>();

function localFormatter(timezone: string): Intl.DateTimeFormat {
  const existing = LOCAL_PARTS.get(timezone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  LOCAL_PARTS.set(timezone, formatter);
  return formatter;
}

function localDateAndMinutes(value: Date, timezone: string): { date: LogicalDate; minutes: number } {
  try {
    const parts = Object.fromEntries(
      localFormatter(timezone).formatToParts(value)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)])
    );
    return {
      date: {
        year: parts.year ?? value.getUTCFullYear(),
        month: parts.month ?? value.getUTCMonth() + 1,
        day: parts.day ?? value.getUTCDate()
      },
      minutes: (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
    };
  } catch {
    return {
      date: logicalDateInTimezone(value, "UTC"),
      minutes: value.getUTCHours() * 60 + value.getUTCMinutes()
    };
  }
}

function sameLogicalDate(left: LogicalDate, right: LogicalDate): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function clampMinutes(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) ? Math.min(Math.max(Number(value), 0), 1439) : fallback;
}

export function isQuietTime(minutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function outsideQuietHours(
  date: LogicalDate,
  minutes: number,
  quietHoursStart: number,
  quietHoursEnd: number
): { date: LogicalDate; minutes: number } {
  if (!isQuietTime(minutes, quietHoursStart, quietHoursEnd)) return { date, minutes };
  if (quietHoursStart < quietHoursEnd || minutes < quietHoursEnd) {
    return { date, minutes: quietHoursEnd };
  }
  return { date: addLogicalDays(date, 1), minutes: quietHoursEnd };
}

function preferredLocalTime(
  date: LogicalDate,
  preferredMinutes: number,
  quietHoursStart: number,
  quietHoursEnd: number
): DateLocalTime {
  return outsideQuietHours(date, preferredMinutes, quietHoursStart, quietHoursEnd);
}

type DateLocalTime = { date: LogicalDate; minutes: number };

function parseCustomDate(value: string, defaultMinutes: number): DateLocalTime {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!match) throw new Error("Choose a valid date.");
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const hour = match[4] === undefined ? Math.floor(defaultMinutes / 60) : Number(match[4]);
  const minute = match[5] === undefined ? defaultMinutes % 60 : Number(match[5]);
  if (
    date.month < 1
    || date.month > 12
    || date.day < 1
    || date.day > daysInMonth(date.year, date.month)
    || hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
  ) throw new Error("Choose a valid date.");
  return { date, minutes: hour * 60 + minute };
}

function nextMonday(date: LogicalDate): LogicalDate {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  const days = ((8 - weekday) % 7) || 7;
  return addLogicalDays(date, days);
}

export function calculateSnoozeAt(input: SnoozeScheduleInput): Date {
  const preferredMinutes = clampMinutes(input.preferredMinutes, DEFAULT_FOLLOW_UP_MINUTES);
  const quietHoursStart = clampMinutes(input.quietHoursStart, 20 * 60);
  const quietHoursEnd = clampMinutes(input.quietHoursEnd, 8 * 60);
  const localNow = localDateAndMinutes(input.now, input.timezone);
  let target: DateLocalTime;

  if (input.preset === "custom") {
    const custom = parseCustomDate(input.customDate ?? "", preferredMinutes);
    target = outsideQuietHours(custom.date, custom.minutes, quietHoursStart, quietHoursEnd);
  } else if (input.preset === "tomorrow") {
    target = preferredLocalTime(addLogicalDays(localNow.date, 1), preferredMinutes, quietHoursStart, quietHoursEnd);
  } else if (input.preset === "next-week") {
    target = preferredLocalTime(addLogicalDays(localNow.date, 7), preferredMinutes, quietHoursStart, quietHoursEnd);
  } else if (input.preset === "next-monday") {
    target = preferredLocalTime(nextMonday(localNow.date), preferredMinutes, quietHoursStart, quietHoursEnd);
  } else {
    const proposedInstant = new Date(input.now.getTime() + 4 * 60 * 60 * 1000);
    const proposedLocal = localDateAndMinutes(proposedInstant, input.timezone);
    if (!sameLogicalDate(proposedLocal.date, localNow.date)) {
      target = preferredLocalTime(addLogicalDays(localNow.date, 1), preferredMinutes, quietHoursStart, quietHoursEnd);
    } else {
      const roundedMinutes = Math.ceil(proposedLocal.minutes / 15) * 15;
      target = roundedMinutes > 1439
        ? preferredLocalTime(addLogicalDays(localNow.date, 1), preferredMinutes, quietHoursStart, quietHoursEnd)
        : outsideQuietHours(proposedLocal.date, roundedMinutes, quietHoursStart, quietHoursEnd);
    }
  }

  const scheduledAt = zonedDateTimeToUtc(target.date, target.minutes, input.timezone);
  if (scheduledAt <= input.now) throw new Error("Choose a future date and time.");
  return scheduledAt;
}

export type SnoozeResolution = { ok: true; scheduledAt: Date } | { ok: false; dueAt: Date };

/**
 * A snooze is a not-before time. It can hold a follow-up past its base instant but never pull it
 * ahead of that instant; the base is recalculated by the scheduler and the snooze is kept as a floor.
 */
export function resolveSnooze(input: { chosen: Date; baseScheduledAt: Date | null }): SnoozeResolution {
  if (input.baseScheduledAt && input.chosen < input.baseScheduledAt) return { ok: false, dueAt: input.baseScheduledAt };
  return { ok: true, scheduledAt: input.chosen };
}

export const SNOOZE_PRESET_LABELS: Array<[SnoozePreset, string]> = [
  ["later-today", "Later today"],
  ["tomorrow", "Tomorrow"],
  ["next-monday", "Monday"],
  ["next-week", "Next week"]
];

export type SnoozeChoices = { presets: Array<[SnoozePreset, string]>; minDate: string; defaultDate: string };

/**
 * The presets and custom-day bounds a card may offer: only times after the follow-up's base
 * instant, so nothing offered is later refused.
 */
export function snoozeChoices(input: {
  now: Date;
  timezone: string;
  floor: Date;
  preferredMinutes?: number;
  quietHoursStart?: number;
  quietHoursEnd?: number;
}): SnoozeChoices {
  const presets = SNOOZE_PRESET_LABELS.filter(([preset]) => {
    try {
      return calculateSnoozeAt({
        now: input.now,
        timezone: input.timezone,
        preset,
        preferredMinutes: input.preferredMinutes,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd
      }) > input.floor;
    } catch {
      return false;
    }
  });
  const today = localDateAndMinutes(input.now, input.timezone).date;
  const floorDay = localDateAndMinutes(input.floor, input.timezone).date;
  const minDay = logicalDateKey(floorDay) > logicalDateKey(today) ? floorDay : today;
  const tomorrow = addLogicalDays(today, 1);
  const defaultDay = logicalDateKey(minDay) > logicalDateKey(tomorrow) ? minDay : tomorrow;
  return { presets, minDate: logicalDateKey(minDay), defaultDate: logicalDateKey(defaultDay) };
}
