"use server";
import { captureFormFailure, recoverableFormAction, withViewerError, type FormResult } from "@/lib/form-errors";

import { redirect } from "next/navigation";
import { automaticEmailConfigured, automaticSmsConfigured } from "@/lib/automatic-delivery";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lockAccess } from "@/lib/access-lock";

export async function updateNotificationPreferencesAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  if (impersonation) redirect(withViewerError("/settings/notifications", "View-only sessions cannot change notifications.", session));
  const digestHour = Number(formData.get("digestHour"));
  if (!Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23) {
    redirect(withViewerError("/settings/notifications", "Choose a valid digest time.", session));
  }
  await prisma.$transaction(async tx => {
    await lockAccess(tx);
    if (!await tx.session.findFirst({ where: { id: session.id, userId: user.id, expiresAt: { gt: new Date() }, user: { suspendedAt: null } } })) redirect("/login");
    await tx.notificationPreference.upsert({
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
  });
  redirect("/settings/notifications?saved=1");
}

export async function updateAutomationPreferencesAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const path = "/settings/sending";
  if (impersonation) redirect(withViewerError(path, "View-only sessions cannot change automatic sending.", session));
  const enabled = formData.get("automationEnabled") === "on";
  const emailEnabled = enabled && formData.get("automationEmailEnabled") === "on";
  const smsEnabled = enabled && formData.get("automationSmsEnabled") === "on";
  const reviewWindowMinutes = Number(formData.get("reviewWindowMinutes"));
  if (!Number.isInteger(reviewWindowMinutes) || reviewWindowMinutes < 5 || reviewWindowMinutes > 1440) {
    captureFormFailure("Choose a review window between 5 minutes and 24 hours.");
    redirect(withViewerError(path, "Choose a review window between 5 minutes and 24 hours.", session));
  }
  if (enabled && formData.get("automationConsent") !== "on") {
    captureFormFailure("Confirm that you understand messages will send without a final tap.");
    redirect(withViewerError(path, "Confirm that you understand messages will send without a final tap.", session));
  }
  if (enabled && !emailEnabled && !smsEnabled) {
    captureFormFailure("Choose email, text, or both for automatic sending.");
    redirect(withViewerError(path, "Choose email, text, or both for automatic sending.", session));
  }
  if (emailEnabled && !automaticEmailConfigured()) {
    captureFormFailure("Automatic email is not configured on this server.");
    redirect(withViewerError(path, "Automatic email is not configured on this server.", session));
  }
  if (smsEnabled && !automaticSmsConfigured()) {
    captureFormFailure("Automatic text delivery is not configured on this server.");
    redirect(withViewerError(path, "Automatic text delivery is not configured on this server.", session));
  }

  await prisma.$transaction(async (tx) => {
    await lockAccess(tx);
    if (!await tx.session.findFirst({ where: { id: session.id, userId: user.id, expiresAt: { gt: new Date() }, user: { suspendedAt: null } } })) redirect("/login");
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
        source: "settings.sending",
        metadata: { emailEnabled, smsEnabled, reviewWindowMinutes }
      }
    });
  });
  redirect(`${path}?automationSaved=1`);
}

export async function updateNotificationPreferencesFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => updateNotificationPreferencesAction(data)); }

export async function updateAutomationPreferencesFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => updateAutomationPreferencesAction(data)); }

export async function sendReminderTestFormAction(_previous: FormResult, _data: FormData): Promise<FormResult> {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) return { error: "End the support session before sending a test." };
  const { transactionalEmailConfigured, sendTransactionalEmail } = await import("@/lib/transactional-email");
  if (!transactionalEmailConfigured() || !user.emailVerifiedAt) return { error: "A verified email address and available email reminders are needed for this test." };
  const { consumeRateLimit } = await import("@/lib/rate-limit");
  const limit = await consumeRateLimit({ scope: "reminder.test", identifiers: [user.id], limit: 2, windowMs: 3600_000 });
  if (!limit.allowed) return { error: "Two test emails are allowed per hour. Check your inbox before trying again." };
  const { digestMessage } = await import("@/lib/notification-delivery");
  const { displayPreferencesForUser } = await import("@/lib/display-preferences");
  const message = digestMessage({ ownerName: user.name, company: workspace.name, due: [{ scheduledAt: new Date(), reason: "Fictional example follow-up", contact: { displayName: "Alex (example)" } }], overdueCount: 0, preferences: await displayPreferencesForUser(user.id) });
  try {
    const result = await sendTransactionalEmail({ ...message, subject: `Test reminder: ${message.subject}`, to: user.email });
    if (!result.delivered) return { error: "The email service has not confirmed acceptance. Check your inbox before retrying." };
  } catch { return { error: "We could not confirm the test email. Check your inbox and spam folder before retrying." }; }
  redirect("/settings/notifications?testAccepted=1");
}
