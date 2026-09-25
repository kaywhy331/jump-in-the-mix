import { AutomaticSendPreview } from "@/components/AutomaticSendPreview";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { ViewOnlySupportNotice } from "@/components/ViewOnlySupportNotice";
import { automaticEmailConfigured, automaticSmsConfigured } from "@/lib/automatic-delivery";
import { requireWorkspace } from "@/lib/auth";
import { updateAutomationPreferencesFormAction } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { BackLink } from "@/components/BackLink";

export const metadata: Metadata = { title: "Sending to customers" };

export default async function SendingSettingsPage({ searchParams }: { searchParams: Promise<{ automationSaved?: string; error?: string; at?: string; sig?: string }> }) {
  const [params, { session, workspace, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  const viewOnly = Boolean(impersonation);
  const automation = await prisma.automationPreference.findUnique({ where: { workspaceId: workspace.id } });
  const automaticEmailAvailable = automaticEmailConfigured();
  const automaticSmsAvailable = automaticSmsConfigured();
  return <div className="page page--form sending-settings-page">
    <BackLink href="/settings" label="Settings" /><header className="page-header"><div><h1>Sending to customers</h1><p>Choose how your prepared messages reach people.</p></div></header>
    {params.automationSaved && <Notice type="success">Sending preferences saved.</Notice>}
    <UrlErrorNotice params={params} viewer={session} />
    {viewOnly && <ViewOnlySupportNotice />}
    <section className="card sending-status"><span className="status-pill">{automation?.enabled ? "Automatic sending on" : "You review and send"}</span><h2>{automation?.enabled ? "Your mixes can send for you" : "Every message starts with you"}</h2><p>{automation?.enabled ? "Prepared messages send after your review window. Quiet hours still apply." : "Open a follow-up in Today, make it your own, and choose when to send. Automatic sending is optional."}</p><Link className="button" href="/jumps">Open Today</Link></section>
    <section className="card automation-settings-card">
      <div className="card-header"><div><h2>Automatic sending <span className="status-pill">Optional</span></h2><p>Keep approval-first as the default, or let prepared messages send after time to review them in Today.</p></div></div>
      {!automaticEmailAvailable && !automaticSmsAvailable && <Notice type="info">Automatic delivery is not available for your account yet. You can keep reviewing and sending messages from Today. Contact support when you’re ready to set it up.</Notice>}
      <ActionForm protect={!viewOnly} action={updateAutomationPreferencesFormAction} className="form-stack"><fieldset className="sending-options" disabled={!automaticEmailAvailable && !automaticSmsAvailable && !automation?.enabled}>
        <label className="checkbox-card"><input type="checkbox" name="automationEnabled" defaultChecked={automation?.enabled ?? false} /><span><strong>Send prepared messages automatically</strong><small>Off by default. Calls and voicemails always stay manual.</small></span></label>
        <div className="form-grid">
          <label className="checkbox-card"><input type="checkbox" name="automationEmailEnabled" defaultChecked={automation?.emailEnabled ?? false} disabled={!automaticEmailAvailable} /><span><strong>Email</strong><small>{automaticEmailAvailable ? "Available" : "Not available yet"}</small></span></label>
          <label className="checkbox-card"><input type="checkbox" name="automationSmsEnabled" defaultChecked={automation?.smsEnabled ?? false} disabled={!automaticSmsAvailable} /><span><strong>Text</strong><small>{automaticSmsAvailable ? "Available" : "Not available yet"}</small></span></label>
        </div>
        <label className="field"><span>Time to review before sending</span><select name="reviewWindowMinutes" defaultValue={String(automation?.reviewWindowMinutes ?? 30)}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="240">4 hours</option><option value="1440">24 hours</option></select><small>The window starts no earlier than the scheduled time. Quiet hours still apply.</small></label>
        <AutomaticSendPreview /><label className="checkbox-card automation-consent"><input type="checkbox" name="automationConsent" /><span><strong>I understand these messages send without a final tap</strong><small>I have reviewed my active mixes, signatures, recipients, and consent obligations.</small></span></label>
        <FormSubmitButton label="Save automatic sending" pendingLabel="Saving…" disabled={viewOnly} />
      </fieldset></ActionForm>
    </section>
    <p className="muted-copy">Need help getting set up? <Link href="/help#contact-support">Talk to support</Link>. Reminders to you are in <Link href="/settings/notifications">Notifications</Link>.</p>
  </div>;
}
