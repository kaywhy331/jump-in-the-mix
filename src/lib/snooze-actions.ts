"use server";

import { redirect } from "next/navigation";
import { withViewerError } from "@/lib/form-errors";
import { requireWritableWorkspace } from "@/lib/writable-workspace";
import { prisma } from "@/lib/prisma";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { calculateSnoozeAt, resolveSnooze, type SnoozePreset } from "@/lib/snooze-schedule";
import { UserFacingError } from "@/lib/user-facing-error";

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
  const { workspace, user, session } = await requireWritableWorkspace((message, viewer) => redirect(withViewerError(safeReturnTo(value(formData, "returnTo")), message, viewer)));
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
    redirect(withViewerError(returnTo, error instanceof UserFacingError ? error.message : "Choose a future date and time.", session));
  }

  const jump = await prisma.jump.findFirst({
    where: { id: jumpId, workspaceId: workspace.id, status: "PENDING" },
    select: { scheduledAt: true, snoozedUntil: true, baseScheduledAt: true }
  });
  if (!jump) redirect(withViewerError(returnTo, "This follow-up is no longer available to snooze.", session));

  // A snooze is a not-before time: it may hold a follow-up later but never pull it ahead of the
  // scheduler's base instant. A row written before the base was stored has no snooze yet, so its
  // current time is its base.
  const baseScheduledAt = jump.baseScheduledAt ?? (jump.snoozedUntil ? null : jump.scheduledAt);
  const resolution = resolveSnooze({ chosen: scheduledAt, baseScheduledAt });
  if (!resolution.ok) {
    redirect(withViewerError(returnTo, `This follow-up is due ${formatDateTime(resolution.dueAt, preferences)}. Snooze can't move it earlier than that.`, session));
  }

  // Guarded on the snooze just read, so a second tab or device that snoozed in the meantime is not
  // overwritten. The worker guards its own writes on the row as it read it.
  const result = await prisma.jump.updateMany({
    where: { id: jumpId, workspaceId: workspace.id, status: "PENDING", snoozedUntil: jump.snoozedUntil },
    data: { scheduledAt: resolution.scheduledAt, snoozedUntil: resolution.scheduledAt }
  });
  if (!result.count) redirect(withViewerError(returnTo, "This follow-up changed a moment ago. Check it and snooze again.", session));
  // The confirmation names the time the follow-up now waits until (TRU-05).
  redirect(withParam(returnTo, "snoozed", resolution.scheduledAt.toISOString()));
}
