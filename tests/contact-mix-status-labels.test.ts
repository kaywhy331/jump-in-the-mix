import { describe, expect, it } from "vitest";
import { noMixTodayLine } from "../src/lib/contact-mix-status-labels";

describe("No Mix wording (JITM-09 §2.76–§2.77)", () => {
  it("says that no Mix will remind the owner, in the singular and the plural (D44)", () => {
    expect(noMixTodayLine(1)).toBe("1 person has No Mix, so no Mix will remind you about them.");
    expect(noMixTodayLine(3)).toBe("3 people have No Mix, so no Mix will remind you about them.");
    // A one-time follow-up may still be on its way, so the line never says nothing will remind the owner.
    for (const count of [1, 2]) expect(noMixTodayLine(count)).not.toMatch(/nothing will remind/);
  });
});
