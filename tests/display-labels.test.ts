import { describe, expect, it } from "vitest";
import { channelName, channelWord, localDateTimeLabel, timeOfDayLabel, zoneGenericName, zoneLabel } from "../src/lib/display-labels";
import { formatDateTime, formatTime } from "../src/lib/format";

describe("display labels (FMT-01–FMT-03, D79)", () => {
  it("names a time zone by its city, never by its IANA name", () => {
    expect(zoneLabel("America/New_York")).toBe("New York time");
    expect(zoneLabel("America/Los_Angeles")).toBe("Los Angeles time");
    expect(zoneLabel("America/Indiana/Indianapolis")).toBe("Indianapolis time");
    expect(zoneLabel("UTC")).toBe("UTC");
    expect(zoneLabel("")).toBe("UTC");
  });
  it("names zones without a plain city truthfully (DT-03)", () => {
    expect(["Etc/UTC", "UCT", "Etc/Universal", "Zulu", "GMT", "Etc/Greenwich", "Etc/GMT0"].map(zoneLabel)).toEqual(Array(7).fill("UTC"));
    // Etc/GMT+5 is five hours behind UTC.
    expect(zoneLabel("Etc/GMT+5")).toBe("UTC-5");
    expect(zoneLabel("Etc/GMT-10")).toBe("UTC+10");
    expect(zoneLabel("Indian/Christmas")).toBe("Christmas Island time");
    expect(zoneLabel("EST5EDT")).toBe("Eastern Time");
    expect(zoneLabel("Pacific/Norfolk")).toBe("Norfolk Island time");
    // Named as of the given day, not 1970: Lisbon's zone has been Western European Time since 1996.
    expect(zoneLabel("WET")).toMatch(/^Western European/);
    expect(zoneGenericName("America/Chicago", new Date("2026-10-09T12:00:00Z"))).toBe("Central Time");
    expect(zoneGenericName("Not/AZone")).toBe("Not/AZone");
  });
  it("writes times on the 12-hour clock in every display locale", () => {
    expect(timeOfDayLabel(14 * 60)).toBe("2:00 PM");
    expect(timeOfDayLabel(0)).toBe("12:00 AM");
    expect(timeOfDayLabel(14 * 60, "en-GB")).toMatch(/^2:00\s?pm$/i);
  });
  it("keeps one clock per account in the shared formatters, whatever the locale (DT-01, TST-02)", () => {
    const at = new Date("2026-10-09T19:05:00Z");
    for (const locale of ["en-US", "en-GB", "en-AU", "en-CA"]) {
      expect(formatTime(at, { locale, timeZone: "UTC" }), locale).toMatch(/^7:05\s?p\.?m\.?$/i);
      expect(formatDateTime(at, { locale, timeZone: "UTC" }), locale).toMatch(/7:05\s?p\.?m\.?$/i);
    }
    expect(formatDateTime(at, { locale: "en-GB", timeZone: "UTC" })).toBe("9 Oct, 7:05 pm");
    expect(formatDateTime(at, { locale: "en-US", timeZone: "UTC" }, { year: "numeric" })).toBe("Oct 9, 2026, 7:05 PM");
  });
  it("writes a confirmed date and time as people read them", () => {
    const now = new Date("2026-10-09T15:00:00Z");
    expect(localDateTimeLabel("2026-10-09", "14:00", "en-US", now)).toBe("Fri, Oct 9 at 2:00 PM");
    expect(localDateTimeLabel("2027-01-04", "09:30", "en-US", now)).toBe("Mon, Jan 4, 2027 at 9:30 AM");
    expect(localDateTimeLabel("2026-10-09", "", "en-US", now)).toBe("Fri, Oct 9");
    expect(localDateTimeLabel("", "14:00", "en-US", now)).toBe("2:00 PM");
    expect(localDateTimeLabel("", "", "en-US", now)).toBe("");
    // The year is the account's: on New Year's Eve in New York, January 1 UTC is still last year there.
    const eve = new Date("2027-01-01T03:00:00Z");
    expect(localDateTimeLabel("2026-12-31", "21:00", "en-US", eve, "America/New_York")).toBe("Thu, Dec 31 at 9:00 PM");
    expect(localDateTimeLabel("2026-12-31", "21:00", "en-US", eve, "UTC")).toBe("Thu, Dec 31, 2026 at 9:00 PM");
  });
  it("uses one name per channel", () => {
    expect(["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"].map(channelName)).toEqual(["Text", "Email", "Call", "Voicemail", "WhatsApp"]);
    // Inside a sentence only the product name keeps its capitals (VOC-02).
    expect(["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"].map(channel => channelWord(channelName(channel)))).toEqual(["text", "email", "call", "voicemail", "WhatsApp"]);
  });
});

describe("status labels (FMT-03)", () => {
  it("names statuses in words people use, never raw codes", async () => {
    const { importStatusLabel, mixStatusLabel, recurrenceLabel, runStatusLabel } = await import("../src/lib/display-labels");
    expect(["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED"].map(mixStatusLabel)).toEqual(["On", "Paused", "Draft", "Archived"]);
    expect(["QUEUED", "RUNNING", "COMPLETED", "PARTIAL", "FAILED", "CANCELED"].map(status => importStatusLabel(status))).toEqual(["Waiting to start", "Importing", "Completed", "Partly imported", "Failed", "Canceled"]);
    // A finished import with failed rows that saved no one isn't "partly" imported (TRU-02).
    expect(importStatusLabel("PARTIAL", 0)).toBe("Not imported");
    expect(importStatusLabel("PARTIAL", 2)).toBe("Partly imported");
    expect(["ACTIVE", "PAUSED", "FINISHED", "STOPPED", "PENDING", "DONE", "SKIPPED", "HELD"].map(status => runStatusLabel(status))).toEqual(["Running", "Paused", "Finished", "Stopped", "Not done yet", "Done", "Skipped", "On hold"]);
    expect(["NONE", "MONTHLY", "YEARLY"].map(recurrence => recurrenceLabel(recurrence))).toEqual(["Doesn’t repeat", "Every month", "Every year"]);
    expect(mixStatusLabel("SOMETHING_NEW")).toBe("Something new");
  });
});
