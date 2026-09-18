"use server";
import { captureFormFailure, recoverableFormAction, type FormResult } from "@/lib/form-errors";

import { redirect } from "next/navigation";
import { automaticEmailConfigured, automaticSmsConfigured } from "@/lib/automatic-delivery";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lockAccess } from "@/lib/access-lock";

export async function updateNotificationPreferencesAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  if (impersonation) redirect("/settings/notifications?error=View-only%20sessions%20cannot%20change%20notifications.");
  const digestHour = Number(formData.get("digestHour"));
  if (!Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23) {
    redirect("/settings/notifications?error=Choose%20a%20valid%20digest%20time.");
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
  if (impersonation) redirect(`${path}?error=${encodeURIComponent("View-only sessions cannot change automatic sending.")}`);
  const enabled = formData.get("automationEnabled") === "on";
  const emailEnabled = enabled && formData.get("automationEmailEnabled") === "on";
  const smsEnabled = enabled && formData.get("automationSmsEnabled") === "on";
  const reviewWindowMinutes = Number(formData.get("reviewWindowMinutes"));
  if (!Number.isInteger(reviewWindowMinutes) || reviewWindowMinutes < 5 || reviewWindowMinutes > 1440) {
    captureFormFailure("Choose a review window between 5 minutes and 24 hours.");
    redirect(`${path}?error=${encodeURIComponent("Choose a review window between 5 minutes and 24 hours.")}`);
  }
  if (enabled && formData.get("automationConsent") !== "on") {
    captureFormFailure("Confirm that you understand messages will send without a final tap.");
    redirect(`${path}?error=${encodeURIComponent("Confirm that you understand messages will send without a final tap.")}`);
  }
  if (enabled && !emailEnabled && !smsEnabled) {
    captureFormFailure("Choose email, text, or both for automatic sending.");
    redirect(`${path}?error=${encodeURIComponent("Choose email, text, or both for automatic sending.")}`);
  }
  if (emailEnabled && !automaticEmailConfigured()) {
    captureFormFailure("Automatic email is not configured on this server.");
    redirect(`${path}?error=${encodeURIComponent("Automatic email is not configured on this server.")}`);
  }
  if (smsEnabled && !automaticSmsConfigured()) {
    captureFormFailure("Automatic text delivery is not configured on this server.");
    redirect(`${path}?error=${encodeURIComponent("Automatic text delivery is not configured on this server.")}`);
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
