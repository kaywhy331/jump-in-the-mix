"use server";

import { redirect } from "next/navigation";
import type { WeekendScheduling } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { parseTimeInput } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string, maximum = 500): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

function fail(message: string): never {
  redirect(`/account/preferences?error=${encodeURIComponent(message)}`);
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function minutes(formData: FormData, key: string): number {
  const raw = value(formData, key, 5);
  const parsed = parseTimeInput(raw);
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
    prisma.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, locale, timezone, activeWorkspaceId: workspace.id }, update: { locale, timezone } }),
    prisma.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "user.preferences.update", entityType: "User", entityId: user.id, source: "account.preferences", metadata: { locale, timezone } } })
  ]);
  redirect("/account/preferences?personalSaved=1");
}

export async function updateNotificationPreferencesAction(formData: FormData): Promise<void> {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) fail("Notification settings are unavailable during a view-only support session.");
  const digestMinutes = minutes(formData, "digestTime");
  const data = {
    emailEnabled: checked(formData, "emailEnabled"),
    inAppEnabled: checked(formData, "inAppEnabled"),
    dailyDigest: checked(formData, "dailyDigest"),
    overdueReminders: checked(formData, "overdueReminders"),
    upcomingDates: checked(formData, "upcomingDates"),
    integrationFailures: checked(formData, "integrationFailures"),
    importComplete: checked(formData, "importComplete"),
    supportReplies: checked(formData, "supportReplies"),
    billingAlerts: checked(formData, "billingAlerts"),
    securityAlerts: checked(formData, "securityAlerts"),
    digestMinutes
  };
  await prisma.$transaction([
    prisma.notificationPreference.upsert({ where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } }, create: { userId: user.id, workspaceId: workspace.id, ...data }, update: data }),
    prisma.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "user.notifications.update", entityType: "NotificationPreference", entityId: `${user.id}:${workspace.id}`, source: "account.preferences", metadata: data } })
  ]);
  redirect("/account/preferences?notificationsSaved=1");
}

export async function updateWorkspaceSchedulingAction(formData: FormData): Promise<void> {
  const { user, workspace, membership, impersonation } = await requireWorkspace();
  if (impersonation || !["OWNER", "ADMIN"].includes(membership.role)) fail("Only workspace owners and administrators can change scheduling defaults.");
  const defaultFollowUpMinutes = minutes(formData, "defaultFollowUpTime");
  const quietHoursStart = minutes(formData, "quietHoursStart");
  const quietHoursEnd = minutes(formData, "quietHoursEnd");
  const weekendRaw = value(formData, "weekendScheduling", 30);
  const weekendScheduling: WeekendScheduling = ["KEEP", "NEXT_MONDAY", "PREVIOUS_FRIDAY"].includes(weekendRaw) ? weekendRaw as WeekendScheduling : "KEEP";
  await prisma.$transaction(async (tx) => {
    await tx.workspacePreference.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, defaultFollowUpMinutes, quietHoursStart, quietHoursEnd, weekendScheduling },
      update: { defaultFollowUpMinutes, quietHoursStart, quietHoursEnd, weekendScheduling }
    });
    await tx.workspaceProfile.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, timezone: workspace.profile?.timezone ?? "UTC", quietHoursStart, quietHoursEnd },
      update: { quietHoursStart, quietHoursEnd }
    });
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: {} } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "workspace.scheduling.update", entityType: "WorkspacePreference", entityId: workspace.id, source: "account.preferences", metadata: { defaultFollowUpMinutes, quietHoursStart, quietHoursEnd, weekendScheduling } } });
  });
  redirect("/account/preferences?schedulingSaved=1");
}
