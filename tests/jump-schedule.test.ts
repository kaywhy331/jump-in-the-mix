import { describe, expect, it } from "vitest";
import {
  createJumpUniquenessKey,
  getJumpDateOccurrences,
  logicalDateKey,
  scheduledLocalDateTimeKey,
  zonedDateTimeToUtc
} from "../src/lib/jump-schedule";

describe("Jump scheduling", () => {
  it("moves February 29 yearly occurrences to February 28 in non-leap years", () => {
    const occurrences = getJumpDateOccurrences(
      { recurrence: "YEARLY", dateValue: null, month: 2, day: 29 },
      new Date("2025-01-01T00:00:00.000Z"),
      new Date("2025-12-31T23:59:59.999Z")
    );

    expect(occurrences.map(logicalDateKey)).toEqual(["2025-02-28"]);
  });

  it("moves monthly dates on the 31st to the final valid day", () => {
    const occurrences = getJumpDateOccurrences(
      { recurrence: "MONTHLY", dateValue: null, month: null, day: 31 },
      new Date("2026-02-01T00:00:00.000Z"),
      new Date("2026-04-30T23:59:59.999Z")
    );

    expect(occurrences.map(logicalDateKey)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("converts local send time through the named timezone", () => {
    expect(zonedDateTimeToUtc({ year: 2026, month: 1, day: 15 }, 10 * 60, "America/Los_Angeles").toISOString())
      .toBe("2026-01-15T18:00:00.000Z");
    expect(zonedDateTimeToUtc({ year: 2026, month: 7, day: 15 }, 10 * 60, "America/Los_Angeles").toISOString())
      .toBe("2026-07-15T17:00:00.000Z");
  });

  it("creates stable keys and separates different scheduled occurrences", () => {
    const base = {
      workspaceId: "workspace",
      contactId: "contact",
      mixId: "mix",
      mixStepId: "mix-step",
      occurrenceKey: "jump-date:2026-07-15",
      timezone: "America/Los_Angeles"
    };
    const first = createJumpUniquenessKey({ ...base, scheduledLocalDateTime: scheduledLocalDateTimeKey({ year: 2026, month: 7, day: 15 }, 600) });
    const repeated = createJumpUniquenessKey({ ...base, scheduledLocalDateTime: scheduledLocalDateTimeKey({ year: 2026, month: 7, day: 15 }, 600) });
    const later = createJumpUniquenessKey({ ...base, scheduledLocalDateTime: scheduledLocalDateTimeKey({ year: 2026, month: 7, day: 16 }, 600) });

    expect(first).toBe(repeated);
    expect(first).not.toBe(later);
  });
});
