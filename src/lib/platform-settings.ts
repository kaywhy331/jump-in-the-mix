import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { MIX_TEMPLATE_CATEGORIES, MIX_TEMPLATE_INDUSTRIES } from "@/lib/shared-mix";

export const PLATFORM_SETTING_DEFINITIONS = {
  "mix.categories": {
    category: "Mixes",
    label: "Mix categories",
    description: "Reviewed categories used to organize mixes and help customers find a useful starting point.",
    kind: "string-list",
    isPublic: true,
    defaultValue: [...MIX_TEMPLATE_CATEGORIES]
  },
  "mix.industries": {
    category: "Mixes",
    label: "Industries",
    description: "Reviewed business-type filters available in the ready-made mix library.",
    kind: "string-list",
    isPublic: true,
    defaultValue: [...MIX_TEMPLATE_INDUSTRIES]
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

function assertAllowedSubset(label: string, list: string[], allowed: readonly string[]): void {
  const unsupported = list.filter((item) => !allowed.includes(item));
  if (unsupported.length) throw new Error(`${label} may only use the reviewed values: ${allowed.join(", ")}.`);
}

export function validatePlatformSettingValue(key: PlatformSettingKey, value: unknown): Prisma.InputJsonValue {
  const definition = PLATFORM_SETTING_DEFINITIONS[key];
  const list = uniqueStrings(value);
  if (!list.length) throw new Error(`${definition.label} needs at least one option.`);
  if (list.length > 100) throw new Error(`${definition.label} may contain at most 100 options.`);
  if (key === "mix.categories") assertAllowedSubset(definition.label, list, MIX_TEMPLATE_CATEGORIES);
  if (key === "mix.industries") assertAllowedSubset(definition.label, list, MIX_TEMPLATE_INDUSTRIES);
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
