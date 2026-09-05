import { describe, expect, it } from "vitest";
import {
  PLATFORM_SETTING_DEFINITIONS,
  defaultPlatformSettingValue,
  validatePlatformSettingValue
} from "../src/lib/platform-settings";

describe("platform settings", () => {
  it("normalizes ordered string options and removes duplicates", () => {
    expect(validatePlatformSettingValue("mix.categories", [
      " Estimates ",
      "Reviews & referrals",
      "estimates",
      "",
      "Past clients"
    ])).toEqual(["Estimates", "Reviews & referrals", "Past clients"]);
  });

  it("rejects empty option sets", () => {
    expect(() => validatePlatformSettingValue("mix.categories", ["", "  "])).toThrow("needs at least one option");
  });

  it("accepts only reviewed plan-library values", () => {
    expect(validatePlatformSettingValue("mix.industries", ["Home services", "Other"])).toEqual(["Home services", "Other"]);
    expect(() => validatePlatformSettingValue("mix.industries", ["Unreviewed vertical"])).toThrow("reviewed values");
  });

  it("keeps a reviewed fallback for every registered key", () => {
    for (const key of Object.keys(PLATFORM_SETTING_DEFINITIONS) as Array<keyof typeof PLATFORM_SETTING_DEFINITIONS>) {
      expect(defaultPlatformSettingValue(key)).toBeDefined();
    }
  });
});
