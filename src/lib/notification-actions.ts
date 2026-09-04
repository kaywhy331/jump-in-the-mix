"use server";

import { redirect } from "next/navigation";
import { automaticEmailConfigured, automaticSmsConfigured } from "@/lib/automatic-delivery";
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

export async function updateAutomationPreferencesAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const path = "/settings/notifications";
  if (impersonation) redirect(`${path}?error=${encodeURIComponent("View-only sessions cannot change automatic sending.")}`);
  const enabled = formData.get("automationEnabled") === "on";
  const emailEnabled = enabled && formData.get("automationEmailEnabled") === "on";
  const smsEnabled = enabled && formData.get("automationSmsEnabled") === "on";
  const reviewWindowMinutes = Number(formData.get("reviewWindowMinutes"));
  if (!Number.isInteger(reviewWindowMinutes) || reviewWindowMinutes < 5 || reviewWindowMinutes > 1440) {
    redirect(`${path}?error=${encodeURIComponent("Choose a review window between 5 minutes and 24 hours.")}`);
  }
  if (enabled && formData.get("automationConsent") !== "on") {
    redirect(`${path}?error=${encodeURIComponent("Confirm that you understand messages will send without a final tap.")}`);
  }
  if (enabled && !emailEnabled && !smsEnabled) {
    redirect(`${path}?error=${encodeURIComponent("Choose email, text, or both for automatic sending.")}`);
  }
  if (emailEnabled && !automaticEmailConfigured()) {
    redirect(`${path}?error=${encodeURIComponent("Automatic email is not configured on this server.")}`);
  }
  if (smsEnabled && !automaticSmsConfigured()) {
    redirect(`${path}?error=${encodeURIComponent("Automatic text delivery is not configured on this server.")}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.automationPreference.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, enabled, emailEnabled, smsEnabled, reviewWindowMinutes },
      update: { enabled, emailEnabled, smsEnabled, reviewWindowMinutes }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: enabled ? "automation.enabled" : "automation.disabled",
        entityType: "AutomationPreference",
        entityId: workspace.id,
        source: "settings.notifications",
        metadata: { emailEnabled, smsEnabled, reviewWindowMinutes }
      }
    });
  });
  redirect(`${path}?automationSaved=1`);
}
