import { describe, expect, it } from "vitest";
import { journeyDates, journeyDueBucket, journeyDueFilter } from "@/lib/journey-view";

describe("Journey timing uses the owner's calendar day", () => {
  it("classifies midnight boundaries without counting a person in two groups", () => {
    const dates = journeyDates(new Date("2026-09-19T20:00:00Z"), "America/Los_Angeles");
    expect(dates.start.toISOString()).toBe("2026-09-19T07:00:00.000Z");
    expect(journeyDueBucket(new Date(dates.start.getTime()-1), dates)).toBe("late");
    expect(journeyDueBucket(dates.start, dates)).toBe("today");
    expect(journeyDueBucket(dates.tomorrow, dates)).toBe("week");
    expect(journeyDueBucket(dates.week, dates)).toBe("later");
    expect(journeyDueBucket(null, dates)).toBe("quiet");
  });
  it("follows daylight-saving changes instead of adding 24-hour days", () => {
    const dates = journeyDates(new Date("2026-03-08T12:00:00Z"), "America/Los_Angeles");
    expect(dates.tomorrow.getTime()-dates.start.getTime()).toBe(23*3_600_000);
    expect(dates.week.toISOString()).toBe("2026-03-15T07:00:00.000Z");
  });
  it("falls back to everyone for unknown URL filters", () => {
    expect(journeyDueFilter("not-a-filter")).toBe("all");
    expect(journeyDueFilter("quiet")).toBe("quiet");
  });
});
