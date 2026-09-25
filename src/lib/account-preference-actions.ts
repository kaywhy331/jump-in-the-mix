"use server";
import { captureFormFailure, recoverableFormAction, type FormResult } from "@/lib/form-errors";

import { redirect } from "next/navigation";
import type { WeekendScheduling } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { APPOINTMENT_BUFFER_CHOICES, normalizeBufferMinutes } from "@/lib/calendar-availability";
import { DEFAULT_LOCALE, isDisplayLocale } from "@/lib/display-preferences";
import { parseTimeInput } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string, maximum = 500): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function fail(message: string): never {
  captureFormFailure(message);
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
  const locale = value(formData, "locale", 40) || DEFAULT_LOCALE;
  const timezone = value(formData, "timezone", 160);
  if (!name) fail("Enter your display name.");
  if (!isDisplayLocale(locale)) fail("Choose one of the listed locales.");
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
  const appointmentBufferMinutes = normalizeBufferMinutes(value(formData, "appointmentBufferMinutes", 4));
  if (!(APPOINTMENT_BUFFER_CHOICES as readonly number[]).includes(appointmentBufferMinutes)) fail("Choose one of the listed appointment buffers.");
  await prisma.$transaction(async (tx) => {
    await tx.workspacePreference.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, defaultFollowUpMinutes, quietHoursStart, quietHoursEnd, weekendScheduling, appointmentBufferMinutes },
      update: { defaultFollowUpMinutes, quietHoursStart, quietHoursEnd, weekendScheduling, appointmentBufferMinutes }
    });
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: {} } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "personal.scheduling.update", entityType: "WorkspacePreference", entityId: workspace.id, source: "account.preferences", metadata: { defaultFollowUpMinutes, quietHoursStart, quietHoursEnd, weekendScheduling, appointmentBufferMinutes } } });
  });
  redirect("/account/preferences?schedulingSaved=1");
}

export async function updatePersonalPreferencesFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => updatePersonalPreferencesAction(data)); }

export async function updatePersonalSchedulingFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => updatePersonalSchedulingAction(data)); }

export async function updateMixActivationPreferenceAction(formData: FormData): Promise<void> {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) fail("Personal settings are unavailable during a view-only support session.");
  const mode = value(formData, "mixActivation", 20);
  if (mode !== "REVIEW" && mode !== "DIRECT") fail("Choose how you want to activate mixes.");
  const reviewMixActivation = mode === "REVIEW";
  await prisma.$transaction([
    prisma.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, reviewMixActivation }, update: { reviewMixActivation } }),
    prisma.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "personal.mix-activation.update", entityType: "User", entityId: user.id, source: "account.preferences", metadata: { reviewMixActivation } } })
  ]);
  redirect("/account/preferences?mixActivationSaved=1");
}

export async function updateMixActivationPreferenceFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => updateMixActivationPreferenceAction(data)); }

export async function updateQuietDayPreferenceAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) fail("Personal settings are unavailable during a view-only support session.");
  const quietDays = Number(value(formData, "quietDays", 10));
  if (!Number.isInteger(quietDays) || quietDays < 1 || quietDays > 365) fail("Choose between 1 and 365 quiet days.");
  const quietDaysEnabled = formData.get("quietDaysEnabled") === "on";
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR NO KEY UPDATE`;
    await tx.workspacePreference.upsert({ where: { workspaceId: workspace.id }, create: { workspaceId: workspace.id, quietDays, quietDaysEnabled }, update: { quietDays, quietDaysEnabled } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorUserId: user.id, actorType: "USER", action: "quiet-day.preferences.update", entityType: "WorkspacePreference", entityId: workspace.id, source: "account.preferences", metadata: { quietDays, quietDaysEnabled } } });
  });
  redirect("/account/preferences?quietDaysSaved=1#quiet-days");
}
export async function updateQuietDayPreferenceFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => updateQuietDayPreferenceAction(data)); }
