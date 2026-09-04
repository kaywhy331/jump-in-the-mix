import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("contact edit identity preservation", () => {
  it("upserts stable methods and removes only records absent from the submitted edit", () => {
    const actions = readFileSync("src/lib/contact-actions.ts", "utf8");
    expect(actions).toContain("contactEmail.upsert");
    expect(actions).toContain("contactPhone.upsert");
    expect(actions).toContain("contactGroupMembership.upsert");
    expect(actions).toContain("contactCustomFieldValue.upsert");
    expect(actions).toContain("retainedAddressIds");
    expect(actions).not.toContain("tx.contactEmail.deleteMany({ where: { contactId } })");
    expect(actions).not.toContain("tx.contactPhone.deleteMany({ where: { contactId } })");
    expect(actions).not.toContain("tx.contactAddress.deleteMany({ where: { contactId } })");
  });
});
