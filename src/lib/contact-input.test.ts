import { describe, expect, it } from "vitest";
import { buildAddressInputs, buildEmailInputs, buildPhoneInputs, isValidEmail } from "@/lib/contact-input";

describe("Contact repeated-value normalization", () => {
  it("preserves the requested primary email after blank and duplicate rows are removed", () => {
    const values = ["", "first@example.com", "FIRST@example.com", "primary@example.com"];
    const result = buildEmailInputs(values, ["", "Work", "Duplicate", "Personal"], "3");
    expect(result).toHaveLength(2);
    expect(result.find((item) => item.isPrimary)?.normalized).toBe("primary@example.com");
  });

  it("preserves the requested primary phone after blank rows are removed", () => {
    const result = buildPhoneInputs(["", "(415) 555-0100", "+1 415 555 0199"], ["", "Work", "Mobile"], "2");
    expect(result.find((item) => item.isPrimary)?.normalized).toBe("+14155550199");
  });

  it("does not persist a label-only address and still preserves the selected address", () => {
    const result = buildAddressInputs(
      ["", "", "123 Main Street"],
      ["", "", "Suite 4"],
      ["", "", "Oakland"],
      ["", "", "CA"],
      ["", "", "94612"],
      ["", "", "US"],
      ["Label only", "", "Office"],
      "2"
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ label: "Office", isPrimary: true });
  });

  it("rejects email addresses beyond the supported length", () => {
    expect(isValidEmail(`${"a".repeat(245)}@example.com`)).toBe(false);
  });
});
