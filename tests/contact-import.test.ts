import { describe, expect, it } from "vitest";
import {
  buildImportRows,
  createImportErrorCsv,
  createSampleImportCsv,
  decodeMappingTarget,
  guessImportMappings,
  parseContactFile,
  parseCsvText,
  parseImportDate,
  parseVcfText,
  summarizeImportResults,
  textSimilarity
} from "../src/lib/contact-import";

const dateTypes = [
  { id: "birthday", name: "Birthday", slug: "birthday", isSystem: true, isActive: true },
  { id: "anniversary", name: "Anniversary", slug: "anniversary", isSystem: true, isActive: true }
];

const customFields = [{ id: "policy", name: "Policy Number", key: "policy_number" }];

describe("Contact file parsing and mapping", () => {
  it("parses quoted CSV values, embedded newlines, and repeated methods", () => {
    const parsed = parseCsvText([
      "First Name,Last Name,Email,Phone,Public Notes,Birthday",
      'Jordan,Lee,jordan@example.com,+1 626 555 0199,"Met at the event, then followed up\nby email",1988-05-12'
    ].join("\n"), "contacts.csv");

    expect(parsed.headers).toEqual(["First Name", "Last Name", "Email", "Phone", "Public Notes", "Birthday"]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]["Public Notes"]).toContain("followed up\nby email");

    const mapping = guessImportMappings(parsed.headers, dateTypes, customFields);
    expect(decodeMappingTarget(mapping.Birthday)).toEqual({
      kind: "DATE",
      dateTypeId: "birthday",
      dateTypeName: null,
      recurrence: "YEARLY"
    });

    const [row] = buildImportRows(parsed, mapping, ["vip"]);
    expect(row.errors).toEqual([]);
    expect(row.record).toMatchObject({ firstName: "Jordan", lastName: "Lee", displayName: "Jordan Lee", groupIds: ["vip"] });
    expect(row.record.emails[0]).toEqual({ value: "jordan@example.com", label: null, isPrimary: true });
    expect(row.record.phones[0]?.isPrimary).toBe(true);
    expect(row.record.jumpDates[0]).toMatchObject({ dateTypeId: "birthday", dateValue: "1988-05-12", month: 5, day: 12, recurrence: "YEARLY" });
  });

  it("detects tab-separated Contact exports", () => {
    const parsed = parseContactFile("Name\tCompany\tEmail\nAvery Stone\tStone Co\tavery@example.com", "contacts.csv");
    expect(parsed.rows[0]).toEqual({ Name: "Avery Stone", Company: "Stone Co", Email: "avery@example.com" });
  });

  it("parses common VCF 3/4 fields, multiple values, labels, and recurring dates", () => {
    const parsed = parseVcfText([
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Alex Rivera",
      "N:Rivera;Alex;;;",
      "ORG:Rivera Advisory",
      "EMAIL;TYPE=work:alex@example.com",
      "EMAIL;TYPE=home:alex.personal@example.com",
      "TEL;TYPE=cell:+1-626-555-0100",
      "ADR;TYPE=work:;;100 Main St;Pasadena;CA;91101;US",
      "BDAY:--0419",
      "NOTE:Prefers email",
      "END:VCARD"
    ].join("\r\n"), "alex.vcf");

    expect(parsed.source).toBe("VCF");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]["Email 2"]).toBe("alex.personal@example.com");
    expect(parsed.rows[0]["Email 1 Label"]).toBe("work");
    expect(parsed.rows[0]["Phone 1"]).toBe("+1-626-555-0100");
    expect(parsed.rows[0].Birthday).toBe("--0419");

    const mapping = guessImportMappings(parsed.headers, dateTypes, customFields);
    const [row] = buildImportRows(parsed, mapping);
    expect(row.errors).toEqual([]);
    expect(row.record.emails).toHaveLength(2);
    expect(row.record.addresses[0]?.street1).toContain("100 Main St");
    expect(row.record.jumpDates[0]).toMatchObject({ dateTypeId: "birthday", dateValue: null, month: 4, day: 19, recurrence: "YEARLY" });
  });

  it("maps workspace custom fields and proposes a new type for an unfamiliar date column", () => {
    const parsed = parseCsvText("Name,Policy Number,Home Warranty Date\nTaylor Kim,P-193,2026-08-20");
    const mapping = guessImportMappings(parsed.headers, dateTypes, customFields);
    expect(mapping["Policy Number"]).toBe("custom:policy");
    expect(decodeMappingTarget(mapping["Home Warranty Date"])).toEqual({
      kind: "DATE",
      dateTypeId: null,
      dateTypeName: "Home Warranty",
      recurrence: "NONE"
    });

    const [row] = buildImportRows(parsed, mapping);
    expect(row.record.customFields).toEqual([{ definitionId: "policy", value: "P-193" }]);
    expect(row.record.jumpDates[0]).toMatchObject({ dateTypeName: "Home Warranty", dateValue: "2026-08-20" });
  });
});

describe("Contact import validation helpers", () => {
  it("normalizes supported date formats without shifting logical dates", () => {
    expect(parseImportDate("20260512")).toEqual({ dateValue: "2026-05-12", month: 5, day: 12 });
    expect(parseImportDate("05/12/26")).toEqual({ dateValue: "2026-05-12", month: 5, day: 12 });
    expect(parseImportDate("--02-29")).toEqual({ dateValue: null, month: 2, day: 29 });
    expect(parseImportDate("2026-02-31")).toBeNull();
  });

  it("reports invalid rows while preserving valid rows for import", () => {
    const parsed = parseCsvText("Name,Email,Phone\nValid Person,valid@example.com,+16265550199\nBad Person,not-an-email,123");
    const rows = buildImportRows(parsed, guessImportMappings(parsed.headers, dateTypes, customFields));
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toEqual(expect.arrayContaining(["Invalid email address: not-an-email", "Invalid phone number: 123"]));
  });

  it("creates summaries and a downloadable error CSV", () => {
    const summary = summarizeImportResults([
      { rowId: "1", sourceRow: 2, status: "CREATED", contactId: "contact", message: "Created" },
      { rowId: "2", sourceRow: 3, status: "FAILED", contactId: null, message: 'Invalid "email"' }
    ]);
    expect(summary).toMatchObject({ created: 1, failed: 1, merged: 0, replaced: 0, skipped: 0 });
    expect(createImportErrorCsv(summary.results)).toContain('3,2,"Invalid ""email"""');
    expect(createSampleImportCsv()).toContain("Birthday");
  });

  it("uses conservative similarity scoring for fuzzy duplicate review", () => {
    expect(textSimilarity("Jaro Winkler", "Jaro Winkler")).toBe(1);
    expect(textSimilarity("Jaro Winkler", "Jaro Winkle")).toBeGreaterThan(0.9);
    expect(textSimilarity("Jaro Winkler", "Completely Different")).toBeLessThan(0.3);
  });
});
