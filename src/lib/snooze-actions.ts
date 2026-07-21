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

function withFlag(path: string, flag: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${flag}=1`;
}

export async function snoozeJumpAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const jumpId = value(formData, "jumpId");
  const returnTo = safeReturnTo(value(formData, "returnTo"));
  const presetRaw = value(formData, "preset") || "custom";
  const allowed: SnoozePreset[] = ["later-today", "tomorrow", "next-monday", "next-week", "custom"];
  const preset = allowed.includes(presetRaw as SnoozePreset) ? presetRaw as SnoozePreset : "custom";

  let scheduledAt: Date;
  try {
    scheduledAt = calculateSnoozeAt({
      now: new Date(),
      timezone: workspace.profile?.timezone ?? "UTC",
      preset,
      customDate: value(formData, "customDate"),
      quietHoursStart: workspace.profile?.quietHoursStart,
      quietHoursEnd: workspace.profile?.quietHoursEnd
    });
  } catch (error) {
    redirect(withFlag(returnTo, `error=${encodeURIComponent(error instanceof Error ? error.message : "Choose a future date and time.")}`));
  }

  const result = await prisma.jump.updateMany({
    where: { id: jumpId, workspaceId: workspace.id, status: { in: ["PENDING", "COPIED"] } },
    data: { scheduledAt }
  });
  if (!result.count) redirect(withFlag(returnTo, `error=${encodeURIComponent("This Jump is no longer available to snooze.")}`));
  redirect(withFlag(returnTo, "snoozed"));
}
