import { SendingSettingsContent } from "@/components/SendingSettingsContent";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { ViewOnlySupportNotice } from "@/components/ViewOnlySupportNotice";
import { automaticEmailConfigured, automaticSmsConfigured } from "@/lib/automatic-delivery";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { requireWorkspace } from "@/lib/auth";
import { updateAutomationPreferencesFormAction } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { BackLink } from "@/components/BackLink";

export const metadata: Metadata = { title: "Sending to customers" };

export default async function SendingSettingsPage({ searchParams }: { searchParams: Promise<{ automationSaved?: string; error?: string; at?: string; sig?: string }> }) {
  const [params, { session, user, workspace, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  const viewOnly = Boolean(impersonation);
  const [automation, displayPreferences] = await Promise.all([prisma.automationPreference.findUnique({ where: { workspaceId: workspace.id } }), displayPreferencesForUser(user.id)]);
  const automaticEmailAvailable = automaticEmailConfigured();
  const automaticSmsAvailable = automaticSmsConfigured();
  return <div className="page page--form sending-settings-page">
    <BackLink href="/settings" label="Settings" /><header className="page-header"><div><h1>Sending to customers</h1><p>Choose how your prepared messages reach people.</p></div></header>
    {params.automationSaved && <Notice type="success">Sending preferences saved.</Notice>}
    <UrlErrorNotice params={params} viewer={session} />
    {viewOnly && <ViewOnlySupportNotice />}
    <SendingSettingsContent
      automation={automation && { enabled: automation.enabled, emailEnabled: automation.emailEnabled, smsEnabled: automation.smsEnabled, reviewWindowMinutes: automation.reviewWindowMinutes }}
      emailAvailable={automaticEmailAvailable} smsAvailable={automaticSmsAvailable}
      locale={displayPreferences.locale} viewOnly={viewOnly} saveAction={updateAutomationPreferencesFormAction}
      consent={<label className="checkbox-card automation-consent"><input type="checkbox" name="automationConsent" /><span><strong>I understand these messages send without a final tap</strong><small>I have reviewed my active Mixes, signatures, recipients, and consent obligations.</small></span></label>}
    />
    <p className="muted-copy">Questions about sending? <Link href="/help#contact-support">Talk to support</Link>. Reminders to you are in <Link href="/settings/notifications">Notifications</Link>.</p>
  </div>;
}
