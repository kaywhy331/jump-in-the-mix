import { createHash } from "node:crypto";

export type JumpDateRecurrence = "NONE" | "MONTHLY" | "YEARLY";

export type LogicalDate = {
  year: number;
  month: number;
  day: number;
};

export type JumpDateScheduleInput = {
  recurrence: JumpDateRecurrence;
  dateValue: Date | null;
  month: number | null;
  day: number | null;
};

export type JumpKeyInput = {
  workspaceId: string;
  contactId: string;
  mixId: string;
  mixStepId: string;
  occurrenceKey: string;
  scheduledLocalDateTime: string;
  timezone: string;
};

const PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = PARTS_FORMATTERS.get(timezone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  PARTS_FORMATTERS.set(timezone, formatter);
  return formatter;
}

function partsFor(date: Date, timezone: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const part of formatterFor(timezone).formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return values;
}

function timezoneOffsetMilliseconds(date: Date, timezone: string): number {
  const parts = partsFor(date, timezone);
  const representedAsUtc = Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0
  );
  return representedAsUtc - date.getTime();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function clampLogicalDate(year: number, month: number, day: number): LogicalDate {
  return { year, month, day: Math.min(Math.max(day, 1), daysInMonth(year, month)) };
}

export function logicalDateFromDate(value: Date): LogicalDate {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate()
  };
}

export function logicalDateInTimezone(value: Date, timezone: string): LogicalDate {
  try {
    const parts = partsFor(value, timezone);
    return { year: parts.year ?? value.getUTCFullYear(), month: parts.month ?? value.getUTCMonth() + 1, day: parts.day ?? value.getUTCDate() };
  } catch {
    return logicalDateFromDate(value);
  }
}

export function logicalDateKey(value: LogicalDate): string {
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function addLogicalDays(value: LogicalDate, days: number): LogicalDate {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  date.setUTCDate(date.getUTCDate() + days);
  return logicalDateFromDate(date);
}

export function addUtcDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function logicalTimestamp(value: LogicalDate): number {
  return Date.UTC(value.year, value.month - 1, value.day);
}

function isWithinLogicalRange(value: LogicalDate, start: LogicalDate, end: LogicalDate): boolean {
  const timestamp = logicalTimestamp(value);
  return timestamp >= logicalTimestamp(start) && timestamp <= logicalTimestamp(end);
}

export function getJumpDateOccurrences(
  jumpDate: JumpDateScheduleInput,
  rangeStart: Date,
  rangeEnd: Date
): LogicalDate[] {
  const start = logicalDateFromDate(rangeStart);
  const end = logicalDateFromDate(rangeEnd);

  if (jumpDate.recurrence === "NONE") {
    if (!jumpDate.dateValue) return [];
    const occurrence = logicalDateFromDate(jumpDate.dateValue);
    return isWithinLogicalRange(occurrence, start, end) ? [occurrence] : [];
  }

  const storedMonth = jumpDate.month ?? (jumpDate.dateValue ? jumpDate.dateValue.getUTCMonth() + 1 : null);
  const storedDay = jumpDate.day ?? (jumpDate.dateValue ? jumpDate.dateValue.getUTCDate() : null);
  if (!storedMonth || !storedDay) return [];

  const occurrences: LogicalDate[] = [];
  if (jumpDate.recurrence === "YEARLY") {
    for (let year = start.year; year <= end.year; year += 1) {
      const occurrence = clampLogicalDate(year, storedMonth, storedDay);
      if (isWithinLogicalRange(occurrence, start, end)) occurrences.push(occurrence);
    }
    return occurrences;
  }

  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    const occurrence = clampLogicalDate(year, month, storedDay);
    if (isWithinLogicalRange(occurrence, start, end)) occurrences.push(occurrence);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return occurrences;
}

export function zonedDateTimeToUtc(
  logicalDate: LogicalDate,
  minutesAfterMidnight: number,
  timezone: string
): Date {
  const safeMinutes = Math.min(Math.max(minutesAfterMidnight, 0), 1439);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  const utcGuess = new Date(Date.UTC(logicalDate.year, logicalDate.month - 1, logicalDate.day, hours, minutes, 0, 0));

  try {
    let offset = timezoneOffsetMilliseconds(utcGuess, timezone);
    let result = new Date(utcGuess.getTime() - offset);
    const correctedOffset = timezoneOffsetMilliseconds(result, timezone);
    if (correctedOffset !== offset) {
      offset = correctedOffset;
      result = new Date(utcGuess.getTime() - offset);
    }
    return result;
  } catch {
    return utcGuess;
  }
}

export function scheduledLocalDateTimeKey(logicalDate: LogicalDate, minutesAfterMidnight: number): string {
  const safeMinutes = Math.min(Math.max(minutesAfterMidnight, 0), 1439);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${logicalDateKey(logicalDate)}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function createJumpUniquenessKey(input: JumpKeyInput): string {
  return createHash("sha256")
    .update([
      input.workspaceId,
      input.contactId,
      input.mixId,
      input.mixStepId,
      input.occurrenceKey,
      input.scheduledLocalDateTime,
      input.timezone
    ].join(":"), "utf8")
    .digest("hex");
}
