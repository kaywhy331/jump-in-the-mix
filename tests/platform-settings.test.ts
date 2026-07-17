import { describe, expect, it } from "vitest";
import {
  PLATFORM_SETTING_DEFINITIONS,
  defaultPlatformSettingValue,
  validatePlatformSettingValue
} from "../src/lib/platform-settings";

describe("platform settings", () => {
  it("normalizes ordered string options and removes duplicates", () => {
    expect(validatePlatformSettingValue("mix.categories", [
      " Business ",
      "Sales & Prospecting",
      "business",
      "",
      "Events & Networking"
    ])).toEqual(["Business", "Sales & Prospecting", "Events & Networking"]);
  });

  it("rejects empty option sets", () => {
    expect(() => validatePlatformSettingValue("ai.objectives", ["", "  "])).toThrow("needs at least one option");
  });

  it("accepts only reviewed AI tone values", () => {
    expect(validatePlatformSettingValue("ai.tones", ["Warm", "Direct"])).toEqual(["Warm", "Direct"]);
    expect(() => validatePlatformSettingValue("ai.tones", ["Aggressive"])).toThrow("reviewed values");
  });

  it("validates feature flags as booleans", () => {
    expect(validatePlatformSettingValue("feature.communityTemplates", false)).toBe(false);
    expect(() => validatePlatformSettingValue("feature.communityTemplates", "false")).toThrow("enabled or disabled");
  });

  it("keeps a reviewed fallback for every registered key", () => {
    for (const key of Object.keys(PLATFORM_SETTING_DEFINITIONS) as Array<keyof typeof PLATFORM_SETTING_DEFINITIONS>) {
      expect(defaultPlatformSettingValue(key)).toBeDefined();
    }
  });
});
