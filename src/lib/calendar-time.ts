import { isValidTimezone } from "@/lib/mix-broadcast";
import { zonedDateTimeToUtc } from "@/lib/jump-schedule";

export function localCalendarTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (name: string) => parts.find(part => part.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function parseCalendarTime(value: string, timezone: string) {
  if (!isValidTimezone(timezone) || !timezone.trim()) throw new Error("Choose a valid timezone.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Choose a date and time.");
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (year < 2000 || year > 2100 || hour > 23 || minute > 59) throw new Error("Choose a valid date and time between 2000 and 2100.");
  const result = zonedDateTimeToUtc({ year, month, day }, hour * 60 + minute, timezone);
  if (localCalendarTime(result, timezone) !== value) throw new Error("That local time does not exist. Choose another time; daylight saving time may be changing.");
  // A repeated autumn hour needs an explicit choice instead of silently booking
  // the wrong instant. Users can choose UTC to disambiguate either occurrence.
  for (const minutes of [-120, -60, -30, 30, 60, 120]) {
    if (localCalendarTime(new Date(result.getTime() + minutes * 60_000), timezone) === value) throw new Error("That time occurs twice when clocks change. Choose UTC as the timezone and enter the intended UTC time.");
  }
  return result;
}

export function calendarRange(startsAt: Date, endsAt: Date) {
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) throw new Error("End time must be after the start time.");
  if (endsAt.getTime() - startsAt.getTime() > 31 * 86_400_000) throw new Error("Keep each meeting or time block within 31 days.");
}
