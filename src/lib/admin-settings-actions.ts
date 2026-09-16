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

class SettingConflict extends Error {}
async function checkSettingRevision(tx: Prisma.TransactionClient, key: string, formData: FormData) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-setting:${key}`}))`;
  const existing = await tx.platformSetting.findUnique({ where: { key } });
  if (value(formData, "expectedRevision") !== (existing?.updatedAt.toISOString() ?? "default")) {
    throw new SettingConflict("These options changed while you were editing. Load the current values, review them, then apply your retained selection.");
  }
  return existing;
}

function revalidateSettingConsumers(): void {
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/mixes/new");
  revalidatePath("/mixes");
  revalidatePath("/templates");
}

export async function savePlatformSettingAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdmin("settings.manage");
  const key = settingKey(value(formData, "key"));
  const definition = PLATFORM_SETTING_DEFINITIONS[key];
  const nextValue = validatePlatformSettingValue(
    key,
    listValue(value(formData, "options"))
  );
  const auditWorkspaceId = user.memberships[0]?.workspaceId ?? null;

  await prisma.$transaction(async (tx) => {
    const existing = await checkSettingRevision(tx, key, formData);
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
    await tx.platformAuditEvent.create({ data: { actorUserId: user.id, action: "platform-setting.change", entityType: "PlatformSetting", entityId: key } });
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
  const { user } = await requirePlatformAdmin("settings.manage");
  const key = settingKey(value(formData, "key"));
  const auditWorkspaceId = user.memberships[0]?.workspaceId ?? null;

  await prisma.$transaction(async (tx) => {
    const existing = await checkSettingRevision(tx, key, formData);
    if (!existing) return;
    await tx.platformSetting.delete({ where: { key } });
    await tx.platformAuditEvent.create({ data: { actorUserId: user.id, action: "platform-setting.change", entityType: "PlatformSetting", entityId: key } });
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

export async function updateLibraryOptionsAction(_previous: { error?: string; saved?: string }, formData: FormData): Promise<{ error?: string; saved?: string; options?: string[]; revision?: string }> {
  await requirePlatformAdmin("settings.manage");
  let key: PlatformSettingKey;
  try {
    key = settingKey(value(formData, "key"));
    if (formData.get("operation") !== "reset") validatePlatformSettingValue(key, listValue(value(formData, "options")));
  } catch (error) { return { error: error instanceof Error ? error.message : "Choose at least one reviewed option." }; }
  try {
    if (formData.get("operation") === "reset") await resetPlatformSettingAction(formData);
    else await savePlatformSettingAction(formData);
  } catch (error) { if (error instanceof SettingConflict) return { error: error.message }; throw error; }
  const current = await prisma.platformSetting.findUnique({ where: { key }, select: { updatedAt: true } });
  return { revision: current?.updatedAt.toISOString() ?? "default", saved: formData.get("operation") === "reset" ? "Reviewed defaults restored." : "Library options saved.", options: formData.get("operation") === "reset" ? [...PLATFORM_SETTING_DEFINITIONS[key].defaultValue] : listValue(value(formData, "options")) };
}
