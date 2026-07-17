"use server";

import type { Prisma } from "@/generated/prisma/client";
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
  if (!Object.prototype.hasOwnProperty.call(PLATFORM_SETTING_DEFINITIONS, raw)) {
    throw new Error("Unknown platform setting.");
  }
  return raw as PlatformSettingKey;
}

function listValue(raw: string): string[] {
  return raw
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function jsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function revalidateSettingConsumers(): void {
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/mixes/new");
  revalidatePath("/mixes");
  revalidatePath("/templates");
  revalidatePath("/mixes/wizard");
}

export async function savePlatformSettingAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdmin();
  const key = settingKey(value(formData, "key"));
  const definition = PLATFORM_SETTING_DEFINITIONS[key];
  const nextValue = validatePlatformSettingValue(
    key,
    definition.kind === "boolean" ? formData.get("enabled") === "on" : listValue(value(formData, "options"))
  );
  const auditWorkspaceId = user.memberships[0]?.workspaceId ?? null;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.platformSetting.findUnique({ where: { key } });
    await tx.platformSetting.upsert({
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
    if (auditWorkspaceId) {
      await tx.auditLog.create({
        data: {
          workspaceId: auditWorkspaceId,
          actorType: "ADMIN",
          actorUserId: user.id,
          action: "admin.platform-setting.update",
          entityType: "PlatformSetting",
          entityId: key,
          source: "admin.settings",
          beforeData: jsonInput(existing?.value),
          afterData: nextValue
        }
      });
    }
  });
  revalidateSettingConsumers();
}

export async function resetPlatformSettingAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdmin();
  const key = settingKey(value(formData, "key"));
  const auditWorkspaceId = user.memberships[0]?.workspaceId ?? null;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.platformSetting.findUnique({ where: { key } });
    if (!existing) return;
    await tx.platformSetting.delete({ where: { key } });
    if (auditWorkspaceId) {
      await tx.auditLog.create({
        data: {
          workspaceId: auditWorkspaceId,
          actorType: "ADMIN",
          actorUserId: user.id,
          action: "admin.platform-setting.reset",
          entityType: "PlatformSetting",
          entityId: key,
          source: "admin.settings",
          beforeData: jsonInput(existing.value),
          afterData: jsonInput(PLATFORM_SETTING_DEFINITIONS[key].defaultValue)
        }
      });
    }
  });
  revalidateSettingConsumers();
}
