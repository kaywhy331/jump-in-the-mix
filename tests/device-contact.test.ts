import { describe, expect, it } from "vitest";
import { deviceContactToImportRecord } from "../src/lib/device-contact";

describe("device Contact normalization", () => {
  it("maps a native selection into the shared import record shape", () => {
    const record = deviceContactToImportRecord({
      names: ["  Avery Stone  "],
      emails: ["AVERY@EXAMPLE.COM", "avery@example.com"],
      phones: ["+1 (626) 555-0100", "+16265550100"],
      addresses: [
        {
          addressLines: ["100 Main St", "Suite 200"],
          city: "Pasadena",
          region: "CA",
          postalCode: "91101",
          country: "US"
        }
      ]
    }, 0, "device-request-123");

    expect(record).toMatchObject({
      rowId: "device-device-request-123-1",
      sourceRow: 1,
      source: "VCF",
      firstName: "Avery",
      lastName: "Stone",
      displayName: "Avery Stone"
    });
    expect(record.emails).toEqual([
      { value: "AVERY@EXAMPLE.COM", label: null, isPrimary: true }
    ]);
    expect(record.phones).toEqual([
      { value: "+1 (626) 555-0100", label: null, isPrimary: true }
    ]);
    expect(record.addresses).toEqual([
      {
        label: null,
        street1: "100 Main St",
        street2: "Suite 200",
        city: "Pasadena",
        state: "CA",
        postalCode: "91101",
        country: "US",
        isPrimary: true
      }
    ]);
  });

  it("drops malformed methods while preserving a usable selected Contact", () => {
    const record = deviceContactToImportRecord({
      names: ["Jordan Lee"],
      emails: ["not-an-email"],
      phones: ["123"],
      addresses: []
    }, 4, "device-request-456");

    expect(record.displayName).toBe("Jordan Lee");
    expect(record.emails).toEqual([]);
    expect(record.phones).toEqual([]);
    expect(record.rowId).toBe("device-device-request-456-5");
  });

  it("deduplicates repeated postal addresses and chooses one primary", () => {
    const record = deviceContactToImportRecord({
      names: ["Taylor Morgan"],
      emails: [],
      phones: [],
      addresses: [
        { addressLines: ["1 Market St"], city: "San Francisco", region: "CA" },
        { addressLines: ["1 Market St"], city: "San Francisco", region: "CA" },
        { addressLines: ["500 Howard St"], city: "San Francisco", region: "CA" }
      ]
    }, 0, "device-addresses");

    expect(record.addresses).toHaveLength(2);
    expect(record.addresses.filter((address) => address.isPrimary)).toHaveLength(1);
    expect(record.addresses[0].street1).toBe("1 Market St");
  });
});
