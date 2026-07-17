import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const AI_TONE_VALUES = ["Warm", "Professional", "Conversational", "Direct"] as const;

export const PLATFORM_SETTING_DEFINITIONS = {
  "mix.categories": {
    category: "Mixes and Templates",
    label: "Mix categories",
    description: "Categories available when organizing Mixes and publishing Mix Templates.",
    kind: "string-list",
    isPublic: true,
    defaultValue: [
      "Business",
      "Sales & Prospecting",
      "Client Success / Retention",
      "Events & Networking",
      "Personal / Relationships",
      "Marketing Campaigns",
      "General / Other"
    ]
  },
  "mix.industries": {
    category: "Mixes and Templates",
    label: "Industries",
    description: "Industry filters available on Mixes and Mix Templates.",
    kind: "string-list",
    isPublic: true,
    defaultValue: [
      "Real Estate",
      "Insurance",
      "Finance",
      "Healthcare",
      "Contractors / Home Services",
      "Coaching / Consulting",
      "Nonprofit",
      "General / Other"
    ]
  },
  "ai.objectives": {
    category: "AI Mix Wizard",
    label: "AI objectives",
    description: "Primary objectives offered in the AI Mix Wizard.",
    kind: "string-list",
    isPublic: true,
    defaultValue: [
      "Book Discovery Calls",
      "Follow Up With New Leads",
      "Client Onboarding",
      "Renewal and Retention",
      "Re-engage Past Contacts",
      "Referral Outreach",
      "Event Follow-Up",
      "Upsell or Cross-sell",
      "General Check-In",
      "Other"
    ]
  },
  "ai.tones": {
    category: "AI Mix Wizard",
    label: "AI tones",
    description: "Reviewed tone choices available to the AI Mix Wizard. These can be reordered or hidden without changing the generation schema.",
    kind: "string-list",
    isPublic: true,
    defaultValue: [...AI_TONE_VALUES]
  },
  "ai.frameworks": {
    category: "AI Mix Wizard",
    label: "AI strategic frameworks",
    description: "Framework labels used to guide AI-generated Mix structure and copy.",
    kind: "string-list",
    isPublic: true,
    defaultValue: [
      "Question-Led Consultative",
      "Problem, Impact, Next Step",
      "Teaching-Led Reframe",
      "Mutual Qualification",
      "SPIN Selling",
      "Challenger Sale",
      "Sandler System",
      "AIDA",
      "Relationship Nurture",
      "Other"
    ]
  },
  "ai.refinementReasons": {
    category: "AI Mix Wizard",
    label: "AI refinement reasons",
    description: "Human-readable guidance used beside the built-in refinement controls.",
    kind: "string-list",
    isPublic: true,
    defaultValue: [
      "Make it friendlier",
      "Make it more formal",
      "Shorten every message",
      "Use more question-led language",
      "Make the next step more direct",
      "Strengthen email subject lines",
      "Use a custom instruction"
    ]
  },
  "feature.communityTemplates": {
    category: "Feature flags",
    label: "Community Mix Templates",
    description: "Controls public Community discovery without deleting submissions, votes, imports, or moderation history.",
    kind: "boolean",
    isPublic: false,
    defaultValue: true
  },
  "feature.aiProviderGeneration": {
    category: "Feature flags",
    label: "Provider-backed AI draft generation",
    description: "Controls new external-provider draft generation. The built-in strategist remains available when this is disabled.",
    kind: "boolean",
    isPublic: false,
    defaultValue: true
  }
} as const;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTING_DEFINITIONS;
export type PlatformSettingKind = (typeof PLATFORM_SETTING_DEFINITIONS)[PlatformSettingKey]["kind"];

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const next = item.trim().slice(0, 120);
    const normalized = next.toLocaleLowerCase();
    if (!next || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(next);
  }
  return result;
}

export function validatePlatformSettingValue(key: PlatformSettingKey, value: unknown): Prisma.InputJsonValue {
  const definition = PLATFORM_SETTING_DEFINITIONS[key];
  if (definition.kind === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${definition.label} must be enabled or disabled.`);
    return value;
  }
  const list = uniqueStrings(value);
  if (!list.length) throw new Error(`${definition.label} needs at least one option.`);
  if (list.length > 100) throw new Error(`${definition.label} may contain at most 100 options.`);
  if (key === "ai.tones") {
    const unsupported = list.filter((item) => !AI_TONE_VALUES.includes(item as typeof AI_TONE_VALUES[number]));
    if (unsupported.length) {
      throw new Error(`AI tones may only use the reviewed values: ${AI_TONE_VALUES.join(", ")}.`);
    }
  }
  return list;
}

export function defaultPlatformSettingValue(key: PlatformSettingKey): Prisma.InputJsonValue {
  return PLATFORM_SETTING_DEFINITIONS[key].defaultValue as Prisma.InputJsonValue;
}

export async function getPlatformSettingValue(key: PlatformSettingKey): Promise<unknown> {
  const stored = await prisma.platformSetting.findUnique({ where: { key }, select: { value: true } });
  return stored?.value ?? PLATFORM_SETTING_DEFINITIONS[key].defaultValue;
}

export async function getPlatformStringList(key: PlatformSettingKey): Promise<string[]> {
  const definition = PLATFORM_SETTING_DEFINITIONS[key];
  if (definition.kind !== "string-list") throw new Error(`${key} is not a string-list setting.`);
  const stored = uniqueStrings(await getPlatformSettingValue(key));
  return stored.length ? stored : [...definition.defaultValue];
}

export async function getPlatformBoolean(key: PlatformSettingKey): Promise<boolean> {
  const definition = PLATFORM_SETTING_DEFINITIONS[key];
  if (definition.kind !== "boolean") throw new Error(`${key} is not a boolean setting.`);
  const stored = await getPlatformSettingValue(key);
  return typeof stored === "boolean" ? stored : definition.defaultValue;
}

export async function getPlatformSettingsSnapshot() {
  const keys = Object.keys(PLATFORM_SETTING_DEFINITIONS) as PlatformSettingKey[];
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return keys.map((key) => {
    const definition = PLATFORM_SETTING_DEFINITIONS[key];
    const row = byKey.get(key);
    return {
      key,
      ...definition,
      value: row?.value ?? definition.defaultValue,
      isCustomized: Boolean(row),
      updatedAt: row?.updatedAt ?? null,
      updatedByUserId: row?.updatedByUserId ?? null
    };
  });
}
