import { describe, expect, it } from "vitest";
import { minutesInTimezone, plannedStepApplies } from "../src/lib/planned-step";

describe("planned beats", () => {
  const planned = new Date("2026-09-25T14:00:00Z");
  it("reach a contact whose previous beat came due on or before the planned instant", () => {
    expect(plannedStepApplies(new Date("2026-09-20T09:00:00Z"), planned)).toBe(true);
    expect(plannedStepApplies(new Date("2026-09-25T14:00:00Z"), planned)).toBe(true);
  });
  it("wait for a contact who has not reached the beat before it yet", () => {
    expect(plannedStepApplies(new Date("2026-10-02T09:00:00Z"), planned)).toBe(false);
  });
  it("apply to the first beat of a mix unconditionally", () => {
    expect(plannedStepApplies(null, planned)).toBe(true);
  });
  it("read the planned wall-clock time in the workspace timezone", () => {
    expect(minutesInTimezone(planned, "UTC")).toBe(14 * 60);
    expect(minutesInTimezone(planned, "America/New_York")).toBe(10 * 60);
    expect(minutesInTimezone(new Date("2026-09-25T00:30:00Z"), "Asia/Tokyo")).toBe(9 * 60 + 30);
  });
});
