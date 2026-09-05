import { describe, expect, it } from "vitest";
import {
  formatDateInput,
  formatTimeInput,
  isValidTimezone,
  parseBroadcastScheduleInput,
  parseTimeInput
} from "../src/lib/mix-broadcast";

describe("fixed-date broadcast schedules", () => {
  it("parses a logical date, local time, and IANA timezone", () => {
    const schedule = parseBroadcastScheduleInput("2026-12-31", "17:45", "America/Los_Angeles");
    expect(schedule.dateInput).toBe("2026-12-31");
    expect(schedule.localDate.toISOString()).toBe("2026-12-31T12:00:00.000Z");
    expect(schedule.timeMinutes).toBe(17 * 60 + 45);
    expect(schedule.timeInput).toBe("17:45");
    expect(schedule.timezone).toBe("America/Los_Angeles");
  });

  it("rejects normalized or impossible dates instead of silently shifting them", () => {
    expect(() => parseBroadcastScheduleInput("2026-02-30", "10:00", "UTC")).toThrow("valid plan start date");
    expect(() => parseBroadcastScheduleInput("12/31/2026", "10:00", "UTC")).toThrow("valid plan start date");
  });

  it("validates times and timezones", () => {
    expect(parseTimeInput("00:00")).toBe(0);
    expect(parseTimeInput("23:59")).toBe(1439);
    expect(parseTimeInput("24:00")).toBeNull();
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Not/A_Timezone")).toBe(false);
    expect(() => parseBroadcastScheduleInput("2026-12-31", "24:00", "UTC")).toThrow("valid plan start time");
    expect(() => parseBroadcastScheduleInput("2026-12-31", "10:00", "Not/A_Timezone")).toThrow("valid plan timezone");
  });

  it("formats persisted schedules for date and time inputs", () => {
    expect(formatDateInput(new Date("2026-07-16T12:00:00.000Z"))).toBe("2026-07-16");
    expect(formatDateInput(null)).toBe("");
    expect(formatTimeInput(9 * 60 + 5)).toBe("09:05");
    expect(formatTimeInput(null)).toBe("10:00");
  });
});
