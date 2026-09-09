import { describe, expect, it } from "vitest";
import { DEMO_CONTACT_DEFAULTS, DEMO_MARKER, DEMO_SCENARIOS, demoActionUrl, personalizeDemoText, resolveDemoContact } from "../src/lib/product-demo";

describe("personalized homepage demo", () => {
  it("falls back per field without overwriting other contact details", () => {
    const values = { name: "  Taylor Rivera  ", phone: " ", email: "", notes: "\n", senderName: "  Casey  " };
    expect(resolveDemoContact(values)).toEqual({ ...DEMO_CONTACT_DEFAULTS, name: "Taylor Rivera", senderName: "Casey" });
    expect(values.name).toBe("  Taylor Rivera  ");
  });

  it("personalizes all 13 beats in one pass without leaking notes", () => {
    const contact = { ...DEMO_CONTACT_DEFAULTS, name: "Taylor Rivera", senderName: "Casey", notes: "Private context only" };
    const steps = DEMO_SCENARIOS.flatMap(scenario => scenario.steps);
    expect(steps).toHaveLength(13);
    for (const step of steps) {
      const text = personalizeDemoText(step.message, contact);
      expect(text).toContain("Taylor");
      expect(text).not.toMatch(/Alex|Jamie|\{\{|Private context only/);
      if (step.channel !== "phone") expect(text).toContain("Casey");
    }
    expect(personalizeDemoText("Hi {{First Name}}, from {{Your Name}}", { ...contact, senderName: "{{First Name}} $&" })).toBe("Hi Taylor, from {{First Name}} $&");
  });

  it("uses the edited destination and encodes subject and message as separate values", () => {
    const contact = { phone: "(202) 555-0142", email: "taylor+demo@example.invalid" };
    const body = "Café & details? #1\n&bcc=another@example.invalid";
    const subject = "Quote & timing?";
    const email = new URL(demoActionUrl("email", subject, body, false, contact)!);
    expect(decodeURIComponent(email.pathname)).toBe(contact.email);
    expect([...email.searchParams.keys()]).toEqual(["subject", "body"]);
    expect(email.searchParams.get("subject")).toBe(`[DEMO] ${subject}`);
    expect(email.searchParams.get("body")).toBe(`${DEMO_MARKER}\n\n${body}`);
    expect(demoActionUrl("phone", "", body, false, contact)).toBe("tel:+12025550142");
    expect(demoActionUrl("text", "", body, false, contact)).toBe(`sms:+12025550142?body=${encodeURIComponent(`${DEMO_MARKER}\n\n${body}`)}`);
    expect(demoActionUrl("text", "", body, true, contact)).toContain("sms:+12025550142&body=");
    expect(demoActionUrl("phone", "", "", false, { ...contact, phone: "+44 7700 900123" })).toBe("tel:+447700900123");
  });

  it.each(["bad email", "a@example.invalid,b@example.invalid", "a@example.invalid?bcc=b@example.invalid", "a@example.invalid\r\nBcc: b@example.invalid"])("blocks malformed or multiple email recipients: %s", email => {
    expect(demoActionUrl("email", "", "", false, { ...DEMO_CONTACT_DEFAULTS, email })).toBeNull();
  });

  it.each(["123", "+1 202 555 0142?body=wrong", "555-CALL-NOW", "1234567890123456"])("blocks invalid phone destinations: %s", phone => {
    expect(demoActionUrl("phone", "", "", false, { ...DEMO_CONTACT_DEFAULTS, phone })).toBeNull();
  });
});
