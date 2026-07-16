import { describe, expect, it } from "vitest";
import {
  buildContactCustomFieldInputs,
  customFieldPlaceholder,
  normalizeCustomFieldKey
} from "../src/lib/contact-custom-fields";
import { renderJumpSnapshot } from "../src/lib/jump-render";
import { findUnknownPlaceholders, isContactCustomFieldPlaceholder } from "../src/lib/placeholders";

describe("Contact custom fields", () => {
  it("creates stable, safe placeholder keys", () => {
    expect(normalizeCustomFieldKey(" Policy Number ")).toBe("policy_number");
    expect(normalizeCustomFieldKey("Résumé / Renewal %")).toBe("resume_renewal");
    expect(customFieldPlaceholder("policy_number")).toBe("{{contact.custom.policy_number}}");
  });

  it("trims, ignores blanks, and keeps the final value for a repeated definition", () => {
    const fields = buildContactCustomFieldInputs(
      ["definition-a", "definition-b", "definition-a", ""],
      [" First ", "", "Final", "Ignored"]
    );
    expect(fields).toEqual([{ definitionId: "definition-a", value: "Final" }]);
  });

  it("accepts only the canonical dynamic custom placeholder shape", () => {
    expect(isContactCustomFieldPlaceholder("{{contact.custom.policy_number}}")).toBe(true);
    expect(isContactCustomFieldPlaceholder("{{contact.custom.Policy Number}}")).toBe(false);
    expect(findUnknownPlaceholders("Policy: {{contact.custom.policy_number}}")).toEqual([]);
    expect(findUnknownPlaceholders("Policy: {{contact.custom.Policy Number}}")).toEqual(["{{contact.custom.Policy Number}}"]);
  });

  it("renders custom values without changing Private Notes restrictions", () => {
    const contact = {
      firstName: "Jordan",
      lastName: "Lee",
      company: "Northstar",
      publicNotes: null,
      privateNotes: "Discuss the underwriting exception.",
      emails: [],
      phones: [],
      addresses: [],
      customFieldValues: [
        { value: "PN-1042", definition: { key: "policy_number" } },
        { value: "Preferred", definition: { key: "client_tier" } }
      ]
    };
    const template = {
      body: "Policy {{contact.custom.policy_number}} · {{contact.custom.client_tier}} · {{Private Notes}}"
    };
    const sms = renderJumpSnapshot(template, contact, null, { name: "Alex Morgan", email: "alex@example.com" }, "SMS");
    const call = renderJumpSnapshot({ script: template.body }, contact, null, { name: "Alex Morgan", email: "alex@example.com" }, "PHONE_CALL");
    expect(sms.body).toBe("Policy PN-1042 · Preferred · ");
    expect(call.script).toBe("Policy PN-1042 · Preferred · Discuss the underwriting exception.");
  });
});
