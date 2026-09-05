import { describe, expect, it } from "vitest";
import { createContactsCsv } from "../src/lib/contact-export";

describe("Contact CSV export", () => {
  it("exports primary values, tags, saved dates, notes, and custom fields", () => {
    const csv = createContactsCsv([{
      firstName: "Jordan",
      lastName: "Lee",
      company: "Northstar, Inc.",
      publicNotes: "Met at the annual summit.",
      emails: [
        { email: "other@example.com", isPrimary: false },
        { email: "jordan@example.com", isPrimary: true }
      ],
      phones: [{ phone: "+15550101010", isPrimary: true }],
      addresses: [{ street1: "1 Main St", street2: null, city: "Pasadena", state: "CA", postalCode: "91101", country: "US", isPrimary: true }],
      groups: ["Clients", "VIP"],
      jumpDates: [{ type: "Birthday", label: "Jordan's birthday", date: "2026-07-15", recurrence: "yearly" }],
      customFields: [
        { key: "policy_number", name: "Policy number", value: "PN-1042" },
        { key: "client_tier", name: "Client tier", value: "Preferred" }
      ]
    }]);

    expect(csv).toContain('"jordan@example.com"');
    expect(csv).toContain('"Northstar, Inc."');
    expect(csv).toContain('"Clients | VIP"');
    expect(csv).toContain('"Birthday · Jordan\'s birthday · 2026-07-15 · yearly"');
    expect(csv).toContain('"Met at the annual summit."');
    expect(csv).toContain('"Custom: Client tier"');
    expect(csv).toContain('"Custom: Policy number"');
    expect(csv).toContain('"Preferred"');
    expect(csv).toContain('"PN-1042"');
  });

  it("escapes quotes without exporting Private Notes", () => {
    const csv = createContactsCsv([{
      firstName: "Ava",
      lastName: null,
      company: null,
      publicNotes: 'Said "call next week".',
      emails: [],
      phones: [],
      addresses: [],
      groups: [],
      jumpDates: []
    }]);
    expect(csv).toContain('"Said ""call next week""."');
    expect(csv).not.toContain("Private Notes");
  });
});
