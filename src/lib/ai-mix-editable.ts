import type { Channel } from "@/generated/prisma/client";
import { z } from "zod";
import {
  AI_MIX_CHANNELS,
  type AiMixGeneratedDraft,
  type AiMixPreflight
} from "@/lib/ai-mix";
import { containsPrivateNotesPlaceholder, findUnknownPlaceholders } from "@/lib/placeholders";
import { MIX_TEMPLATE_CATEGORIES, MIX_TEMPLATE_INDUSTRIES } from "@/lib/shared-mix";

const editableStepSchema = z.object({
  name: z.string().trim().min(1).max(160),
  channel: z.enum(AI_MIX_CHANNELS),
  dayOffset: z.number().int().min(-365).max(365),
  sendTimeMinutes: z.number().int().min(0).max(1439).nullable(),
  subject: z.string().trim().min(1).max(300).nullable(),
  body: z.string().trim().min(1).max(20_000).nullable(),
  script: z.string().trim().min(1).max(20_000).nullable(),
  longSms: z.boolean(),
  includeOptOut: z.boolean()
}).strict();

const editableDraftSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(20).max(1200),
  category: z.enum(MIX_TEMPLATE_CATEGORIES),
  industry: z.enum(MIX_TEMPLATE_INDUSTRIES),
  framework: z.string().trim().min(2).max(160),
  durationDays: z.number().int().min(0).max(730),
  steps: z.array(editableStepSchema).min(1).max(7)
}).strict();

function containsProhibitedOptOutLanguage(value: string | null): boolean {
  if (!value) return false;
  return /(reply|text)\s+["']?stop|stop\s+to\s+(opt|unsubscribe)|unsubscribe\s+by/i.test(value);
}

function validateStepContent(step: z.infer<typeof editableStepSchema>, index: number): void {
  if (step.channel === "EMAIL" && (!step.subject || !step.body)) throw new Error(`Action #${index + 1} requires an email subject and body.`);
  if (["SMS", "WHATSAPP"].includes(step.channel) && !step.body) throw new Error(`Action #${index + 1} requires a prepared message.`);
  if (["PHONE_CALL", "VOICEMAIL"].includes(step.channel) && !step.script) throw new Error(`Action #${index + 1} requires call or voicemail notes.`);
  const content = [step.subject, step.body, step.script].filter(Boolean).join("\n");
  const unknown = findUnknownPlaceholders(content);
  if (unknown.length) throw new Error(`Action #${index + 1} uses unsupported placeholders: ${unknown.join(", ")}.`);
  if (step.channel !== "PHONE_CALL" && containsPrivateNotesPlaceholder(content)) {
    throw new Error(`Action #${index + 1} uses private relationship updates outside a Phone Call.`);
  }
  if (step.channel === "SMS" && containsProhibitedOptOutLanguage(step.body)) {
    throw new Error(`Action #${index + 1} contains automated-marketing opt-out language. Personal SMS actions must not include “Reply STOP” copy.`);
  }
}

export function validateEditableAiMixDraft(value: unknown, preflight: AiMixPreflight): AiMixGeneratedDraft {
  const parsed = editableDraftSchema.parse(value);
  for (const [index, step] of parsed.steps.entries()) {
    if (!preflight.channels.includes(step.channel as Channel)) {
      throw new Error(`Action #${index + 1} uses ${step.channel}, which was not selected in the wizard.`);
    }
    if (Math.abs(step.dayOffset) > preflight.durationDays) {
      throw new Error(`Action #${index + 1} falls outside the selected ${preflight.durationDays}-day planning window.`);
    }
    if (preflight.triggerMode === "MANUAL_START" && step.dayOffset < 0) {
      throw new Error(`Action #${index + 1} cannot occur before a manual start. Use day zero or later.`);
    }
    validateStepContent(step, index);
  }
  const offsets = parsed.steps.map((step) => step.dayOffset);
  const durationDays = Math.max(...offsets) - Math.min(...offsets);
  return {
    ...parsed,
    durationDays,
    steps: parsed.steps.map((step) => ({
      ...step,
      sendTimeMinutes: step.sendTimeMinutes ?? preflight.preferredSendTimeMinutes,
      longSms: step.channel === "SMS" && (step.body?.length ?? 0) > 160,
      includeOptOut: step.channel === "SMS" && preflight.includeOptOut && step.includeOptOut
    }))
  };
}
