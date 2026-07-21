import { describe, expect, it } from "vitest";
import { createContactsCsv, neutralizeSpreadsheetFormula } from "@/lib/contact-export";

describe("Contact CSV export", () => {
  it("neutralizes formula-like values after leading whitespace", () => {
    expect(neutralizeSpreadsheetFormula("=HYPERLINK(\"https://example.com\")")).toBe("'=HYPERLINK(\"https://example.com\")");
    expect(neutralizeSpreadsheetFormula("  +1+1")).toBe("'  +1+1");
    expect(neutralizeSpreadsheetFormula("Normal value")).toBe("Normal value");
  });

  it("writes formula-like Contact values as inert CSV text", () => {
    const csv = createContactsCsv([{
      firstName: "=2+2",
      lastName: null,
      company: "@SUM(1,2)",
      publicNotes: "-10+20",
      emails: [],
      phones: [],
      addresses: [],
      groups: [],
      jumpDates: []
    }]);
    expect(csv).toContain("\"'=2+2\"");
    expect(csv).toContain("\"'@SUM(1,2)\"");
    expect(csv).toContain("\"'-10+20\"");
  });
});
