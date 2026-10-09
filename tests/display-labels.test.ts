import { describe, expect, it } from "vitest";
import { channelName, localDateTimeLabel, timeOfDayLabel, zoneLabel } from "../src/lib/display-labels";

describe("display labels (FMT-01–FMT-03, D79)", () => {
  it("names a time zone by its city, never by its IANA name", () => {
    expect(zoneLabel("America/New_York")).toBe("New York time");
    expect(zoneLabel("America/Los_Angeles")).toBe("Los Angeles time");
    expect(zoneLabel("America/Indiana/Indianapolis")).toBe("Indianapolis time");
    expect(zoneLabel("UTC")).toBe("UTC");
    expect(zoneLabel("")).toBe("UTC");
  });
  it("writes times on the 12-hour clock in every display locale", () => {
    expect(timeOfDayLabel(14 * 60)).toBe("2:00 PM");
    expect(timeOfDayLabel(0)).toBe("12:00 AM");
    expect(timeOfDayLabel(14 * 60, "en-GB")).toMatch(/^2:00\s?pm$/i);
  });
  it("writes a confirmed date and time as people read them", () => {
    const now = new Date("2026-10-09T15:00:00Z");
    expect(localDateTimeLabel("2026-10-09", "14:00", "en-US", now)).toBe("Fri, Oct 9 at 2:00 PM");
    expect(localDateTimeLabel("2027-01-04", "09:30", "en-US", now)).toBe("Mon, Jan 4, 2027 at 9:30 AM");
    expect(localDateTimeLabel("2026-10-09", "", "en-US", now)).toBe("Fri, Oct 9");
    expect(localDateTimeLabel("", "14:00", "en-US", now)).toBe("2:00 PM");
    expect(localDateTimeLabel("", "", "en-US", now)).toBe("");
  });
  it("uses one name per channel", () => {
    expect(["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"].map(channelName)).toEqual(["Text", "Email", "Call", "Voicemail", "WhatsApp"]);
  });
});
