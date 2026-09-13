"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { baseScheduledAtFromSnapshot } from "@/lib/jump-schedule";
import { calculateSnoozeAt, resolveSnooze, type SnoozePreset } from "@/lib/snooze-schedule";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function safeReturnTo(raw: string): string {
  if (raw === "/jumps" || raw.startsWith("/jumps?")) return raw;
  return "/jumps";
}

function withParam(path: string, key: string, parameterValue: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(parameterValue)}`;
}

export async function snoozeJumpAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const jumpId = value(formData, "jumpId");
  const returnTo = safeReturnTo(value(formData, "returnTo"));
  const presetRaw = value(formData, "preset") || "custom";
  const allowed: SnoozePreset[] = ["later-today", "tomorrow", "next-monday", "next-week", "custom"];
  const preset = allowed.includes(presetRaw as SnoozePreset) ? presetRaw as SnoozePreset : "custom";

  const [scheduling, preferences] = await Promise.all([
    prisma.workspacePreference.findUnique({ where: { workspaceId: workspace.id } }),
    displayPreferencesForUser(user.id)
  ]);
  let scheduledAt: Date;
  try {
    scheduledAt = calculateSnoozeAt({
      now: new Date(),
      timezone: preferences.timeZone,
      preset,
      customDate: value(formData, "customDate"),
      preferredMinutes: scheduling?.defaultFollowUpMinutes,
      quietHoursStart: scheduling?.quietHoursStart,
      quietHoursEnd: scheduling?.quietHoursEnd
    });
  } catch (error) {
    redirect(withParam(returnTo, "error", error instanceof Error ? error.message : "Choose a future date and time."));
  }

  const jump = await prisma.jump.findFirst({
    where: { id: jumpId, workspaceId: workspace.id, status: "PENDING" },
    select: { scheduledAt: true, snoozedUntil: true, templateSnapshot: true }
  });
  if (!jump) redirect(withParam(returnTo, "error", "This follow-up is no longer available to snooze."));

  // A snooze is a not-before time: it may hold a follow-up later but never pull it ahead of the
  // scheduler's base instant. Without stored provenance, the current time is the base only when
  // nothing has been snoozed yet.
  const baseScheduledAt = baseScheduledAtFromSnapshot(jump.templateSnapshot) ?? (jump.snoozedUntil ? null : jump.scheduledAt);
  const resolution = resolveSnooze({ chosen: scheduledAt, baseScheduledAt });
  if (!resolution.ok) {
    redirect(withParam(returnTo, "error", `This follow-up is due ${formatDateTime(resolution.dueAt, preferences)}. Snooze can only move it later.`));
  }

  // Guarded on the snooze just read, so a slower worker pass or a second device cannot overwrite a newer choice.
  const result = await prisma.jump.updateMany({
    where: { id: jumpId, workspaceId: workspace.id, status: "PENDING", snoozedUntil: jump.snoozedUntil },
    data: { scheduledAt: resolution.scheduledAt, snoozedUntil: resolution.scheduledAt }
  });
  if (!result.count) redirect(withParam(returnTo, "error", "This follow-up changed a moment ago. Check it and snooze again."));
  redirect(withParam(returnTo, "snoozed", "1"));
}
