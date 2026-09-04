import { describe, expect, it } from "vitest";
import {
  digestIsDue,
  isQuietTime,
  notificationClock,
  weeklyReportIsDue
} from "../src/lib/notification-delivery";

describe("scheduled notifications", () => {
  it("uses the owner's timezone for the local delivery clock", () => {
    const instant = new Date("2026-09-07T14:05:00.000Z");
    expect(notificationClock(instant, "America/Los_Angeles")).toEqual({
      date: "2026-09-07",
      hour: 7,
      minute: 5,
      weekday: "Mon"
    });
    expect(notificationClock(instant, "Asia/Tokyo")).toMatchObject({ date: "2026-09-07", hour: 23, minute: 5 });
  });

  it("delivers a missed digest later the same local day and reports only on Monday", () => {
    const monday = { date: "2026-09-07", hour: 8, minute: 15, weekday: "Mon" };
    expect(digestIsDue(monday, 7)).toBe(true);
    expect(weeklyReportIsDue(monday, 7)).toBe(true);
    expect(weeklyReportIsDue({ ...monday, weekday: "Tue" }, 7)).toBe(false);
    expect(digestIsDue({ ...monday, hour: 6 }, 7)).toBe(false);
  });

  it("honors quiet hours that cross midnight", () => {
    expect(isQuietTime(21 * 60, 20 * 60, 8 * 60)).toBe(true);
    expect(isQuietTime(7 * 60, 20 * 60, 8 * 60)).toBe(true);
    expect(isQuietTime(12 * 60, 20 * 60, 8 * 60)).toBe(false);
  });
});
