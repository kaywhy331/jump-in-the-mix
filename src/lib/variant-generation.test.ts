import { describe, expect, it } from "vitest";
import { generateVariant, talkingPoints } from "@/lib/variant-generation";
import { authoredFamilies, attemptChannelAllowed, ownerWrittenFamilies, preparedVariants, recommendedVariant, usableVariants, variantsOfSnapshot } from "@/lib/preparation-variants";

const text = { subject: null, body: "Hi {{First Name}}, just checking that you received the estimate. Any questions I can clear up? {{SMS Signature}}", script: null };

describe("generated channel versions", () => {
  it("writes an email with a subject and the email signature from a text", () => {
    const email = generateVariant("TEXT", text, "EMAIL")!;
    expect(email.subject).toBe("Just checking that you received the estimate");
    expect(email.body).toBe("Hi {{First Name}},\n\nJust checking that you received the estimate. Any questions I can clear up?\n\n{{Email Signature}}");
    expect(email.body).not.toContain("{{SMS Signature}}");
    expect(email.script).toBeNull();
  });

  it("writes bulleted talking points for a call, without the greeting or signature", () => {
    const call = generateVariant("TEXT", text, "CALL")!;
    expect(call.script!.split("\n")).toEqual([
      "• Say hello and check it’s a good time to talk",
      "• Just checking that you received the estimate.",
      "• Any questions I can clear up?",
      "• Agree the next step before you hang up"
    ]);
    expect(call.body).toBeNull();
  });

  it("writes a text from an email and never quotes private call notes", () => {
    const fromEmail = generateVariant("EMAIL", { subject: "Estimate", body: "Hi {{First Name}},\n\nThe estimate is attached.\n\n{{Email Signature}}", script: null }, "TEXT")!;
    expect(fromEmail.body).toBe("Hi {{First Name}},\nThe estimate is attached.\n{{SMS Signature}}");
    const fromCall = generateVariant("CALL", { subject: null, body: null, script: "Ask about budget. {{Private Notes}}" }, "TEXT")!;
    expect(fromCall.body).not.toContain("Private");
    expect(fromCall.body).toContain("quick call");
    expect(generateVariant("TEXT", { subject: null, body: "Call me {{Private Notes}}", script: null }, "EMAIL")!.body).not.toContain("Private");
  });

  it("generates nothing without wording or for the primary's own family", () => {
    expect(generateVariant("TEXT", { subject: null, body: "  ", script: null }, "EMAIL")).toBeNull();
    expect(generateVariant("TEXT", text, "TEXT")).toBeNull();
    expect(talkingPoints("")).toContain("Agree the next step");
  });

  it("completes a follow-up with every family, keeping owner-written versions", () => {
    const snapshot = { channel: "SMS", body: text.body, variants: { EMAIL: { subject: "Mine", body: "My own email", script: null } } };
    const variants = variantsOfSnapshot(snapshot);
    expect(variants.EMAIL?.subject).toBe("Mine");
    expect(variants.CALL?.script).toContain("• Any questions I can clear up?");
    expect(ownerWrittenFamilies(snapshot)).toEqual(["EMAIL"]);
    expect(authoredFamilies("SMS", { channel: "SMS", body: text.body })).toEqual(["TEXT", "EMAIL", "CALL"]);
    expect(attemptChannelAllowed({ primaryChannel: "SMS", snapshot: { channel: "SMS", body: text.body }, channel: "EMAIL", family: "EMAIL", preferredChannel: null })).toBe(true);
  });
});

describe("recommended version", () => {
  const methods = { email: "sam@example.com", phone: "+15550100", preferredChannel: null };
  const prepared = preparedVariants({ channel: "SMS", template: text }, variantsOfSnapshot({ channel: "SMS", body: text.body }), methods);

  it("follows the person, then the owner, then the plan", () => {
    const usable = usableVariants(prepared, methods);
    expect(recommendedVariant(usable, { contactPreferred: "EMAIL", ownerPreferred: "PHONE_CALL", automaticPlan: false })?.family).toBe("EMAIL");
    expect(recommendedVariant(usable, { contactPreferred: null, ownerPreferred: "PHONE_CALL", automaticPlan: false })?.family).toBe("CALL");
    expect(recommendedVariant(usable, { contactPreferred: null, ownerPreferred: "RECOMMENDED", automaticPlan: false })?.family).toBe("TEXT");
  });

  it("never recommends a method the person can't receive", () => {
    const noEmail = usableVariants(prepared, { ...methods, email: null });
    expect(noEmail.map(item => item.family)).toEqual(["TEXT", "CALL"]);
    expect(recommendedVariant(noEmail, { contactPreferred: "EMAIL", ownerPreferred: null, automaticPlan: false })?.family).toBe("TEXT");
    const noPhone = usableVariants(prepared, { ...methods, phone: null });
    expect(noPhone.map(item => item.family)).toEqual(["EMAIL"]);
    expect(recommendedVariant(noPhone, { contactPreferred: "SMS", ownerPreferred: "PHONE_CALL", automaticPlan: false })?.family).toBe("EMAIL");
  });

  it("keeps the plan's channel when it would send automatically", () => {
    expect(recommendedVariant(usableVariants(prepared, methods), { contactPreferred: "EMAIL", ownerPreferred: null, automaticPlan: true })?.family).toBe("TEXT");
  });
});
