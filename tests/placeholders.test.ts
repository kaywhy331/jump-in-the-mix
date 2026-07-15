import { describe, expect, it } from "vitest";
import { containsPrivateNotesPlaceholder, findUnknownPlaceholders } from "../src/lib/placeholders";

describe("placeholder validation", () => {
  it("accepts approved legacy and canonical placeholders", () => {
    expect(findUnknownPlaceholders("Hi {{First Name}} — {{SMS Signature}} / {{contact.public_notes}} / {{my.product_1}}")).toEqual([]);
  });

  it("returns each unknown placeholder once", () => {
    expect(findUnknownPlaceholders("{{Unknown}} and {{Unknown}} plus {{Other}}"))
      .toEqual(["{{Unknown}}", "{{Other}}");
  });

  it("recognizes both Private Notes aliases", () => {
    expect(containsPrivateNotesPlaceholder("Discuss {{Private Notes}} on the call.")).toBe(true);
    expect(containsPrivateNotesPlaceholder("Review {{contact.private_notes}} first.")).toBe(true);
    expect(containsPrivateNotesPlaceholder("Hi {{First Name}}")).toBe(false);
  });
});
