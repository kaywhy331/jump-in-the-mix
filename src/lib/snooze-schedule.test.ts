import { describe, expect, it } from "vitest";
import { calculateSnoozeAt } from "@/lib/snooze-schedule";

describe("calculateSnoozeAt", () => {
  it("uses the workspace local day across daylight-saving changes", () => {
    const scheduledAt = calculateSnoozeAt({
      now: new Date("2026-03-07T15:00:00.000Z"),
      timezone: "America/New_York",
      preset: "tomorrow"
    });

    expect(scheduledAt.toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });

  it("moves a later-today preset beyond quiet hours to the next allowed local time", () => {
    const scheduledAt = calculateSnoozeAt({
      now: new Date("2026-07-22T00:30:00.000Z"),
      timezone: "America/Los_Angeles",
      preset: "later-today",
      quietHoursStart: 20 * 60,
      quietHoursEnd: 8 * 60
    });

    expect(scheduledAt.toISOString()).toBe("2026-07-22T15:00:00.000Z");
  });

  it("calculates next Monday from the workspace logical date", () => {
    const scheduledAt = calculateSnoozeAt({
      now: new Date("2026-07-18T01:00:00.000Z"),
      timezone: "America/Los_Angeles",
      preset: "next-monday"
    });

    expect(scheduledAt.toISOString()).toBe("2026-07-20T17:00:00.000Z");
  });

  it("interprets custom date-time input in the workspace timezone", () => {
    const scheduledAt = calculateSnoozeAt({
      now: new Date("2026-07-21T12:00:00.000Z"),
      timezone: "America/Los_Angeles",
      preset: "custom",
      customDate: "2026-07-21T10:30"
    });

    expect(scheduledAt.toISOString()).toBe("2026-07-21T17:30:00.000Z");
  });

  it("rejects past custom times", () => {
    expect(() => calculateSnoozeAt({
      now: new Date("2026-07-21T18:00:00.000Z"),
      timezone: "America/Los_Angeles",
      preset: "custom",
      customDate: "2026-07-21T10:30"
    })).toThrow("Choose a future date and time.");
  });
});
