import { describe, expect, it } from "vitest";
import {
  GoogleApiError,
  googlePersonInSelectedGroups,
  googlePersonToContactRecord,
  isExpiredGoogleSyncToken,
  readGoogleConnectionMetadata,
  type GooglePerson
} from "../src/lib/google-contacts";

describe("Google Contacts normalization", () => {
  it("converts a Google Person into structured Contact data", () => {
    const person: GooglePerson = {
      resourceName: "people/c123",
      etag: "etag-1",
      metadata: { sources: [{ updateTime: "2026-07-16T10:00:00Z" }] },
      names: [{ displayName: "Jordan Lee", givenName: "Jordan", familyName: "Lee", metadata: { primary: true } }],
      organizations: [{ name: "Example Co", current: true }],
      emailAddresses: [
        { value: " Jordan@Example.COM ", formattedType: "Work", metadata: { primary: true } },
        { value: "jordan@example.com", formattedType: "Duplicate" },
        { value: "not-an-email" }
      ],
      phoneNumbers: [
        { value: "+1 (626) 555-0199", formattedType: "Mobile", metadata: { primary: true } },
        { value: "+1 626 555 0199", formattedType: "Duplicate" }
      ],
      addresses: [{
        streetAddress: "100 Main St",
        city: "Pasadena",
        region: "CA",
        postalCode: "91101",
        country: "US",
        formattedType: "Work",
        metadata: { primary: true }
      }],
      biographies: [{ value: "Trusted &amp; responsive.<br>Met at an event.", contentType: "TEXT_HTML" }],
      birthdays: [{ date: { year: 1988, month: 5, day: 12 } }],
      events: [{ date: { year: 2020, month: 9, day: 18 }, type: "anniversary", formattedType: "Work anniversary" }],
      memberships: [{ contactGroupMembership: { contactGroupResourceName: "contactGroups/clients" } }]
    };

    const record = googlePersonToContactRecord(person, 7);

    expect(record).toMatchObject({
      rowId: expect.stringMatching(/^google-/),
      sourceRow: 7,
      externalId: "people/c123",
      firstName: "Jordan",
      lastName: "Lee",
      displayName: "Jordan Lee",
      company: "Example Co",
      publicNotes: "Trusted & responsive.\nMet at an event.",
      membershipResourceNames: ["contactGroups/clients"]
    });
    expect(record?.emails).toEqual([{ value: "Jordan@Example.COM", label: "Work", isPrimary: true }]);
    expect(record?.phones).toEqual([{ value: "+1 (626) 555-0199", label: "Mobile", isPrimary: true }]);
    expect(record?.addresses[0]).toMatchObject({ street1: "100 Main St", city: "Pasadena", isPrimary: true });
    expect(record?.jumpDates).toEqual([
      { dateTypeName: "Birthday", label: "Birthday", dateValue: "1988-05-12", month: 5, day: 12, recurrence: "YEARLY" },
      { dateTypeName: "Anniversary", label: "Work anniversary", dateValue: "2020-09-18", month: 9, day: 18, recurrence: "YEARLY" }
    ]);
  });

  it("keeps a birthday without a year as a yearly logical date", () => {
    const record = googlePersonToContactRecord({
      resourceName: "people/no-year",
      names: [{ displayName: "Birthday Only" }],
      birthdays: [{ date: { month: 2, day: 29 } }]
    }, 1);

    expect(record?.jumpDates).toEqual([
      { dateTypeName: "Birthday", label: "Birthday", dateValue: null, month: 2, day: 29, recurrence: "YEARLY" }
    ]);
  });

  it("recognizes selected Google contact groups", () => {
    const person: GooglePerson = {
      resourceName: "people/grouped",
      memberships: [
        { contactGroupMembership: { contactGroupResourceName: "contactGroups/friends" } },
        { contactGroupMembership: { contactGroupResourceName: "contactGroups/clients" } }
      ]
    };

    expect(googlePersonInSelectedGroups(person, [])).toBe(true);
    expect(googlePersonInSelectedGroups(person, ["contactGroups/clients"])).toBe(true);
    expect(googlePersonInSelectedGroups(person, ["contactGroups/vendors"])).toBe(false);
  });

  it("preserves only safe connection metadata fields", () => {
    const metadata = readGoogleConnectionMetadata({
      accountEmail: "owner@example.com",
      selectedGroupResourceNames: ["contactGroups/clients", 123],
      selectedGroupLabels: { "contactGroups/clients": "Clients", unsafe: 42 },
      autoMergeExact: false,
      credentials: "must-not-leak"
    });

    expect(metadata).toEqual({
      accountEmail: "owner@example.com",
      accountName: undefined,
      connectedAt: undefined,
      selectedGroupResourceNames: ["contactGroups/clients"],
      selectedGroupLabels: { "contactGroups/clients": "Clients" },
      autoMergeExact: false,
      lastSummary: undefined
    });
    expect(metadata).not.toHaveProperty("credentials");
  });

  it("detects Google's expired incremental-sync token response", () => {
    const expired = new GoogleApiError("Sync token expired", 400, {
      error: { details: [{ reason: "EXPIRED_SYNC_TOKEN" }] }
    });
    const ordinary = new GoogleApiError("Bad request", 400, { error: { details: [{ reason: "OTHER" }] } });

    expect(isExpiredGoogleSyncToken(expired)).toBe(true);
    expect(isExpiredGoogleSyncToken(ordinary)).toBe(false);
    expect(isExpiredGoogleSyncToken(new Error("not Google"))).toBe(false);
  });
});
