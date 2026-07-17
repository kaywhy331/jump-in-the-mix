"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  PLATFORM_SETTING_DEFINITIONS,
  type PlatformSettingKey,
  validatePlatformSettingValue
} from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function settingKey(raw: string): PlatformSettingKey {
  if (!(raw in PLATFORM_SETTING_DEFINITIONS)) throw new Error("Unknown platform setting.");
  return raw as PlatformSettingKey;
}

function listValue(raw: string): string[] {
  return raw
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function auditPlatformSetting(input: {
  actorUserId: string;
  workspaceId: string | null;
  action: string;
  key: string;
  beforeData?: unknown;
  afterData?: unknown;
}) {
  if (!input.workspaceId) return;
  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorType: "ADMIN",
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: "PlatformSetting",
      entityId: input.key,
      source: "admin.settings",
      beforeData: input.beforeData as never,
      afterData: input.afterData as never
    }
  });
}

export async function savePlatformSettingAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdmin();
  const key = settingKey(value(formData, "key"));
  const definition = PLATFORM_SETTING_DEFINITIONS[key];
  const nextValue = validatePlatformSettingValue(
    key,
    definition.kind === "boolean" ? formData.get("enabled") === "on" : listValue(value(formData, "options"))
  );
  const existing = await prisma.platformSetting.findUnique({ where: { key } });
  await prisma.platformSetting.upsert({
    where: { key },
    create: {
      key,
      category: definition.category,
      label: definition.label,
      description: definition.description,
      value: nextValue,
      isPublic: definition.isPublic,
      updatedByUserId: user.id
    },
    update: {
      category: definition.category,
      label: definition.label,
      description: definition.description,
      value: nextValue,
      isPublic: definition.isPublic,
      updatedByUserId: user.id
    }
  });
  await auditPlatformSetting({
    actorUserId: user.id,
    workspaceId: user.memberships[0]?.workspaceId ?? null,
    action: "admin.platform-setting.update",
    key,
    beforeData: existing?.value,
    afterData: nextValue
  });
  revalidatePath("/admin/settings");
  revalidatePath("/mixes/new");
  revalidatePath("/templates");
  revalidatePath("/mixes/wizard");
}

export async function resetPlatformSettingAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdmin();
  const key = settingKey(value(formData, "key"));
  const existing = await prisma.platformSetting.findUnique({ where: { key } });
  if (!existing) return;
  await prisma.platformSetting.delete({ where: { key } });
  await auditPlatformSetting({
    actorUserId: user.id,
    workspaceId: user.memberships[0]?.workspaceId ?? null,
    action: "admin.platform-setting.reset",
    key,
    beforeData: existing.value,
    afterData: PLATFORM_SETTING_DEFINITIONS[key].defaultValue
  });
  revalidatePath("/admin/settings");
  revalidatePath("/mixes/new");
  revalidatePath("/templates");
  revalidatePath("/mixes/wizard");
}
