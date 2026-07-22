import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateEditableAiMixDraft } from "../src/lib/ai-mix-editable";
import { parseAiMixPreflight } from "../src/lib/ai-mix";

const read = (path: string) => readFileSync(path, "utf8");

function preflight(triggerMode: "DATE_TRIGGERED" | "MANUAL_START" = "DATE_TRIGGERED") {
  return parseAiMixPreflight({ objective: "Renewal preparation", tone: "Warm", framework: "Question-Led Consultative", triggerMode, dateTypeId: triggerMode === "DATE_TRIGGERED" ? "date-type" : null, dateTypeName: triggerMode === "DATE_TRIGGERED" ? "Renewal" : null, groupIds: ["group-one"], groupNames: ["Clients"], assignAllContacts: false, broadcastDate: null, broadcastTime: null, broadcastTimezone: "America/Los_Angeles", durationDays: 30, touches: 3, cadence: "BALANCED", channels: ["EMAIL", "PHONE_CALL"], productPlaceholder: null, productContext: null, industryContext: null, customContext: null, preferredSendTimeMinutes: 600, includeOptOut: false, quietHoursStart: 1200, quietHoursEnd: 480 });
}

const draft = { name: "Renewal preparation", description: "A relationship-centered sequence before and after the renewal date.", category: "Client Follow-Up", industry: "Other", framework: "Question-Led Consultative", durationDays: 30, steps: [{ name: "Prepare", channel: "EMAIL", dayOffset: -14, sendTimeMinutes: 600, subject: "A quick renewal question", body: "Hi {{First Name}}, what would be most useful before renewal?", script: null, longSms: false, includeOptOut: false }, { name: "Call", channel: "PHONE_CALL", dayOffset: -7, sendTimeMinutes: 600, subject: null, body: null, script: "Ask what has changed and what the next renewal should accomplish.", longSms: false, includeOptOut: false }] };

describe("Mix authoring convergence", () => {
  it("supports negative Important Date offsets while rejecting pre-manual actions", () => {
    const parsed = validateEditableAiMixDraft(draft, preflight());
    expect(parsed.steps.map((step) => step.dayOffset)).toEqual([-14, -7]);
    expect(parsed.durationDays).toBe(7);
    expect(() => validateEditableAiMixDraft(draft, preflight("MANUAL_START"))).toThrow(/before a manual start/i);
  });

  it("allows inline actions and indexes every server-bound field", () => {
    const editor = read("src/components/MixEditor.tsx");
    const action = read("src/lib/mix-editor-actions.ts");
    expect(editor).toContain("Write this action");
    expect(editor).toContain("Drag to reorder");
    for (const field of ["inlineName-${index}", "inlineChannel-${index}", "inlineSubject-${index}", "inlineBody-${index}", "inlineScript-${index}", "saveAsTemplate-${index}"]) expect(editor).toContain(field);
    expect(action).toContain("isActive: action.saveAsTemplate");
    expect(action).toContain("value(formData, `inlineName-${index}`");
  });

  it("uses one final AI review and one-screen template setup", () => {
    const wizard = read("src/components/AiMixWizardForm.tsx");
    const review = read("src/app/(app)/mixes/wizard/[draftId]/page.tsx");
    const steps = read("src/components/AiMixReviewSteps.tsx");
    const templates = read("src/app/(app)/templates/page.tsx");
    expect(wizard).toContain('objective === "Other"');
    expect(wizard).toContain('triggerMode === "BROADCAST"');
    expect(review).toContain('value="ACTIVE"');
    expect(review).toContain("Activate Mix");
    expect(steps).toContain("Drag to reorder");
    expect(steps).toContain("min={-durationDays}");
    expect(templates).toContain("Use template");
    expect(templates).toContain("/use`");
    expect(templates).not.toContain("Import Draft");
  });
});
