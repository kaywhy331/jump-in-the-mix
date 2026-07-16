import { describe, expect, it } from "vitest";
import {
  buildAiProviderRequest,
  extractAiProviderOutput,
  generateAiMix,
  generateDeterministicAiMix,
  parseAiMixPreflight,
  refineAiMix,
  validateAiMixDraft
} from "../src/lib/ai-mix";

function preflight() {
  return parseAiMixPreflight({
    objective: "Follow Up With New Leads",
    tone: "Warm",
    framework: "Question-Led Consultative",
    triggerMode: "MANUAL_START",
    dateTypeId: null,
    dateTypeName: null,
    groupIds: ["group-one"],
    groupNames: ["Leads"],
    assignAllContacts: false,
    broadcastDate: null,
    broadcastTime: null,
    broadcastTimezone: "America/Los_Angeles",
    durationDays: 14,
    touches: 5,
    cadence: "BALANCED",
    channels: ["EMAIL", "SMS", "PHONE_CALL"],
    productPlaceholder: "{{My Product 1}}",
    productContext: "Business Growth Consulting",
    industryContext: "Coaching / Consulting",
    customContext: "Focus on helpful discovery rather than a hard pitch.",
    preferredSendTimeMinutes: 600,
    includeOptOut: false,
    quietHoursStart: 1200,
    quietHoursEnd: 480
  });
}

describe("AI Mix generation", () => {
  it("creates the requested number of valid Jumps without automated-marketing opt-out copy", () => {
    const input = preflight();
    const draft = generateDeterministicAiMix(input);

    expect(draft.steps).toHaveLength(input.touches);
    expect(draft.durationDays).toBe(14);
    expect(draft.steps[0].dayOffset).toBe(0);
    expect(draft.steps.at(-1)?.dayOffset).toBe(14);
    for (const step of draft.steps) {
      expect(input.channels).toContain(step.channel);
      expect([step.subject, step.body, step.script].filter(Boolean).join("\n")).not.toMatch(/reply\s+stop|unsubscribe/i);
    }
    expect(validateAiMixDraft(draft, input, { requireRequestedTouches: true })).toEqual(draft);
  });

  it("rejects unsupported placeholders and Reply STOP language before persistence", () => {
    const input = preflight();
    const draft = generateDeterministicAiMix(input);
    const unknownPlaceholder = structuredClone(draft);
    unknownPlaceholder.steps[0].body = "Hi {{Secret Field}}, are you available?";
    expect(() => validateAiMixDraft(unknownPlaceholder, input)).toThrow(/unsupported placeholders/i);

    const spamCopy = structuredClone(draft);
    const sms = spamCopy.steps.find((step) => step.channel === "SMS")!;
    sms.body = "Hi {{First Name}}, checking in. Reply STOP to opt out.";
    expect(() => validateAiMixDraft(spamCopy, input)).toThrow(/Reply STOP/i);
  });

  it("builds a private structured-output request without Contact records", () => {
    const request = buildAiProviderRequest({ preflight: preflight() });
    expect(request.store).toBe(false);
    expect(request.text.format).toMatchObject({ type: "json_schema", strict: true });
    const serialized = JSON.stringify(request);
    expect(serialized).toContain("Question-Led Consultative");
    expect(serialized).toContain("Leads");
    expect(serialized).not.toContain("contact@example.com");
    expect(serialized).not.toContain("privateNotes");
  });

  it("extracts Responses API output text from the raw response envelope", () => {
    expect(extractAiProviderOutput({
      output: [{ type: "message", content: [{ type: "output_text", text: "{\"name\":\"Draft\"}" }] }]
    })).toBe("{\"name\":\"Draft\"}");
    expect(extractAiProviderOutput({ output: [] })).toBeNull();
  });

  it("uses the built-in strategist and preset refinement when no provider key is configured", async () => {
    const input = preflight();
    const generated = await generateAiMix(input);
    expect(generated.validation.provider).toBe("BUILT_IN");

    const originalSmsLength = generated.draft.steps.find((step) => step.channel === "SMS")?.body?.length ?? 0;
    const refined = await refineAiMix({
      preflightValue: input,
      draftValue: generated.draft,
      presetValue: "SHORTER",
      revision: generated.validation.revision
    });
    expect(refined.validation.revision).toBe(2);
    expect(refined.validation.provider).toBe("BUILT_IN");
    expect((refined.draft.steps.find((step) => step.channel === "SMS")?.body?.length ?? 0)).toBeLessThanOrEqual(originalSmsLength);
  });
});
