import { describe, expect, it } from "vitest";
import { attemptChannelAllowed, authoredFamilies, authoredVariant, offersChoice, preparedVariants, selectedVariant, textChannelFor, usableVariants, variantChannels, variantFieldsForFamily, variantTemplatesOf, variantsOfSnapshot } from "@/lib/preparation-variants";

const text = { subject: null, body: "Hi {{First Name}}, quick text.", script: null };
const email = { subject: "Your estimate", body: "Hi {{First Name}}, the estimate is attached.", script: null };
const call = { subject: null, body: null, script: "Ask about the timeline. {{Private Notes}}" };
const methods = { email: "casey@example.com", phone: "+15550100600", preferredChannel: null };

describe("channel alternatives", () => {
  it("counts a variant as authored only when its family's wording is present, and keeps only that family's fields", () => {
    expect(authoredVariant("TEXT", text)).toBe(true);
    expect(authoredVariant("TEXT", { subject: "x", body: "  ", script: "notes" })).toBe(false);
    expect(authoredVariant("EMAIL", { ...email, subject: null })).toBe(true);
    expect(authoredVariant("CALL", call)).toBe(true);
    expect(authoredVariant("CALL", { ...call, script: "" })).toBe(false);
    expect(authoredVariant("CALL", null)).toBe(false);
    // Private call notes never become a body; outward wording never becomes notes.
    expect(variantFieldsForFamily("CALL", { subject: "s", body: "outward", script: "private" })).toEqual({ subject: null, body: null, script: "private" });
    expect(variantFieldsForFamily("TEXT", { subject: "s", body: "outward", script: "private" })).toEqual({ subject: null, body: "outward", script: null });
    expect(variantFieldsForFamily("EMAIL", { subject: "s", body: "outward", script: "private" })).toEqual({ subject: "s", body: "outward", script: null });
  });

  it("reads authored variants from a snapshot and writes only authored rows to one", () => {
    expect(variantsOfSnapshot({ body: "primary", variants: { EMAIL: email, CALL: { script: " " }, TEXT: "nonsense" } })).toEqual({ EMAIL: email });
    expect(variantsOfSnapshot({ body: "primary" })).toEqual({});
    expect(variantsOfSnapshot(null)).toEqual({});
    expect(variantTemplatesOf([{ family: "EMAIL", ...email }, { family: "CALL", subject: null, body: null, script: null }])).toEqual({ EMAIL: email });
    expect(variantTemplatesOf([])).toBeUndefined();
  });

  it("offers the plan's own channel first, then authored alternatives with the channel a handoff would use", () => {
    const prepared = preparedVariants({ channel: "SMS", template: text }, { EMAIL: email, CALL: call, TEXT: { ...text, body: "ignored: the plan owns this family" } }, methods);
    expect(prepared.map((item) => [item.family, item.channel, item.primary])).toEqual([["TEXT", "SMS", true], ["EMAIL", "EMAIL", false], ["CALL", "PHONE_CALL", false]]);
    expect(prepared[0].template).toBe(text);
    // WhatsApp only on the person's explicit preference, and only for an alternative text.
    expect(textChannelFor({ preferredChannel: "WHATSAPP" })).toBe("WHATSAPP");
    expect(textChannelFor({ preferredChannel: "SMS" })).toBe("SMS");
    expect(textChannelFor({ preferredChannel: null })).toBe("SMS");
    const fromEmail = preparedVariants({ channel: "EMAIL", template: email }, { TEXT: text }, { preferredChannel: "WHATSAPP" });
    expect(fromEmail.map((item) => item.channel)).toEqual(["EMAIL", "WHATSAPP"]);
    expect(variantChannels("TEXT", { preferredChannel: null })).toEqual(["SMS"]);
    expect(variantChannels("TEXT", { preferredChannel: "WHATSAPP" })).toEqual(["SMS", "WHATSAPP"]);
    expect(variantChannels("EMAIL", { preferredChannel: "WHATSAPP" })).toEqual(["EMAIL"]);
    expect(variantChannels("CALL", { preferredChannel: null })).toEqual(["PHONE_CALL"]);
  });

  it("keeps only variants the person can actually receive, hides the switcher without a real choice, and falls back in order", () => {
    const prepared = preparedVariants({ channel: "SMS", template: text }, { EMAIL: email, CALL: call }, methods);
    expect(usableVariants(prepared, methods).map((item) => item.family)).toEqual(["TEXT", "EMAIL", "CALL"]);
    expect(offersChoice(usableVariants(prepared, methods))).toBe(true);
    const noEmail = usableVariants(prepared, { ...methods, email: null });
    expect(noEmail.map((item) => item.family)).toEqual(["TEXT", "CALL"]);
    const noPhone = usableVariants(prepared, { ...methods, phone: null });
    expect(noPhone.map((item) => item.family)).toEqual(["EMAIL"]);
    expect(offersChoice(noPhone)).toBe(false);
    // The owner's choice wins while usable; the plan's own channel is the fallback; then the first usable alternative.
    expect(selectedVariant(usableVariants(prepared, methods), "EMAIL")?.family).toBe("EMAIL");
    expect(selectedVariant(usableVariants(prepared, methods), null)?.family).toBe("TEXT");
    expect(selectedVariant(noEmail, "EMAIL")?.family).toBe("TEXT");
    expect(selectedVariant(noPhone, "CALL")?.family).toBe("EMAIL");
    expect(selectedVariant([], "TEXT")).toBeNull();
    // A single-channel plan never offers a choice.
    const single = usableVariants(preparedVariants({ channel: "SMS", template: text }, {}, methods), methods);
    expect(single.map((item) => item.family)).toEqual(["TEXT"]);
    expect(offersChoice(single)).toBe(false);
  });

  it("accepts drafts and attempts only for the plan's family or an authored alternative, on that alternative's channels", () => {
    const snapshot = { body: "primary", variants: { EMAIL: email, CALL: call } };
    expect(authoredFamilies("SMS", snapshot)).toEqual(["TEXT", "EMAIL", "CALL"]);
    expect(authoredFamilies("SMS", { body: "primary" })).toEqual(["TEXT"]);
    expect(authoredFamilies("PHONE_CALL", { script: "notes", variants: { TEXT: text } })).toEqual(["CALL", "TEXT"]);
    const allowed = (channel: "SMS" | "EMAIL" | "PHONE_CALL" | "VOICEMAIL" | "WHATSAPP", family: "TEXT" | "EMAIL" | "CALL", preferredChannel: "WHATSAPP" | null = null) =>
      attemptChannelAllowed({ primaryChannel: "SMS", snapshot, channel, family, preferredChannel });
    expect(allowed("SMS", "TEXT")).toBe(true);
    expect(allowed("EMAIL", "EMAIL")).toBe(true);
    expect(allowed("PHONE_CALL", "CALL")).toBe(true);
    expect(allowed("VOICEMAIL", "CALL")).toBe(false);
    expect(allowed("WHATSAPP", "TEXT")).toBe(false);
    expect(allowed("EMAIL", "TEXT")).toBe(false);
    // An alternative text may go by WhatsApp only when the person prefers it; the plan's own SMS never becomes WhatsApp on its own.
    expect(attemptChannelAllowed({ primaryChannel: "EMAIL", snapshot: { variants: { TEXT: text } }, channel: "WHATSAPP", family: "TEXT", preferredChannel: "WHATSAPP" })).toBe(true);
    expect(attemptChannelAllowed({ primaryChannel: "EMAIL", snapshot: { variants: { TEXT: text } }, channel: "WHATSAPP", family: "TEXT", preferredChannel: null })).toBe(false);
    expect(attemptChannelAllowed({ primaryChannel: "EMAIL", snapshot: { variants: {} }, channel: "SMS", family: "TEXT", preferredChannel: null })).toBe(false);
  });
});
