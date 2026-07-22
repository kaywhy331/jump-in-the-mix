import {
  parseAiMixPreflight,
  type AiMixDraftValidation,
  type AiMixGeneratedDraft,
  type AiMixPreflight,
  type AiMixRefinementPreset
} from "@/lib/ai-mix";
import { validateEditableAiMixDraft } from "@/lib/ai-mix-editable";

function shorten(value: string | null, maximum: number): string | null {
  if (!value || value.length <= maximum) return value;
  const clipped = value.slice(0, maximum).replace(/\s+\S*$/, "").trim();
  return `${clipped}…`;
}

function ensureQuestion(value: string | null): string | null {
  if (!value || value.includes("?")) return value;
  return `${value.trim()} What would be most useful from here?`;
}

function refineStep(step: AiMixGeneratedDraft["steps"][number], preset: AiMixRefinementPreset) {
  if (preset === "SHORTER") return { ...step, subject: shorten(step.subject, 80), body: shorten(step.body, step.channel === "SMS" ? 240 : 700), script: shorten(step.script, 700) };
  if (preset === "MORE_QUESTION_LED") return { ...step, body: ensureQuestion(step.body), script: ensureQuestion(step.script) };
  if (preset === "STRONGER_SUBJECTS" && step.channel === "EMAIL") {
    const subject = step.subject ?? "A quick question";
    return { ...step, subject: subject.includes("{{First Name}}") ? subject : `${subject}, {{First Name}}` };
  }
  if (preset === "MORE_DIRECT") {
    const direct = " Would a 15-minute conversation this week be useful?";
    return { ...step, body: step.body ? `${step.body.trim()}${direct}` : null, script: step.script ? `${step.script.trim()} Ask directly whether a 15-minute conversation this week would be useful.` : null };
  }
  if (preset === "MORE_FORMAL") {
    const formalize = (value: string | null) => value?.replaceAll("I'd", "I would").replaceAll("I'm", "I am").replaceAll("can't", "cannot").replaceAll("won't", "will not") ?? null;
    return { ...step, subject: formalize(step.subject), body: formalize(step.body), script: formalize(step.script) };
  }
  if (preset === "FRIENDLIER") {
    const friendly = (value: string | null) => value?.replace("There is no urgency", "No rush at all") ?? null;
    return { ...step, body: friendly(step.body), script: friendly(step.script) };
  }
  return step;
}

export function builtInAiMixRefinement(input: {
  preflightValue: unknown;
  draftValue: unknown;
  preset: AiMixRefinementPreset;
  customInstruction: string | null;
  revision: number;
}): { draft: AiMixGeneratedDraft; validation: AiMixDraftValidation } {
  const preflight: AiMixPreflight = parseAiMixPreflight(input.preflightValue);
  const current = validateEditableAiMixDraft(input.draftValue, preflight);
  const unchangedCustom = input.preset === "CUSTOM";
  const draft = unchangedCustom ? current : validateEditableAiMixDraft({ ...current, steps: current.steps.map((step) => refineStep(step, input.preset)) }, preflight);
  const warnings = [
    "Provider-backed refinement is disabled by a platform administrator; a built-in refinement was applied.",
    ...(unchangedCustom ? [input.customInstruction ? "Custom instructions require the connected provider; the review was left unchanged." : "Add a custom instruction before refining."] : [])
  ];
  return {
    draft,
    validation: {
      valid: true,
      provider: "BUILT_IN",
      model: null,
      warnings,
      generatedAt: new Date().toISOString(),
      revision: input.revision + 1
    }
  };
}
