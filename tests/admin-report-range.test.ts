import { describe, expect, it } from "vitest";
import { configuredReportExclusions, parseReportRange, reportRatio } from "../src/lib/admin-report-range";

const now = new Date("2024-03-01T01:30:00Z");
describe("bounded UTC report ranges", () => {
  it("includes today and leap day with an exclusive next-midnight end", () => {
    const range = parseReportRange({ days: "7" }, now);
    expect(range.fromDay).toBe("2024-02-24"); expect(range.throughDay).toBe("2024-03-01");
    expect(range.until.toISOString()).toBe("2024-03-02T00:00:00.000Z"); expect(range.days).toBe(7);
    expect(parseReportRange({ from: "2024-02-29", through: "2024-02-29" }, now).days).toBe(1);
    expect(parseReportRange({ from: "2023-03-02", through: "2024-03-01" }, now).days).toBe(366);
  });
  it.each([
    { from: "2023-02-29", through: "2023-03-01" }, { from: "0000-01-01", through: "0000-01-01" },
    { from: "2024-03-01", through: "2024-02-29" }, { from: "2023-03-01", through: "2024-03-01" },
    { from: "2024-03-01", through: "2024-03-02" }, { from: ["2024-02-01"], through: "2024-03-01" },
    { from: "2024-02-01" }, { days: ["7"] }, { days: "7e0" }, { days: true }, { days: "" }, { days: 366 }
  ])("rejects invalid or ambiguous input %j", input => { expect(() => parseReportRange(input, now)).toThrow(); });
  it("does not invent a retention rate for an empty denominator", () => {
    expect(reportRatio(0, 0)).toBe("—"); expect(reportRatio(0, 3)).toBe("0%"); expect(reportRatio(1, 3)).toBe("33.3%");
  });
  it("deduplicates exclusions and rejects invalid config instead of silently including test accounts", () => {
    expect(configuredReportExclusions(" Foo@Example.test,foo@example.test, ", "emails")).toEqual(["foo@example.test"]);
    expect(configuredReportExclusions(" Test_ID,Test_ID ", "ids")).toEqual(["Test_ID"]);
    expect(() => configuredReportExclusions("invalid", "emails")).toThrow("exclusions are invalid");
    expect(() => configuredReportExclusions("contains\nnewline", "ids")).toThrow();
    expect(() => configuredReportExclusions(Array.from({ length: 101 }, (_, i) => `id${i}`).join(","), "ids")).toThrow();
  });
});
