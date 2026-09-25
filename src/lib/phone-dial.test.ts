import { describe, expect, it } from "vitest";
import { dialablePhone, phoneEquivalenceKey, phoneLinkTarget, phoneMatchKeys, phoneSearchDigits, stripPhoneExtension } from "@/lib/phone-dial";

describe("dialablePhone", () => {
  it("turns North American spellings into E.164", () => {
    expect(dialablePhone("(555) 234-5678")).toBe("+15552345678");
    expect(dialablePhone("555.234.5678")).toBe("+15552345678");
    expect(dialablePhone("1-555-234-5678")).toBe("+15552345678");
    expect(dialablePhone("+1 (555) 234-5678")).toBe("+15552345678");
  });
  it("keeps an international number the owner typed with a plus", () => {
    expect(dialablePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(dialablePhone("+61 412 345 678")).toBe("+61412345678");
  });
  it("refuses to guess a country for national numbers that are not North American", () => {
    expect(dialablePhone("0412 345 678")).toBeNull();
    expect(dialablePhone("020 7946 0958")).toBeNull();
    expect(dialablePhone("555-0123")).toBeNull();
    expect(dialablePhone("123-456-7890")).toBeNull();
    expect(dialablePhone("555-123-4567")).toBeNull(); // an exchange cannot start with 1
    expect(phoneLinkTarget("555-123-4567")).toBe("5551234567");
    expect(phoneMatchKeys("555-123-4567")).toEqual(["5551234567"]);
    expect(dialablePhone("")).toBeNull();
    expect(dialablePhone(null)).toBeNull();
  });
  it("drops extensions before reading the digits", () => {
    expect(stripPhoneExtension("555-234-5678 x12")).toBe("555-234-5678");
    expect(stripPhoneExtension("555-234-5678 ext. 12")).toBe("555-234-5678");
    expect(stripPhoneExtension("555-234-5678 #12")).toBe("555-234-5678");
    expect(stripPhoneExtension("555-234-5678, extension 4")).toBe("555-234-5678");
    expect(dialablePhone("555-234-5678 x12")).toBe("+15552345678");
    expect(dialablePhone("+44 20 7946 0958 ext 22")).toBe("+442079460958");
  });
});

describe("phoneLinkTarget", () => {
  it("prefers E.164 and otherwise falls back to the stored digits without adding a plus", () => {
    expect(phoneLinkTarget("(555) 234-5678")).toBe("+15552345678");
    expect(phoneLinkTarget("0412 345 678")).toBe("0412345678");
    expect(phoneLinkTarget("+61 412 345 678")).toBe("+61412345678");
    expect(phoneLinkTarget("555-0123 x9")).toBe("5550123");
    expect(phoneLinkTarget("call me")).toBeNull();
  });
});

describe("phoneMatchKeys and phoneEquivalenceKey", () => {
  it("collapses the three North American spellings onto one set of keys", () => {
    const a = phoneMatchKeys("(555) 234-5678");
    const b = phoneMatchKeys("+1 555 234 5678");
    const c = phoneMatchKeys("15552345678");
    for (const keys of [a, b, c]) expect(new Set(keys)).toEqual(new Set(["5552345678", "15552345678", "+15552345678"]));
    expect(phoneEquivalenceKey("(555) 234-5678")).toBe(phoneEquivalenceKey("+15552345678"));
  });
  it("keeps other numbers to their single normalized key", () => {
    expect(phoneMatchKeys("0412 345 678")).toEqual(["0412345678"]);
    expect(phoneMatchKeys("+44 20 7946 0958")).toEqual(["+442079460958"]);
    expect(phoneMatchKeys("")).toEqual([]);
    expect(phoneEquivalenceKey("0412 345 678")).toBe("0412345678");
  });
});

describe("phoneSearchDigits", () => {
  it("searches both national spellings for North American queries", () => {
    expect(new Set(phoneSearchDigits("+1 555 234 5678"))).toEqual(new Set(["15552345678", "5552345678"]));
    expect(new Set(phoneSearchDigits("555-234-5678"))).toEqual(new Set(["5552345678", "15552345678"]));
    expect(phoneSearchDigits("4567")).toEqual(["4567"]);
    expect(phoneSearchDigits("123")).toEqual([]);
    expect(phoneSearchDigits("Bob Smith")).toEqual([]);
  });
});
