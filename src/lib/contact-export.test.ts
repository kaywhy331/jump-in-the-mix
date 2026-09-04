import { describe, expect, it } from "vitest";
import { createContactsCsv, createFollowUpsCsv, createTimelineCsv, neutralizeSpreadsheetFormula } from "@/lib/contact-export";

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

  it("creates spreadsheet-safe timeline and follow-up tables", () => {
    const timeline = createTimelineCsv([{
      contactId: "contact-1",
      occurredAt: new Date("2026-09-04T12:00:00Z"),
      kind: "CUSTOMER_NOTE",
      outcome: null,
      channel: null,
      visibility: "PRIVATE",
      summary: "=unsafe",
      nextCommitmentAt: null
    }], new Map([["contact-1", "Jordan Lee"]]));
    expect(timeline).toContain("Jordan Lee");
    expect(timeline).toContain("\"'=unsafe\"");
    expect(timeline).toContain("Private");

    const followUps = createFollowUpsCsv([{
      scheduledAt: new Date("2026-09-05T12:00:00Z"),
      completedAt: null,
      status: "PENDING",
      reason: "Estimate follow-up",
      contact: { displayName: "Jordan Lee" },
      mix: { name: "Estimate check-in" },
      stepVersion: { stepTemplate: { channel: "SMS" } },
      renderedSnapshot: { body: "Hi Jordan" }
    }]);
    expect(followUps).toContain("Estimate check-in");
    expect(followUps).toContain("Hi Jordan");
  });
});
