import { describe, expect, it } from "vitest";
import { renderJumpSnapshot } from "../src/lib/jump-render";

const contact = {
  firstName: "Jordan",
  lastName: "Lee",
  company: "Northstar",
  publicNotes: "Prefers concise updates.",
  privateNotes: "Ask about the renewal concern.",
  emails: [{ email: "jordan@example.com", isPrimary: true }],
  phones: [{ phone: "+15550101010", isPrimary: true }],
  addresses: [{ street1: "1 Main St", city: "Pasadena", state: "CA", postalCode: "91101", isPrimary: true }]
};

const owner = { name: "Alex Morgan", email: "alex@example.com" };

const profile = {
  workspaceId: "workspace",
  timezone: "America/Los_Angeles",
  industry: "Consulting",
  primaryGoal: null,
  company: "Morgan Advisory",
  website: "https://example.com",
  phone: "+15550102020",
  street: null,
  city: null,
  state: null,
  postalCode: null,
  mailingAddress: null,
  product1: "Strategy Session",
  product2: null,
  product3: null,
  product4: null,
  product5: null,
  myCustom1: null,
  myCustom2: null,
  myCustom3: null,
  smsSignature: "— Alex",
  emailSignature: "Alex Morgan",
  quietHoursStart: 1200,
  quietHoursEnd: 480,
  onboardingStep: 5,
  onboardingDone: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("Jump rendering", () => {
  it("renders Contact and My Info placeholders from primary values", () => {
    const rendered = renderJumpSnapshot(
      { body: "Hi {{First Name}} at {{Company}} — {{my.company}} / {{my.product_1}}" },
      contact,
      profile,
      owner,
      "SMS"
    );
    expect(rendered.body).toBe("Hi Jordan at Northstar — Morgan Advisory / Strategy Session");
  });

  it("exposes Private Notes only to Phone Call scripts", () => {
    const phone = renderJumpSnapshot({ script: "{{Private Notes}}" }, contact, profile, owner, "PHONE_CALL");
    const sms = renderJumpSnapshot({ body: "{{Private Notes}}" }, contact, profile, owner, "SMS");
    expect(phone.script).toBe("Ask about the renewal concern.");
    expect(sms.body).toBe("");
  });
});
