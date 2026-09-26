import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ preference: vi.fn(), workspace: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { userPreference: { findUnique: mocks.preference }, workspace: { findUnique: mocks.workspace } } }));
import { DISPLAY_LOCALES, displayPreferencesForUser, isDisplayLocale, usableLocale } from "@/lib/display-preferences";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preference.mockResolvedValue(null);
});

describe("usableLocale", () => {
  it("keeps a tag Intl supports, in canonical form", () => {
    expect(usableLocale("en-GB")).toBe("en-GB");
    expect(usableLocale("EN-us")).toBe("en-US");
    // Older rows may hold a tag the Profile card no longer offers; formatting still works with it.
    expect(usableLocale("fr-CA")).toBe("fr-CA");
  });
  it("falls back to en-US for anything Intl.DateTimeFormat would throw on or not know", () => {
    expect(usableLocale("en_US")).toBe("en-US");
    expect(usableLocale("xx-INVALID!!")).toBe("en-US");
    expect(usableLocale("xx-YY")).toBe("en-US");
    expect(usableLocale("")).toBe("en-US");
    expect(usableLocale(null)).toBe("en-US");
    expect(usableLocale(undefined)).toBe("en-US");
  });
});

describe("isDisplayLocale", () => {
  it("accepts exactly the offered list", () => {
    for (const locale of DISPLAY_LOCALES) expect(isDisplayLocale(locale)).toBe(true);
    expect(isDisplayLocale("en_US")).toBe(false);
    expect(isDisplayLocale("fr-CA")).toBe(false);
    expect(isDisplayLocale("")).toBe(false);
  });
});

describe("displayPreferencesForUser", () => {
  it("formats with en-US when the stored locale is invalid, keeping the stored timezone", async () => {
    mocks.preference.mockResolvedValue({ userId: "user-1", locale: "en_US", timezone: "Europe/London" });
    await expect(displayPreferencesForUser("user-1")).resolves.toEqual({ locale: "en-US", timeZone: "Europe/London" });
    expect(mocks.preference).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });
  it("keeps a valid stored locale and falls back per field for the timezone", async () => {
    mocks.preference.mockResolvedValue({ userId: "user-1", locale: "en-AU", timezone: "Nowhere/Land" });
    await expect(displayPreferencesForUser("user-1", "America/Chicago")).resolves.toEqual({ locale: "en-AU", timeZone: "America/Chicago" });
  });
  it("uses en-US and UTC when nothing is stored", async () => {
    await expect(displayPreferencesForUser("user-2")).resolves.toEqual({ locale: "en-US", timeZone: "UTC" });
  });
});
