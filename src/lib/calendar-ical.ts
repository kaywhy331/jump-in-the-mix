import ical from "node-ical";
import { createHash } from "node:crypto";
import { zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { isValidTimezone } from "@/lib/mix-broadcast";

export type ImportedCalendarEntry = { externalUid: string; title: string; kind: string; startsAt: Date; endsAt: Date; timezone: string };
const day = 86_400_000;
export function parseCalendarFile(body: string, timezone: string, now = new Date()): ImportedCalendarEntry[] {
  if (Buffer.byteLength(body) > 1_048_576) throw new Error("Calendar files must be 1 MB or smaller.");
  if (!isValidTimezone(timezone) || !timezone) throw new Error("Choose a valid calendar timezone.");
  const unfolded = body.replace(/\r?\n[ \t]/g, "");
  if (!/^BEGIN:VCALENDAR\s*$/m.test(unfolded) || !/^END:VCALENDAR\s*$/m.test(unfolded)) throw new Error("Choose an iCalendar (.ics) file.");
  const rules = unfolded.match(/^RRULE:.*$/gm) ?? [];
  for (const rule of rules) {
    if (/FREQ=(SECONDLY|MINUTELY|HOURLY)/i.test(rule) || /BY(?:SECOND|MINUTE|HOUR)=[^;\r\n]*,/i.test(rule)) throw new Error("This calendar repeats more often than daily. Export a calendar with daily or less frequent meetings.");
  }
  if ((unfolded.match(/^BEGIN:VEVENT\s*$/gm) ?? []).length > 1000) throw new Error("Import up to 1,000 event series at a time.");
  // Floating times belong to the timezone selected by the business, never the
  // timezone of the server parsing the file.
  const localized = unfolded.replace(/^(DTSTART|DTEND|RECURRENCE-ID|EXDATE|RDATE):(\d{8}T\d{6}(?:,\d{8}T\d{6})*)\s*$/gm, `$1;TZID=${timezone}:$2`);
  let parsed: ReturnType<typeof ical.sync.parseICS>;
  try { parsed = ical.sync.parseICS(localized); } catch { throw new Error("This calendar could not be read. Export a new .ics file from your provider."); }
  const from = new Date(now.getTime() - 31 * day), to = new Date(now.getTime() + 366 * day);
  const result = new Map<string, ImportedCalendarEntry>();
  for (const event of Object.values(parsed)) {
    if (!event || event.type !== "VEVENT") continue;
    if (!event.uid || !event.start || !Number.isFinite(event.start.getTime())) throw new Error("Every calendar event needs an identifier and a valid start time.");
    if (event.status === "CANCELLED" || event.transparency === "TRANSPARENT") continue;
    if (event.rrule && event.start.getTime() < now.getTime() - 20 * 366 * day) throw new Error("A recurring event starts more than 20 years ago. Export a newer calendar range.");
    const instances = ical.expandRecurringEvent(event, { from, to, expandOngoing: true, includeOverrides: true, excludeExdates: true });
    for (const instance of instances) {
      if (instance.event.status === "CANCELLED" || instance.event.transparency === "TRANSPARENT") continue;
      let startsAt: Date = instance.start, endsAt: Date = instance.end;
      const zone = instance.start.tz && isValidTimezone(instance.start.tz) ? instance.start.tz : timezone;
      if (instance.isFullDay) {
        const atMidnight = (value: Date) => zonedDateTimeToUtc({ year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() }, 0, timezone);
        startsAt = atMidnight(startsAt); endsAt = atMidnight(endsAt);
      }
      if (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) throw new Error("An event has no valid end time. Add its duration in your calendar and try again.");
      const externalUid = createHash("sha256").update(`${event.uid}:${instance.isRecurring ? instance.start.toISOString() : "single"}`).digest("hex");
      const title = (typeof instance.summary === "string" ? instance.summary : instance.summary?.val) || "Busy";
      result.set(externalUid, { externalUid, title: title.slice(0, 160), kind: "BUSY", startsAt, endsAt, timezone: instance.isFullDay ? timezone : zone });
      if (result.size > 2000) throw new Error("This calendar has over 2,000 occurrences in the next year. Use a smaller calendar.");
    }
  }
  return [...result.values()];
}

function escapeText(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"); }
function fold(line: string) {
  const lines: string[] = []; let current = ""; let bytes = 0;
  for (const char of line) { const size = Buffer.byteLength(char); if (bytes + size > 75) { lines.push(current); current = " "; bytes = 1; } current += char; bytes += size; }
  return [...lines, current].join("\r\n");
}
const date = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function createCalendarIcs(entries: Array<{ id: string; title: string; startsAt: Date; endsAt: Date; updatedAt: Date; version: number; canceledAt: Date | null }>) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jump in the Mix//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Jump in the Mix", ...entries.flatMap(entry => ["BEGIN:VEVENT", `UID:${entry.id}@jumpinthemix`, `DTSTAMP:${date(entry.updatedAt)}`, `LAST-MODIFIED:${date(entry.updatedAt)}`, `SEQUENCE:${entry.version}`, `DTSTART:${date(entry.startsAt)}`, `DTEND:${date(entry.endsAt)}`, `SUMMARY:${escapeText(entry.title)}`, `STATUS:${entry.canceledAt ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT"]), "END:VCALENDAR", ""].map(fold).join("\r\n");
}
