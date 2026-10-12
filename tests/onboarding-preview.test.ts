import { describe, expect, it } from "vitest";
import type { WorkspaceProfile } from "../src/generated/prisma/client";
import { buildJumpReplacementValues, type JumpRenderContact } from "../src/lib/jump-render";
import { beatWhen, onboardingPreviewValues } from "../src/lib/onboarding-preview";

// Onboarding previews the first follow-up as it will be sent (D73): the same values and stand-ins as the renderer.
describe("onboarding preview values", () => {
  const rendered = (firstName: string, lastName: string, company: string, smsSignature: string, ownerName: string) => {
    const contact: JumpRenderContact = { firstName: firstName || null, lastName: lastName || null, company: null, publicNotes: null, privateNotes: null, emails: [], phones: [], addresses: [] };
    // Onboarding saves the business name and both signatures on the profile (onboarding-actions.ts).
    const profile = { company: company || null, smsSignature: smsSignature || ownerName, emailSignature: ownerName } as WorkspaceProfile;
    return buildJumpReplacementValues(contact, profile, { name: ownerName, email: "owner@example.test" }, "SMS");
  };

  it("matches the renderer for every token it fills, with and without the optional details", () => {
    for (const details of [
      { firstName: "Riley", lastName: "Example", company: "Lee Plumbing", smsSignature: "Sam at Lee Plumbing", ownerName: "Sam Lee" },
      { firstName: "Riley", lastName: "", company: "", smsSignature: "", ownerName: "Sam Lee" },
      // A saved person without a first name, such as an import row named by its company.
      { firstName: "", lastName: "", company: "Lee Plumbing", smsSignature: "", ownerName: "Sam Lee" }
    ]) {
      const { values } = onboardingPreviewValues(details);
      const expected = rendered(details.firstName, details.lastName, details.company, details.smsSignature, details.ownerName);
      for (const [token, value] of Object.entries(values)) expect([token, value]).toEqual([token, expected[token]]);
    }
  });

  it("marks only the details that fall back to a stand-in", () => {
    expect([...onboardingPreviewValues({ firstName: "Riley", lastName: "Example", company: "Lee Plumbing", smsSignature: "", ownerName: "Sam Lee" }).standIns]).toEqual([]);
    const missing = onboardingPreviewValues({ firstName: "", lastName: "", company: " ", smsSignature: "", ownerName: "Sam Lee" });
    expect(missing.values["{{First Name}}"]).toBe("there");
    expect(missing.values["{{My Company}}"]).toBe("my business");
    expect([...missing.standIns].sort()).toEqual(["{{First Name}}", "{{My Company}}", "{{contact.first_name}}", "{{my.company}}"]);
  });

  it("writes a Beat's day and time in the chosen timezone, on the 12-hour clock", () => {
    expect(beatWhen("2026-10-13T15:00:00.000Z", "America/Chicago", "en-US")).toBe("Tue, Oct 13 · 10:00 AM");
    expect(beatWhen("2026-10-18T18:30:00.000Z", "America/Chicago", "en-US")).toBe("Sun, Oct 18 · 1:30 PM");
    expect(beatWhen("2027-01-02T16:00:00.000Z", "America/Chicago", "en-US")).toBe("Sat, Jan 2 · 10:00 AM");
    expect(beatWhen(null, "America/Chicago", "en-US")).toBe("");
  });
});
