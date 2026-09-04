"use server";

import { redirect } from "next/navigation";
import type { WeekendScheduling } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { parseTimeInput } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string, maximum = 500): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function fail(message: string): never {
  redirect(`/account/preferences?error=${encodeURIComponent(message)}`);
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function minutes(formData: FormData, key: string): number {
  const parsed = parseTimeInput(value(formData, key, 5));
  if (parsed === null) fail(`Choose a valid time for ${key}.`);
  return parsed;
}

export async function updatePersonalPreferencesAction(formData: FormData): Promise<void> {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) fail("Personal settings are unavailable during a view-only support session.");
  const name = value(formData, "name", 120);
  const locale = value(formData, "locale", 40) || "en-US";
  const timezone = value(formData, "timezone", 160);
  if (!name) fail("Enter your display name.");
  if (!validTimezone(timezone)) fail("Choose a valid IANA timezone.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { name } }),
    prisma.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, locale, timezone }, update: { locale, timezone } }),
    prisma.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "personal.preferences.update", entityType: "User", entityId: user.id, source: "account.preferences", metadata: { locale, timezone } } })
  ]);
  redirect("/account/preferences?personalSaved=1");
}

export async function updatePersonalSchedulingAction(formData: FormData): Promise<void> {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) fail("Personal settings are unavailable during a view-only support session.");
  const defaultFollowUpMinutes = minutes(formData, "defaultFollowUpTime");
  const quietHoursStart = minutes(formData, "quietHoursStart");
  const quietHoursEnd = minutes(formData, "quietHoursEnd");
  const weekendRaw = value(formData, "weekendScheduling", 30);
  const weekendScheduling: WeekendScheduling = ["KEEP", "NEXT_MONDAY", "PREVIOUS_FRIDAY"].includes(weekendRaw)
    ? weekendRaw as WeekendScheduling
    : "KEEP";
  await prisma.$transaction(async (tx) => {
    await tx.workspacePreference.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, defaultFollowUpMinutes, quietHoursStart, quietHoursEnd, weekendScheduling },
      update: { defaultFollowUpMinutes, quietHoursStart, quietHoursEnd, weekendScheduling }
    });
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: {} } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "personal.scheduling.update", entityType: "WorkspacePreference", entityId: workspace.id, source: "account.preferences", metadata: { defaultFollowUpMinutes, quietHoursStart, quietHoursEnd, weekendScheduling } } });
  });
  redirect("/account/preferences?schedulingSaved=1");
}
