import { describe, expect, it } from "vitest";
import { buildAddressInputs, buildEmailInputs, buildPhoneInputs, normalizePhone } from "../src/lib/contact-input";

describe("contact input normalization", () => {
  it("normalizes, deduplicates, and selects one primary email", () => {
    const rows = buildEmailInputs(
      [" Person@Example.COM ", "person@example.com", "other@example.com"],
      ["Work", "Duplicate", "Personal"],
      "1"
    );

    expect(rows).toEqual([
      { value: "Person@Example.COM", normalized: "person@example.com", label: "Work", isPrimary: false },
      { value: "other@example.com", normalized: "other@example.com", label: "Personal", isPrimary: true }
    ]);
  });

  it("normalizes phone numbers and rejects implausible values", () => {
    expect(normalizePhone("+1 (626) 555-0199")).toBe("+16265550199");
    expect(normalizePhone("123")).toBeNull();

    const rows = buildPhoneInputs(["+1 626 555 0199", "626-555-0100"], ["Mobile", "Office"], "0");
    expect(rows[0]).toMatchObject({ normalized: "+16265550199", isPrimary: true });
    expect(rows[1]).toMatchObject({ normalized: "6265550100", isPrimary: false });
  });

  it("keeps structured addresses and applies a primary fallback", () => {
    const rows = buildAddressInputs(
      ["100 Main St", ""],
      ["Suite 3", ""],
      ["Pasadena", ""],
      ["CA", ""],
      ["91101", ""],
      ["US", ""],
      ["Office", ""],
      "9"
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      label: "Office",
      street1: "100 Main St",
      street2: "Suite 3",
      city: "Pasadena",
      state: "CA",
      postalCode: "91101",
      country: "US",
      isPrimary: true
    });
  });
});
