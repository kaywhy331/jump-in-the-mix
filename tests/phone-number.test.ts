import { describe, expect, it } from "vitest";
import { normalizePhone } from "../src/lib/contact-input";
import { phoneHandoffTarget } from "../src/lib/phone-dial";
import {
  DEFAULT_PHONE_REGION,
  PHONE_REGIONS,
  canonicalPhoneKey,
  canonicalRowKey,
  isPhoneRegion,
  phoneDialTarget,
  phoneLookupKeys,
  phoneMatchesRow,
  phoneRegionLabel,
  phoneRegionOrDefault,
  phoneRowKeys,
  storedPhoneDialTarget,
  workspacePhoneRegion
} from "../src/lib/phone-number";

describe("canonical phone keys", () => {
  it("gives every North American spelling of one number the same E.164 key", () => {
    for (const typed of ["(555) 123-4567", "555.123.4567", "555-123-4567", "1-555-123-4567", "15551234567", "+1 555 123 4567", "+1 (555) 123-4567"]) {
      expect(canonicalPhoneKey(typed, "US")).toBe("+15551234567");
    }
    // Canada and the other North American regions share the plan.
    expect(canonicalPhoneKey("(555) 123-4567", "CA")).toBe("+15551234567");
  });

  it("keeps the extension, so two desks on one office line stay two numbers", () => {
    for (const typed of ["(555) 123-4567 x12", "555-123-4567 ext. 12", "555-123-4567 #12", "555-123-4567, extension 12", "+1 555 123 4567 ext 12"]) {
      expect(canonicalPhoneKey(typed, "US")).toBe("+15551234567;ext=12");
    }
    expect(canonicalPhoneKey("(555) 123-4567 x13", "US")).toBe("+15551234567;ext=13");
    expect(canonicalPhoneKey("(555) 123-4567", "US")).not.toBe(canonicalPhoneKey("(555) 123-4567 x12", "US"));
  });

  it("reads a number only at a full national length: 7-digit local numbers keep the legacy key", () => {
    expect(canonicalPhoneKey("555-1234", "US")).toBe("5551234");
    expect(canonicalPhoneKey("555-1234", "US")).toBe(normalizePhone("555-1234"));
    expect(canonicalPhoneKey("555-123-4567 5", "US")).toBe("55512345675");
    // An extension on a local number keeps the legacy key too (its digits folded in, as before).
    expect(canonicalPhoneKey("555-1234 x9", "US")).toBe("55512349");
  });

  it("takes the international prefix from the region, never a global 00/011 rule", () => {
    expect(canonicalPhoneKey("011 44 20 7946 0958", "US")).toBe("+442079460958");
    // 00 is not an exit code inside North America.
    expect(canonicalPhoneKey("00 44 20 7946 0958", "US")).toBe("00442079460958");
    expect(canonicalPhoneKey("00 1 555 123 4567", "GB")).toBe("+15551234567");
    // UK area codes 0114–0118 begin with 011: Sheffield stays a UK number.
    expect(canonicalPhoneKey("0114 496 0000", "GB")).toBe("+441144960000");
    expect(canonicalPhoneKey("0118 496 0000", "GB")).toBe("+441184960000");
    expect(canonicalPhoneKey("011 1 555 123 4567", "GB")).toBe("01115551234567");
  });

  it("reads national numbers in the workspace's region, trunk prefixes included", () => {
    expect(canonicalPhoneKey("07911 123456", "GB")).toBe("+447911123456");
    expect(canonicalPhoneKey("7911 123456", "GB")).toBe("+447911123456");
    expect(canonicalPhoneKey("0412 345 678", "AU")).toBe("+61412345678");
    // Italy keeps its leading 0 after the country code.
    expect(canonicalPhoneKey("06 1234 5678", "IT")).toBe("+390612345678");
    // The documented risk of keeping the US default for a UK business: a UK mobile typed without its 0.
    expect(canonicalPhoneKey("7911 123456", "US")).toBe("+17911123456");
  });

  it("never reads a North American number whose area code starts with 0 or 1", () => {
    expect(canonicalPhoneKey("0412 345 678", "US")).toBe("0412345678");
    expect(canonicalPhoneKey("123-456-7890", "US")).toBe("1234567890");
    expect(canonicalPhoneKey("07911 123456", "US")).toBe("07911123456");
  });

  it("lets a typed + or country code win over the region", () => {
    for (const region of ["US", "GB", "AU", "DE"]) {
      expect(canonicalPhoneKey("+61 412 345 678", region)).toBe("+61412345678");
      expect(canonicalPhoneKey("+44 (0)20 7946 0958", region)).toBe("+442079460958");
    }
  });

  it("refuses what is not a phone number and falls back without a supported region", () => {
    expect(() => canonicalPhoneKey("123", "US")).toThrow("Invalid phone number.");
    expect(() => canonicalPhoneKey("call me", "US")).toThrow("Invalid phone number.");
    expect(canonicalPhoneKey("(555) 123-4567", "XX")).toBe("5551234567");
    expect(canonicalPhoneKey("+1 555 123 4567", "XX")).toBe("+15551234567");
    // Surrounding words are not parsed away: the whole value must be a number.
    expect(canonicalPhoneKey("call 555-123-4567 soon", "US")).toBe("5551234567");
  });

  it("is idempotent: a stored canonical key reads as itself", () => {
    for (const key of ["+15551234567", "+15551234567;ext=12", "+442079460958", "+390612345678"]) {
      expect(canonicalPhoneKey(key, "US")).toBe(key);
      expect(canonicalPhoneKey(key, "GB")).toBe(key);
    }
  });
});

describe("lookup keys (expand/contract)", () => {
  it("returns [canonical, legacy], deduplicated, and nothing for a non-number", () => {
    expect(phoneLookupKeys("(555) 123-4567", "US")).toEqual(["+15551234567", "5551234567"]);
    expect(phoneLookupKeys("+1 555 123 4567", "US")).toEqual(["+15551234567"]);
    expect(phoneLookupKeys("(555) 123-4567 x12", "US")).toEqual(["+15551234567;ext=12", "555123456712"]);
    expect(phoneLookupKeys("555-1234", "US")).toEqual(["5551234"]);
    expect(phoneLookupKeys("07911 123456", "GB")).toEqual(["+447911123456", "07911123456"]);
    expect(phoneLookupKeys("123", "US")).toEqual([]);
    expect(phoneLookupKeys("", "US")).toEqual([]);
  });

  it("matches a stored row under either key, and compares rows in memory by their display value too", () => {
    const legacyRow = { phone: "(555) 123-4567", normalized: "5551234567" };
    const sweptRow = { phone: "(555) 123-4567", normalized: "+15551234567" };
    for (const typed of ["+1 555 123 4567", "555.123.4567", "1 (555) 123-4567"]) {
      expect(phoneMatchesRow(typed, legacyRow, "US")).toBe(true);
      expect(phoneMatchesRow(typed, sweptRow, "US")).toBe(true);
    }
    expect(phoneMatchesRow("(555) 123-4567 x12", sweptRow, "US")).toBe(false);
    expect(phoneMatchesRow("(555) 123-4568", sweptRow, "US")).toBe(false);
    expect(phoneRowKeys(legacyRow, "US")).toEqual(["5551234567", "+15551234567"]);
    expect(phoneRowKeys(sweptRow, "US")).toEqual(["+15551234567"]);
  });

  it("gives a row whose display value is not a number its own stored key", () => {
    expect(canonicalRowKey({ phone: "ask at reception", normalized: "5551234567" }, "US")).toBe("5551234567");
    expect(canonicalRowKey({ phone: "(555) 123-4567", normalized: "5551234567" }, "US")).toBe("+15551234567");
  });
});

describe("dial targets", () => {
  it("dials only a stored key that begins with + and is a possible number, without its extension", () => {
    expect(phoneDialTarget("+15551234567", "(555) 123-4567")).toBe("+15551234567");
    expect(phoneDialTarget("+15551234567;ext=12", "(555) 123-4567 x12")).toBe("+15551234567");
    expect(phoneDialTarget("+442079460958", "+44 20 7946 0958")).toBe("+442079460958");
    expect(phoneDialTarget("5551234567", "(555) 123-4567")).toBeNull();
    expect(phoneDialTarget("5551234", "555-1234")).toBeNull();
    expect(phoneDialTarget("+10412345678", "+1 041 234 5678")).toBeNull();
    expect(phoneDialTarget("+15551234", "+1 555 1234")).toBeNull();
    expect(phoneDialTarget("", "")).toBeNull();
  });

  it("refuses a legacy key typed with + whose digits include the extension", () => {
    expect(phoneDialTarget("+1555123456712", "+1 555 123 4567 x12")).toBeNull();
    expect(phoneDialTarget("+44207946095822", "+44 20 7946 0958 ext 22")).toBeNull();
  });

  it("reads a row the sweep has not reached the way the sweep will, in the workspace's region", () => {
    expect(storedPhoneDialTarget({ phone: "(555) 234-5678", normalized: "5552345678" }, "US")).toBe("+15552345678");
    expect(storedPhoneDialTarget({ phone: "+1 555 123 4567 x12", normalized: "+1555123456712" }, "US")).toBe("+15551234567");
    expect(storedPhoneDialTarget({ phone: "07911 123456", normalized: "07911123456" }, "GB")).toBe("+447911123456");
    expect(storedPhoneDialTarget({ phone: "07911 123456", normalized: "07911123456" }, "US")).toBeNull();
    expect(storedPhoneDialTarget({ phone: "555-1234", normalized: "5551234" }, "US")).toBeNull();
    // A swept row dials its stored key.
    expect(storedPhoneDialTarget({ phone: "(555) 234-5678", normalized: "+15552345678" }, "GB")).toBe("+15552345678");
  });

  it("links to the dial target, else to the digits as typed without the extension (parser-free)", () => {
    expect(phoneHandoffTarget("+15552345678", "(555) 234-5678 x12")).toBe("+15552345678");
    expect(phoneHandoffTarget(null, "555-1234 x9")).toBe("5551234");
    expect(phoneHandoffTarget(null, "0412 345 678")).toBe("0412345678");
    expect(phoneHandoffTarget(null, "call me")).toBeNull();
    expect(phoneHandoffTarget(null, null)).toBeNull();
  });
});

describe("phone regions", () => {
  it("lists every supported region once, by English name, with its calling code", () => {
    expect(PHONE_REGIONS.length).toBeGreaterThan(200);
    expect(new Set(PHONE_REGIONS.map((region) => region.code)).size).toBe(PHONE_REGIONS.length);
    expect(PHONE_REGIONS.every((region) => /^[A-Z]{2}$/.test(region.code) && /^\d{1,3}$/.test(region.callingCode) && region.name.length > 1)).toBe(true);
    expect(PHONE_REGIONS).toContainEqual({ code: "US", callingCode: "1", name: "United States" });
    expect(PHONE_REGIONS).toContainEqual({ code: "GB", callingCode: "44", name: "United Kingdom" });
    const names = PHONE_REGIONS.map((region) => region.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(phoneRegionLabel("US")).toBe("United States (+1)");
    expect(phoneRegionLabel("GB")).toBe("United Kingdom (+44)");
  });

  it("accepts only supported two-letter codes and defaults to North America", () => {
    expect(DEFAULT_PHONE_REGION).toBe("US");
    expect(isPhoneRegion("GB")).toBe(true);
    for (const value of ["gb", "XX", "USA", "", null, undefined, 44]) expect(isPhoneRegion(value)).toBe(false);
    expect(phoneRegionOrDefault("AU")).toBe("AU");
    expect(phoneRegionOrDefault("XX")).toBe("US");
    expect(phoneRegionOrDefault(undefined)).toBe("US");
  });

  it("reads the workspace's region, US when the preference row is missing", async () => {
    const db = (phoneRegion: string | null) => ({ workspacePreference: { findUnique: async ({ where }: { where: { workspaceId: string } }) => (where.workspaceId === "w1" && phoneRegion ? { phoneRegion } : null) } }) as never;
    expect(await workspacePhoneRegion(db("GB"), "w1")).toBe("GB");
    expect(await workspacePhoneRegion(db(null), "w1")).toBe("US");
    expect(await workspacePhoneRegion(db("GB"), "w2")).toBe("US");
    expect(await workspacePhoneRegion(db("ZZ"), "w1")).toBe("US");
  });
});
