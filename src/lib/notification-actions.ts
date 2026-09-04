"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function updateNotificationPreferencesAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) redirect("/settings/notifications?error=View-only%20sessions%20cannot%20change%20notifications.");
  const digestHour = Number(formData.get("digestHour"));
  if (!Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23) {
    redirect("/settings/notifications?error=Choose%20a%20valid%20digest%20time.");
  }
  await prisma.notificationPreference.upsert({
    where: { workspaceId: workspace.id },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      emailDigestEnabled: formData.get("emailDigestEnabled") === "on",
      weeklyReportEnabled: formData.get("weeklyReportEnabled") === "on",
      digestHour
    },
    update: {
      userId: user.id,
      emailDigestEnabled: formData.get("emailDigestEnabled") === "on",
      weeklyReportEnabled: formData.get("weeklyReportEnabled") === "on",
      digestHour
    }
  });
  redirect("/settings/notifications?saved=1");
}
