// Pure helpers behind the follow-up date and time picker. Dates travel as
// YYYY-MM-DD keys and times as HH:MM so the picker never depends on the
// browser timezone; formatting pins a UTC noon instant for the same reason.

export type DateKey = string;
export type TimeKey = string;
export type QuickSelect = { id: string; label: string; date: DateKey };
export type MonthCell = { key: DateKey; day: number; inMonth: boolean };

const pad = (value: number) => String(value).padStart(2, "0");

export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_KEY = /^\d{2}:\d{2}$/;

export function dateKeyOf(value: Date): DateKey {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function timeKeyOf(value: Date): TimeKey {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } | null {
  if (!DATE_KEY.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

function utcNoon(key: DateKey): Date {
  const parts = parseDateKey(key);
  if (!parts) throw new Error(`Invalid date key: ${key}`);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
}

const keyOfUtc = (value: Date): DateKey => `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;

export function addDays(key: DateKey, days: number): DateKey {
  const date = utcNoon(key);
  date.setUTCDate(date.getUTCDate() + days);
  return keyOfUtc(date);
}

// Clamps to the last day of the target month, so Jan 31 + 1 month is Feb 28/29.
export function addMonths(key: DateKey, months: number): DateKey {
  const { year, month, day } = parseDateKey(key)!;
  const first = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return keyOfUtc(first);
}

export function compareDateKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minutesOf(time: TimeKey): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function timeOf(minutes: number): TimeKey {
  const safe = Math.min(Math.max(Math.round(minutes), 0), 1439);
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

// Common business follow-up intervals, one tap each.
export function quickSelects(today: DateKey): QuickSelect[] {
  return [
    { id: "today", label: "Today", date: today },
    { id: "tomorrow", label: "Tomorrow", date: addDays(today, 1) },
    { id: "next-week", label: "Next week", date: addDays(today, 7) },
    { id: "two-weeks", label: "In 2 weeks", date: addDays(today, 14) },
    { id: "one-month", label: "In 1 month", date: addMonths(today, 1) }
  ];
}

// Whole weeks covering one month, Sunday first, so the grid never jumps height mid-month.
export function monthGrid(year: number, month: number, weekStartsOn = 0): MonthCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() - weekStartsOn + 7) % 7;
  const cells: MonthCell[] = [];
  const cursor = new Date(first);
  cursor.setUTCDate(1 - lead);
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  for (let index = 0; index < total; index += 1) {
    cells.push({ key: keyOfUtc(cursor), day: cursor.getUTCDate(), inMonth: cursor.getUTCMonth() === month - 1 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cells;
}

export const DEFAULT_SLOT_RANGE = { startMinutes: 7 * 60, endMinutes: 19 * 60, stepMinutes: 30 } as const;

// Preset intervals instead of a minute-by-minute picker. A current value that
// falls off the grid (an older 9:15 booking) is kept as its own slot.
export function timeSlots(range: { startMinutes?: number; endMinutes?: number; stepMinutes?: number } = {}, include?: TimeKey | null): TimeKey[] {
  const { startMinutes, endMinutes, stepMinutes } = { ...DEFAULT_SLOT_RANGE, ...range };
  const slots: TimeKey[] = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += stepMinutes) slots.push(timeOf(minutes));
  if (include && TIME_KEY.test(include) && !slots.includes(include)) {
    slots.push(include);
    slots.sort((a, b) => minutesOf(a) - minutesOf(b));
  }
  return slots;
}

// Formatting never falls back to the runtime's own locale: the server and the browser can differ,
// and a differing trigger label is a hydration mismatch. Callers pass the user's saved locale.
export const DEFAULT_WHEN_LOCALE = "en-US";

export function weekdayLabels(locale: string = DEFAULT_WHEN_LOCALE, weekStartsOn = 0): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  // 2026-09-06 is a Sunday.
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(Date.UTC(2026, 8, 6 + ((index + weekStartsOn) % 7), 12))));
}

export function formatMonthTitle(year: number, month: number, locale: string = DEFAULT_WHEN_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

export function formatDateLong(key: DateKey, locale: string = DEFAULT_WHEN_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(utcNoon(key));
}

// "Today, Sep 11" · "Tomorrow, Sep 12" · "Tue, Oct 14" · "Tue, Oct 14, 2027" outside the current year.
export function formatDateTrigger(key: DateKey, today?: DateKey | null, locale: string = DEFAULT_WHEN_LOCALE): string {
  if (!parseDateKey(key)) return "Choose a date";
  const sameYear = !today || key.slice(0, 4) === today.slice(0, 4);
  const short = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC", ...(sameYear ? {} : { year: "numeric" }) }).format(utcNoon(key));
  if (today && key === today) return `Today, ${short}`;
  if (today && key === addDays(today, 1)) return `Tomorrow, ${short}`;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(utcNoon(key));
  return `${weekday}, ${short}`;
}

export function formatTimeLabel(time: TimeKey, locale: string = DEFAULT_WHEN_LOCALE): string {
  if (!TIME_KEY.test(time)) return "Choose a time";
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, hours, minutes)));
}

export function formatDurationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
}

// Adds minutes to a local wall-clock pair, rolling the date forward past midnight.
export function addMinutesToLocal(date: DateKey, time: TimeKey, minutes: number): { date: DateKey; time: TimeKey } {
  const total = minutesOf(time) + minutes;
  const days = Math.floor(total / 1440);
  return { date: addDays(date, days), time: timeOf(((total % 1440) + 1440) % 1440) };
}

export function splitLocal(value: string): { date: DateKey; time: TimeKey } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  if (!match || !parseDateKey(match[1])) return null;
  return { date: match[1], time: match[2] };
}

// Sunday is 0, matching the grid's default week start.
export function weekdayOf(key: DateKey): number {
  return utcNoon(key).getUTCDay();
}

// Where a key press moves the focused day: arrows step a day or a week, Home and End jump
// to the ends of the week, Page Up and Page Down change the month. Anything before
// `earliest` lands on `earliest` instead, so the focus never disappears into disabled days.
export function keyboardDateTarget(current: DateKey, key: string, earliest?: DateKey | null, weekStartsOn = 0): DateKey | null {
  if (!parseDateKey(current)) return null;
  const weekday = (weekdayOf(current) - weekStartsOn + 7) % 7;
  let next: DateKey;
  switch (key) {
    case "ArrowLeft": next = addDays(current, -1); break;
    case "ArrowRight": next = addDays(current, 1); break;
    case "ArrowUp": next = addDays(current, -7); break;
    case "ArrowDown": next = addDays(current, 7); break;
    case "Home": next = addDays(current, -weekday); break;
    case "End": next = addDays(current, 6 - weekday); break;
    case "PageUp": next = addMonths(current, -1); break;
    case "PageDown": next = addMonths(current, 1); break;
    default: return null;
  }
  return earliest && compareDateKeys(next, earliest) < 0 ? earliest : next;
}

// Where a key press moves the focused time in a grid wrapped at `columns` per row. Left and
// Right step one slot, Up and Down step one row, Home and End jump to the ends. Slots that
// cannot be chosen are passed over in the direction of travel.
export function keyboardSlotTarget(slots: Array<{ time: TimeKey; available: boolean }>, current: TimeKey, key: string, columns = 1): TimeKey | null {
  const index = slots.findIndex(slot => slot.time === current);
  if (index < 0) return null;
  const step = (delta: number) => {
    for (let at = index + delta; at >= 0 && at < slots.length; at += delta) if (slots[at].available) return slots[at].time;
    return null;
  };
  const row = Math.max(1, Math.floor(columns) || 1);
  switch (key) {
    case "ArrowLeft": return step(-1);
    case "ArrowRight": return step(1);
    case "ArrowUp": return step(-row);
    case "ArrowDown": return step(row);
    case "Home": return slots.find(slot => slot.available)?.time ?? null;
    case "End": return slots.filter(slot => slot.available).at(-1)?.time ?? null;
    default: return null;
  }
}
