"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) redirect("/notifications");
  const notificationId = String(formData.get("notificationId") ?? "").trim();
  await prisma.notificationEvent.updateMany({ where: { id: notificationId, userId: user.id, workspaceId: workspace.id }, data: { readAt: new Date() } });
  redirect("/notifications");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) redirect("/notifications");
  await prisma.notificationEvent.updateMany({ where: { userId: user.id, workspaceId: workspace.id, readAt: null }, data: { readAt: new Date() } });
  redirect("/notifications?readAll=1");
}
