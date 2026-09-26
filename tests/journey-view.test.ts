import { describe, expect, it } from "vitest";
import { journeyDates, journeyDueBucket, journeyDueFilter } from "@/lib/journey-view";

describe("Journey timing uses the owner's calendar day", () => {
  it("classifies midnight boundaries without counting a person in two groups", () => {
    const dates = journeyDates(new Date("2026-09-19T20:00:00Z"), "America/Los_Angeles");
    expect(dates.start.toISOString()).toBe("2026-09-19T07:00:00.000Z");
    expect(journeyDueBucket(new Date(dates.start.getTime()-1), dates)).toBe("late");
    expect(journeyDueBucket(dates.start, dates)).toBe("today");
    expect(journeyDueBucket(dates.tomorrow, dates)).toBe("tomorrow");
    expect(journeyDueBucket(dates.dayAfterTomorrow, dates)).toBe("next-week");
    expect(journeyDueBucket(dates.week, dates)).toBe("next-week");
    expect(journeyDueBucket(dates.nextWeekEnd, dates)).toBe("later");
    expect(journeyDueBucket(null, dates)).toBe("quiet");
  });
  it("follows daylight-saving changes instead of adding 24-hour days", () => {
    const dates = journeyDates(new Date("2026-03-08T12:00:00Z"), "America/Los_Angeles");
    expect(dates.tomorrow.getTime()-dates.start.getTime()).toBe(23*3_600_000);
    expect(dates.week.toISOString()).toBe("2026-03-15T07:00:00.000Z");
  });
  it("keeps Tomorrow exclusive when it crosses into the next calendar week", () => {
    const dates = journeyDates(new Date("2026-09-20T12:00:00Z"), "UTC");
    expect(journeyDueBucket(new Date("2026-09-21T12:00:00Z"), dates)).toBe("tomorrow");
    expect(journeyDueBucket(new Date("2026-09-22T00:00:00Z"), dates)).toBe("next-week");
    expect(journeyDueBucket(new Date("2026-09-28T00:00:00Z"), dates)).toBe("later");
  });
  it("uses full Monday-start weeks after the Today and Tomorrow groups", () => {
    const dates = journeyDates(new Date("2026-09-14T12:00:00Z"), "UTC");
    expect(journeyDueBucket(new Date("2026-09-16T00:00:00Z"), dates)).toBe("week");
    expect(journeyDueBucket(new Date("2026-09-21T00:00:00Z"), dates)).toBe("next-week");
    expect(journeyDueBucket(new Date("2026-09-28T00:00:00Z"), dates)).toBe("later");
  });
  it("falls back to everyone for unknown URL filters", () => {
    expect(journeyDueFilter("not-a-filter")).toBe("all");
    expect(journeyDueFilter("quiet")).toBe("quiet");
  });
});
