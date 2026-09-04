import { describe, expect, it } from "vitest";
import { formatDateTime } from "../src/lib/format";

describe("timezone-aware display formatting", () => {
  const instant = new Date("2026-09-04T15:00:00.000Z");

  it("renders the same instant in the user's Chicago timezone", () => {
    expect(formatDateTime(instant, { locale: "en-US", timeZone: "America/Chicago" })).toContain("10:00 AM");
  });

  it("renders the same instant in the user's Tokyo timezone", () => {
    expect(formatDateTime(instant, { locale: "en-US", timeZone: "Asia/Tokyo" })).toContain("12:00 AM");
  });
});
