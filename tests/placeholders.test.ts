import { describe, expect, it } from "vitest";
import { findUnknownPlaceholders } from "../src/lib/placeholders";

describe("placeholder validation", () => {
  it("accepts approved placeholders", () => {
    expect(findUnknownPlaceholders("Hi {{First Name}} — {{SMS Signature}}")).toEqual([]);
  });

  it("returns each unknown placeholder once", () => {
    expect(findUnknownPlaceholders("{{Unknown}} and {{Unknown}} plus {{Other}}"))
      .toEqual(["{{Unknown}}", "{{Other}}"]);
  });
});
