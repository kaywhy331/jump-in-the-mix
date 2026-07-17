import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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
      "Follow Up With New Leads",
      "Book Calls",
      "Onboard New Clients",
      "Renewals and Retention",
      "Re-engage Dormant Contacts",
      "Event Follow-up",
      "Upsell or Cross-sell",
      "Other"
    ]
  },
  "ai.tones": {
    category: "AI Mix Wizard",
    label: "AI tones",
    description: "Tone choices available to the AI Mix Wizard.",
    kind: "string-list",
    isPublic: true,
    defaultValue: ["Warm", "Professional", "Friendly", "Direct", "Consultative", "Concise"]
  },
  "ai.frameworks": {
    category: "AI Mix Wizard",
    label: "AI strategic frameworks",
    description: "Framework labels used to guide AI-generated Mix structure and copy.",
    kind: "string-list",
    isPublic: true,
    defaultValue: [
      "Question-Led Consultative",
      "SPIN Selling",
      "Challenger Sale",
      "Sandler System",
      "AIDA",
      "PAS",
      "Customer Onboarding",
      "Renewal Value Review",
      "Other"
    ]
  },
  "ai.refinementReasons": {
    category: "AI Mix Wizard",
    label: "AI refinement reasons",
    description: "Preset instructions offered when requesting a different AI option.",
    kind: "string-list",
    isPublic: true,
    defaultValue: [
      "Make it friendlier",
      "Make it more formal",
      "Shorten SMS messages",
      "Make it more consultative",
      "Use stronger curiosity",
      "Create stronger subject lines",
      "Try a different strategic approach"
    ]
  },
  "feature.promotionalProTrial": {
    category: "Feature flags",
    label: "Promotional Pro trial",
    description: "Allows eligible registration and onboarding flows to advertise a promotional Pro trial.",
    kind: "boolean",
    isPublic: false,
    defaultValue: false
  },
  "feature.communityTemplates": {
    category: "Feature flags",
    label: "Community Mix Templates",
    description: "Controls public discovery and new Community Mix submissions without deleting existing history.",
    kind: "boolean",
    isPublic: false,
    defaultValue: true
  },
  "feature.aiProviderGeneration": {
    category: "Feature flags",
    label: "Provider-backed AI generation",
    description: "Allows configured external AI generation; the deterministic strategist remains available as a fallback.",
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
