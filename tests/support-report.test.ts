import { describe, expect, it } from "vitest";
import { formatSupportReport, supportReportBodyForSubmission, redactSupportReportText, supportBrowserFamily, supportDiagnosticsSummary } from "../src/lib/support-report";

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

describe("support report saved-text contract", () => {
  it.each(["line one\nline two", "line one\r\nline two", "line one\rline two"])("matches actual multipart encoding for line endings: %j", async raw => {
    const data = new FormData();
    data.set("body", raw);
    // Construct and decode locally. Request never performs network I/O.
    const request = new Request("http://127.0.0.1/never-sent", { method: "POST", body: data });
    const submitted = await new Response(await request.arrayBuffer(), { headers: { "content-type": request.headers.get("content-type")! } }).formData();
    expect(supportReportBodyForSubmission(raw)).toBe(submitted.get("body"));
    expect(supportReportBodyForSubmission(raw)).toBe("line one\r\nline two");
    expect(supportReportBodyForSubmission(supportReportBodyForSubmission(raw))).toBe("line one\r\nline two");
  });

  it("redacts a complete credential-bearing link inside the raw body cap", () => {
    const raw = "x".repeat(4920) + " https://example.test/private?token=synthetic-private-value";
    expect(raw.length).toBeLessThan(5000);
    const saved = formatSupportReport({ title: "Synthetic report", body: raw });
    expect(saved.body).toBe("x".repeat(4920) + " [link removed]");
    expect(saved.body).not.toMatch(/https:|example\.test|token=|synthetic-private-value/);
  });
  const plain = { title: "Could not save", body: "The save button did not respond." };
  const attachment = "\n\nIncluded context: Contacts; phone layout; Safari; dark theme; online";

  it("previews the bounded persisted body when redaction expands text below the input limit", () => {
    const raw = "a@b.co ".repeat(650) + "TAIL";
    const saved = formatSupportReport({ ...plain, body: raw });
    expect(raw.length).toBe(4554);
    expect(redactSupportReportText(raw)).toHaveLength(10404);
    expect(saved.body).toBe(("[email removed] ".repeat(650) + "TAIL").slice(0, 5000));
    expect(saved.body).toHaveLength(5000);
    expect(saved.body).not.toContain("TAIL");
    expect(saved.bodyShortened).toBe(true);
  });

  it("keeps exact title/body bounds and flags only actual shortening", () => {
    for (const length of [159, 160, 161]) {
      const saved = formatSupportReport({ ...plain, title: "x".repeat(length) });
      expect(saved.title).toBe("x".repeat(Math.min(length, 160)));
      expect(saved.titleShortened).toBe(length > 160);
    }
    for (const length of [4999, 5000, 5001]) {
      const saved = formatSupportReport({ ...plain, body: "x".repeat(length) });
      expect(saved.body).toBe("x".repeat(Math.min(length, 5000)));
      expect(saved.bodyShortened).toBe(length > 5000);
    }
    const expanded = formatSupportReport({ ...plain, title: "a@b.co ".repeat(20) + "TAIL" });
    expect(expanded.title).toBe(("[email removed] ".repeat(20) + "TAIL").slice(0, 160));
    expect(expanded.titleShortened).toBe(true);
  });

  it("trims before the raw cap and redacts after that cap without recovering discarded text", () => {
    const saved = formatSupportReport({ title: "  " + "x".repeat(159) + "Zdiscarded  ", body: "  " + "x".repeat(4999) + "Zdiscarded  " });
    expect(saved.title).toBe("x".repeat(159) + "Z");
    expect(saved.body).toBe("x".repeat(4999) + "Z");
    const link = "https://example.test/" + "private".repeat(750);
    const capped = formatSupportReport({ ...plain, body: link + " DO NOT RECOVER THIS TAIL" });
    expect(capped.body).toBe("[link removed]");
    expect(capped.bodyShortened).toBe(true);
    expect(formatSupportReport({ ...plain, body: "  Description kept.  " }).body).toBe("Description kept.");
  });

  it("reserves diagnostics inside 5000 and restores report room when opted out", () => {
    const raw = "x".repeat(5000);
    const optedIn = formatSupportReport({ ...plain, body: raw, diagnostics: JSON.stringify(diagnostics) });
    expect(optedIn.body).toBe("x".repeat(5000 - attachment.length) + attachment);
    expect(optedIn.body).toHaveLength(5000);
    expect(optedIn.bodyShortened).toBe(true);
    const exactFit = formatSupportReport({ ...plain, body: "x".repeat(5000 - attachment.length), diagnostics: JSON.stringify(diagnostics) });
    expect(exactFit.bodyShortened).toBe(false);
    const optedOut = formatSupportReport({ ...plain, body: raw, diagnostics: "" });
    expect(optedOut.body).toBe(raw);
    expect(optedOut.bodyShortened).toBe(false);
    const changedSection = formatSupportReport({ ...plain, body: raw, diagnostics: JSON.stringify({ ...diagnostics, section: "Help" }) });
    expect(changedSection.body).toHaveLength(5000);
    expect(changedSection.body).toContain("Included context: Help;");
    expect(changedSection.body).not.toContain("Contacts;");
  });

  it("keeps diagnostics allowlisted and the existing legacy fallback precedence", () => {
    const safe = formatSupportReport({ ...plain, diagnostics: JSON.stringify({ ...diagnostics, cookie: "private-value", url: "https://private.example.test" }), context: "Today; phone layout" });
    expect(safe.body).toBe(plain.body + attachment);
    expect(safe.body).not.toMatch(/private-value|private.example/);
    for (const bad of ["broken", "[]", JSON.stringify({ ...diagnostics, section: "private" }), "x".repeat(513)]) {
      expect(formatSupportReport({ ...plain, diagnostics: bad }).body).toBe(plain.body);
      expect(formatSupportReport({ ...plain, diagnostics: bad, context: " Today; phone layout " }).body).toBe(plain.body + "\n\nIncluded context: Today; phone layout");
    }
    expect(formatSupportReport({ ...plain, context: "Today; phone layout; secret" }).body).toBe(plain.body);
  });

  it("retains privacy redaction at the raw cap and never includes out-of-bound secrets", () => {
    const nearLimit = formatSupportReport({ ...plain, body: "x".repeat(4970) + " password=synthetic-private-value https://example.test/private" });
    expect(nearLimit.body).not.toMatch(/password=|synthetic|https:\/\/|example\.test/);
    expect(nearLimit.body).toContain("[credential removed]");
    expect(nearLimit.body.length).toBeLessThanOrEqual(5000);
    const beforeLimit = formatSupportReport({ title: "Contact a@b.co", body: "Contact a@b.co; +1 (202) 555-0147; Bearer synthetic-private-value" });
    expect(beforeLimit.title + beforeLimit.body).not.toMatch(/a@b|555|synthetic-private/);
    expect(beforeLimit.body).toContain("[email removed]");
    expect(beforeLimit.body).toContain("[number removed]");
    expect(beforeLimit.body).toContain("[credential removed]");
  });
});
