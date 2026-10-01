import { describe, expect, it } from "vitest";
import { redactSupportReportText, supportBrowserFamily, supportDiagnosticsSummary } from "../src/lib/support-report";

const diagnostics = { section: "Contacts", layout: "phone", browser: "Safari", theme: "dark", connection: "online" };
describe("safe support diagnostics", () => {
  it("keeps only coarse fields, never arbitrary payload fields", () => {
    expect(supportDiagnosticsSummary(JSON.stringify({ ...diagnostics, url: "https://example.test?token=private", cookie: "private", contactId: "private" })))
      .toBe("Contacts; phone layout; Safari; dark theme; online");
  });
  it("rejects malformed, oversized and non-allowlisted fields", () => {
    for (const raw of ["", "broken", "null", "[]", JSON.stringify({ ...diagnostics, section: "Contacts/private" }), JSON.stringify({ ...diagnostics, browser: "Safari token=private" }), JSON.stringify({ section: "Today" }), " ".repeat(513)]) {
      expect(supportDiagnosticsSummary(raw)).toBe("");
    }
  });
  it.each([["Mozilla Chrome/100 Safari/500 Edg/100", "Edge"], ["FxiOS/100", "Firefox"], ["CriOS/100 Safari/500", "Chrome"], ["Version/1 Safari/500", "Safari"], ["Private custom client", "Other"]])("buckets %s without retaining a raw agent", (agent, family) => {
    expect(supportBrowserFamily(agent)).toBe(family);
  });
});

describe("support report redaction", () => {
  it("removes common contact details and credential-bearing URLs", () => {
    const text = "Email person@example.test, call +1 (202) 555-0147, open https://example.test/reset?token=private or postgresql://user:password@host/database";
    const result = redactSupportReportText(text);
    expect(result).not.toMatch(/person@|555|https:|postgresql:|token=|password@/);
    expect(result).toContain("[email removed]");
    expect(result).toContain("[number removed]");
  });
  it("removes common credentials and complete or incomplete private keys", () => {
    const syntheticProviderValue = ["sk", "live", "secretvalue"].join("_");
    for (const value of ['password="my private value"', "api_key=secretvalue", "Bearer secretvalue", "Authorization: Bearer secretvalue", "Cookie: session=secretvalue", syntheticProviderValue, "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.signature", "-----BEGIN PRIVATE KEY-----\nsecretvalue\n-----END PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\nsecretvalue"]) {
      expect(redactSupportReportText(value)).not.toMatch(/secretvalue|my private|eyJ/);
    }
    expect(redactSupportReportText(syntheticProviderValue)).toBe("[credential removed]");
  });
  it("preserves useful descriptions and is idempotent", () => {
    const description = "After Save, Today stayed empty. Expected one follow-up. {{contact.custom.policy_number}}";
    expect(redactSupportReportText(description)).toBe(description);
    const safe = redactSupportReportText("Try person@example.test and https://example.test/private");
    expect(redactSupportReportText(safe)).toBe(safe);
  });
});
