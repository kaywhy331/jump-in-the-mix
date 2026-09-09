import { describe, expect, it } from "vitest";
import { parseCalendarTime } from "@/lib/calendar-time";
import { createCalendarIcs, parseCalendarFile } from "@/lib/calendar-ical";
import { calendarFeedUrl, publicCalendarAddress } from "@/lib/calendar-feed-fetch";
import { parseIntakePayload } from "@/lib/intake";
const now = new Date("2026-09-05T12:00:00Z");
const file = (...events: string[]) => ["BEGIN:VCALENDAR","VERSION:2.0",...events,"END:VCALENDAR"].join("\r\n");
const event = (lines: string) => `BEGIN:VEVENT\r\nUID:sample\r\nDTSTAMP:20260905T120000Z\r\n${lines}\r\nEND:VEVENT`;

describe("calendar standards and incoming field validation", () => {
  it("books the intended instant and rejects invalid or ambiguous local times", () => {
    expect(parseCalendarTime("2026-09-07T09:00", "America/Los_Angeles").toISOString()).toBe("2026-09-07T16:00:00.000Z");
    expect(parseCalendarTime("2026-09-07T09:00", "Asia/Kolkata").toISOString()).toBe("2026-09-07T03:30:00.000Z");
    expect(() => parseCalendarTime("2026-03-08T02:30", "America/Los_Angeles")).toThrow("does not exist");
    expect(() => parseCalendarTime("2026-11-01T01:30", "America/Los_Angeles")).toThrow("occurs twice");
    expect(() => parseCalendarTime("2026-02-30T12:00", "UTC")).toThrow();
    expect(() => parseCalendarTime("2026-09-05T12:00", "Unknown/Zone")).toThrow();
  });
  it("expands recurring events across DST and respects exclusions", () => {
    const entries = parseCalendarFile(file(event("DTSTART;TZID=America/New_York:20261031T090000\r\nDTEND;TZID=America/New_York:20261031T100000\r\nRRULE:FREQ=DAILY;COUNT=4\r\nEXDATE;TZID=America/New_York:20261102T090000\r\nSUMMARY:Daily meeting")), "UTC", now);
    expect(entries.map(item => item.startsAt.toISOString())).toEqual(["2026-10-31T13:00:00.000Z","2026-11-01T14:00:00.000Z","2026-11-03T14:00:00.000Z"]);
    expect(new Set(entries.map(item => item.externalUid)).size).toBe(3);
  });
  it("interprets floating and all-day events in the selected calendar timezone", () => {
    const floating = parseCalendarFile(file(event("DTSTART:20260907T090000\r\nDTEND:20260907T100000\r\nSUMMARY:Floating")), "America/Los_Angeles", now);
    expect(floating[0].startsAt.toISOString()).toBe("2026-09-07T16:00:00.000Z");
    const allDay = parseCalendarFile(file(event("DTSTART;VALUE=DATE:20260907\r\nDTEND;VALUE=DATE:20260908\r\nSUMMARY:Holiday")), "America/Los_Angeles", now);
    expect(allDay[0].startsAt.toISOString()).toBe("2026-09-07T07:00:00.000Z");
    expect(allDay[0].endsAt.toISOString()).toBe("2026-09-08T07:00:00.000Z");
  });
  it("ignores transparent/canceled events and rejects malformed or explosive recurrence", () => {
    expect(parseCalendarFile(file(event("DTSTART:20260907T090000Z\r\nDTEND:20260907T100000Z\r\nTRANSP:TRANSPARENT")), "UTC", now)).toHaveLength(0);
    expect(parseCalendarFile(file(event("DTSTART:20260907T090000Z\r\nDTEND:20260907T100000Z\r\nSTATUS:CANCELLED")), "UTC", now)).toHaveLength(0);
    expect(() => parseCalendarFile("<html>login</html>", "UTC", now)).toThrow();
    expect(() => parseCalendarFile(file(event("DTSTART:20260907T090000Z\r\nDTEND:20260907T100000Z\r\nRRULE:FREQ=SECONDLY")), "UTC", now)).toThrow("more often");
  });
  it("exports folded UTF-8 text without allowing calendar property injection", () => {
    const title = "Meeting; with, Zoë 🥁 ".repeat(8) + "\r\nATTENDEE:attacker@example.com";
    const text = createCalendarIcs([{ id: "test", title, startsAt: new Date("2026-09-07T09:00Z"), endsAt: new Date("2026-09-07T10:00Z"), updatedAt: now, version: 2, canceledAt: null }]);
    expect(text).not.toContain("\r\nATTENDEE:");
    expect(text.split("\r\n").every(line => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(parseCalendarFile(text, "UTC", now)[0].title).toBe(title.replace(/\r\n/g,"\n").slice(0,160));
    expect(text).toContain("SEQUENCE:2");
  });
  it("allows public HTTPS feeds while rejecting internal, mapped, and reserved destinations", () => {
    for (const address of ["127.0.0.1","10.2.3.4","169.254.169.254","100.64.1.2","192.168.1.2","224.0.0.1","::1","::ffff:127.0.0.1","fc00::1","fe80::1","2001:db8::1","2002:7f00:1::1"]) expect(publicCalendarAddress(address), address).toBe(false);
    for (const address of ["8.8.8.8","1.1.1.1","2606:4700:4700::1111"]) expect(publicCalendarAddress(address), address).toBe(true);
    expect(calendarFeedUrl("webcal://calendar.example.com/feed").protocol).toBe("https:");
    for (const url of ["http://example.com", "file:///tmp/a", "https://user:pass@example.com", "https://example.com:8080"]) expect(() => calendarFeedUrl(url)).toThrow();
  });
  it("normalizes contact methods and restricts event fields", () => {
    const input = parseIntakePayload({ eventId: "e1", email: " HELLO@EXAMPLE.COM ", phone: "+1 (415) 555-0123" });
    expect(input.email).toBe("hello@example.com"); expect(input.phone).toBe("+14155550123");
    expect(() => parseIntakePayload({ eventId: "e1", email: "bad" })).toThrow();
    expect(() => parseIntakePayload({ eventId: "e1", externalId: "p1", eventType: "MANUAL" })).toThrow();
    expect(() => parseIntakePayload({ eventId: "e1", externalId: "p1", doNotContact: false })).toThrow();
    expect(() => parseIntakePayload({ email: "hello@example.com" })).toThrow();
  });
});
