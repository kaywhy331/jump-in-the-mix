import { describe, expect, it } from "vitest";
import { generateMixDraft } from "../src/lib/mix-generator";

describe("AI Mix Wizard deterministic draft", () => {
  it("creates the requested number of ordered touches within the selected duration", () => {
    const draft = generateMixDraft({
      objective: "Referral Follow-Up",
      tone: "Warm",
      durationDays: 14,
      touches: 5,
      channels: ["EMAIL", "SMS", "PHONE_CALL"],
      productPlaceholder: "{{My Product 1}}"
    });

    expect(draft.steps).toHaveLength(5);
    expect(draft.steps[0]?.dayOffset).toBe(0);
    expect(draft.steps.at(-1)?.dayOffset).toBe(14);
    expect(draft.steps.every((step, index, steps) => index === 0 || step.dayOffset >= steps[index - 1].dayOffset)).toBe(true);
  });

  it("keeps sender names out of messages that already use signatures", () => {
    const draft = generateMixDraft({
      objective: "Client Check-In",
      tone: "Conversational",
      durationDays: 7,
      touches: 3,
      channels: ["EMAIL", "SMS"],
      productPlaceholder: "{{My Product 1}}"
    });

    const text = draft.steps.map((step) => `${step.subject ?? ""} ${step.body ?? ""}`).join(" ");
    expect(text).not.toContain("{{My First Name}}");
    expect(text).toContain("Signature}}");
  });
});
