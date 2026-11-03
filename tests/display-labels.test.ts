import { afterEach, describe, expect, it, vi } from "vitest";
import { channelName, channelWord, localDateTimeLabel, timeOfDayLabel, zoneGenericName, zoneLabel, zonedDateTimeLabel } from "../src/lib/display-labels";
import { formatDateTime, formatTime } from "../src/lib/format";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Pin the product's names independently of the installed ICU alias table.
const namedZones = [
  ["America/New_York", "Eastern Time", ["EST5EDT", "US/Eastern"]],
  ["America/Chicago", "Central Time", ["CST6CDT", "US/Central"]],
  ["America/Denver", "Mountain Time", ["MST7MDT", "US/Mountain"]],
  ["America/Los_Angeles", "Pacific Time", ["PST8PDT", "US/Pacific", "US/Pacific-New"]],
  ["America/Anchorage", "Alaska Time", ["US/Alaska"]],
  ["America/Adak", "Hawaii-Aleutian Time", ["US/Aleutian"]],
  ["Pacific/Honolulu", "Hawaii-Aleutian Standard Time", ["US/Hawaii"]],
  ["America/Phoenix", "Mountain Standard Time", ["US/Arizona"]],
  ["America/Indiana/Indianapolis", "Eastern Time", ["US/East-Indiana", "America/Indianapolis"]],
  ["America/Indiana/Knox", "Central Time", ["US/Indiana-Starke"]],
  ["America/Detroit", "Eastern Time", ["US/Michigan"]],
  ["Pacific/Pago_Pago", "American Samoa Standard Time", ["US/Samoa"]],
  ["America/Kentucky/Louisville", "Eastern Time", ["America/Louisville"]],
  ["Europe/Lisbon", "Western European Time", ["WET"]],
  ["Europe/Brussels", "Central European Time", ["CET", "MET"]],
  ["Europe/Athens", "Eastern European Time", ["EET"]],
  ["Europe/London", "United Kingdom Time", ["GB", "GB-Eire"]],
  ["Europe/Dublin", "Ireland Time", ["Eire"]],
  ["Europe/Kyiv", "Eastern European Time", ["Europe/Kiev"]],
  ["Asia/Kolkata", "India Standard Time", ["Asia/Calcutta"]],
  ["Asia/Kathmandu", "Nepal Time", ["Asia/Katmandu"]],
  ["Asia/Tokyo", "Japan Standard Time", ["Japan"]],
  ["Pacific/Auckland", "New Zealand Time", ["NZ"]],
  ["Pacific/Chatham", "Chatham Time", ["NZ-CHAT"]],
  ["Australia/Sydney", "Australian Eastern Time", []]
] as const;

describe("time-zone names across ICU versions", () => {
  it.each(namedZones)("names %s and its legacy links in winter and summer", (canonical, name, aliases) => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T12:00:00Z"));
    for (const at of [new Date("2026-01-15T12:00:00Z"), new Date("2026-07-15T12:00:00Z")]) {
      for (const zone of [canonical, ...aliases]) {
        expect(zoneGenericName(zone, at), `${zone} at ${at.toISOString()}`).toBe(name);
      }
    }
    for (const alias of aliases) {
      expect(zoneLabel(alias), alias).toBe(alias.includes("/") ? zoneLabel(canonical) : name);
    }
  });

  it.each(["GMT-05:00", "GMT+05:30", "GMT-5", "GMT"])("uses the canonical product name when Intl returns %s", offset => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([{ type: "timeZoneName", value: offset }]);
    for (const [canonical, name, aliases] of namedZones) {
      for (const zone of [canonical, ...aliases]) {
        expect(zoneGenericName(zone), zone).toBe(name);
      }
    }
    expect(zoneLabel("EST5EDT")).toBe("Eastern Time");
    expect(zoneLabel("US/Eastern")).toBe("New York time");
    // An unnamed zone or a real fixed offset must not be mislabeled as a named region.
    expect(zoneGenericName("Etc/GMT+5")).toBe(offset);
    expect(zoneGenericName("Africa/Abidjan")).toBe(offset);
  });

  it("retains informative runtime names for zones outside the product's named set", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([{ type: "timeZoneName", value: "Central European Time" }]);
    expect(zoneGenericName("Europe/Paris")).toBe("Central European Time");
  });

  it("keeps product names stable when ICU adds a regional qualifier", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([{ type: "timeZoneName", value: "Hawaii-Aleutian Time (Adak)" }]);
    expect(zoneGenericName("America/Adak")).toBe("Hawaii-Aleutian Time");
    expect(zoneGenericName("US/Aleutian")).toBe("Hawaii-Aleutian Time");
  });

  it("keeps known names when runtime name data is missing or unsupported", () => {
    const parts = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([]);
    expect(zoneGenericName("EST5EDT")).toBe("Eastern Time");
    expect(zoneGenericName("Africa/Abidjan")).toBe("Africa/Abidjan");
    parts.mockImplementation(() => { throw new RangeError("Unsupported time zone data"); });
    expect(zoneGenericName("US/Central")).toBe("Central Time");
    expect(zoneGenericName("Not/AZone")).toBe("Not/AZone");
  });
});

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
    // An instant reads the same way in its zone, as a Mix's planned start does under Starts and in its Beats.
    expect(zonedDateTimeLabel(new Date("2026-10-15T18:00:00Z"), "America/New_York", "en-US", now)).toBe("Thu, Oct 15 at 2:00 PM");
    expect(zonedDateTimeLabel(new Date("2027-01-01T03:00:00Z"), "America/New_York", "en-US", eve)).toBe("Thu, Dec 31 at 10:00 PM");
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
