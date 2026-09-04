"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateSnoozeAt, type SnoozePreset } from "@/lib/snooze-schedule";

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
  const { workspace } = await requireWorkspace();
  const jumpId = value(formData, "jumpId");
  const returnTo = safeReturnTo(value(formData, "returnTo"));
  const presetRaw = value(formData, "preset") || "custom";
  const allowed: SnoozePreset[] = ["later-today", "tomorrow", "next-monday", "next-week", "custom"];
  const preset = allowed.includes(presetRaw as SnoozePreset) ? presetRaw as SnoozePreset : "custom";

  const scheduling = await prisma.workspacePreference.findUnique({ where: { workspaceId: workspace.id } });
  let scheduledAt: Date;
  try {
    scheduledAt = calculateSnoozeAt({
      now: new Date(),
      timezone: workspace.profile?.timezone ?? "UTC",
      preset,
      customDate: value(formData, "customDate"),
      preferredMinutes: scheduling?.defaultFollowUpMinutes,
      quietHoursStart: scheduling?.quietHoursStart,
      quietHoursEnd: scheduling?.quietHoursEnd
    });
  } catch (error) {
    redirect(withParam(returnTo, "error", error instanceof Error ? error.message : "Choose a future date and time."));
  }

  const result = await prisma.jump.updateMany({
    where: { id: jumpId, workspaceId: workspace.id, status: { in: ["PENDING", "COPIED"] } },
    data: { scheduledAt }
  });
  if (!result.count) redirect(withParam(returnTo, "error", "This Jump is no longer available to snooze."));
  redirect(withParam(returnTo, "snoozed", "1"));
}
