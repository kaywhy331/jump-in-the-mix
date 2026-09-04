import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { PushNotificationControl } from "@/components/PushNotificationControl";
import { automaticEmailConfigured, automaticSmsConfigured } from "@/lib/automatic-delivery";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { updateAutomationPreferencesAction, updateNotificationPreferencesAction } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { transactionalEmailConfigured } from "@/lib/transactional-email";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; automationSaved?: string; error?: string }> }) {
  const [params, { workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
  const [preference, automation] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.automationPreference.findUnique({ where: { workspaceId: workspace.id } })
  ]);
  const emailConfigured = transactionalEmailConfigured();
  const automaticEmailAvailable = automaticEmailConfigured();
  const automaticSmsAvailable = automaticSmsConfigured();
  return <div className="page">
    <header className="page-header"><div><h1>Notifications</h1><p>Choose how Jump in the Mix reminds you about today’s work.</p></div><Link className="button" href="/settings">Back</Link></header>
    {params.saved && <Notice type="success">Notifications saved.</Notice>}
    {params.automationSaved && <Notice type="success">Automatic sending preferences saved.</Notice>}
    {params.error && <Notice type="error">{params.error}</Notice>}
    <section className="card"><div className="card-header"><div><h2>Email reminders</h2><p>Sent to {user.email} in your saved timezone.</p></div></div>{!emailConfigured && <Notice type="info">Email sending is not configured on this server. Add RESEND_API_KEY and EMAIL_FROM to enable digests.</Notice>}<form action={updateNotificationPreferencesAction} className="form-stack"><label className="checkbox-card"><input type="checkbox" name="emailDigestEnabled" defaultChecked={preference?.emailDigestEnabled ?? true} disabled={!emailConfigured} /><span><strong>Morning digest</strong><small>A short list of due and overdue follow-ups.</small></span></label><label className="checkbox-card"><input type="checkbox" name="weeklyReportEnabled" defaultChecked={preference?.weeklyReportEnabled ?? true} disabled={!emailConfigured} /><span><strong>Monday owner report</strong><small>Completed follow-ups, quiet customers, and referrals.</small></span></label><label className="field"><span>Send at</span><select name="digestHour" defaultValue={String(preference?.digestHour ?? 7)} disabled={!emailConfigured}>{Array.from({ length: 24 }, (_, hour) => <option value={hour} key={hour}>{new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, hour)))}</option>)}</select></label><button className="button primary" type="submit" disabled={!emailConfigured}>Save email reminders</button></form></section>
    <section className="card"><div className="card-header"><div><h2>Push reminders</h2><p>Opt in separately on each phone or computer.</p></div></div><PushNotificationControl publicKey={env.vapidPublicKey} configured={Boolean(env.vapidPublicKey && env.vapidPrivateKey)} /></section>
    <section className="card automation-settings-card">
      <div className="card-header"><div><h2>Automatic sending <span className="status-pill">Optional</span></h2><p>Keep approval-first as the default, or let prepared messages send after time to review them in Today.</p></div></div>
      {!automaticEmailAvailable && !automaticSmsAvailable && <Notice type="info">Connect Resend for email or Twilio for texts before turning this on.</Notice>}
      <form action={updateAutomationPreferencesAction} className="form-stack">
        <label className="checkbox-card"><input type="checkbox" name="automationEnabled" defaultChecked={automation?.enabled ?? false} /><span><strong>Send prepared messages automatically</strong><small>Off by default. Calls and voicemails always stay manual.</small></span></label>
        <div className="form-grid">
          <label className="checkbox-card"><input type="checkbox" name="automationEmailEnabled" defaultChecked={automation?.emailEnabled ?? false} disabled={!automaticEmailAvailable} /><span><strong>Email</strong><small>{automaticEmailAvailable ? "Ready through Resend" : "Resend is not configured"}</small></span></label>
          <label className="checkbox-card"><input type="checkbox" name="automationSmsEnabled" defaultChecked={automation?.smsEnabled ?? false} disabled={!automaticSmsAvailable} /><span><strong>Text</strong><small>{automaticSmsAvailable ? "Ready through Twilio" : "Twilio is not configured"}</small></span></label>
        </div>
        <label className="field"><span>Time to review before sending</span><select name="reviewWindowMinutes" defaultValue={String(automation?.reviewWindowMinutes ?? 30)}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="240">4 hours</option><option value="1440">24 hours</option></select><small>The window starts no earlier than the scheduled time. Quiet hours still apply.</small></label>
        <label className="checkbox-card automation-consent"><input type="checkbox" name="automationConsent" /><span><strong>I understand these messages send without a final tap</strong><small>I have reviewed my active plans, signatures, recipients, and consent obligations.</small></span></label>
        <button className="button primary" type="submit">Save automatic sending</button>
      </form>
    </section>
    <p className="muted-copy">Quiet hours come from <Link href="/account/preferences">Scheduling defaults</Link>.</p>
  </div>;
}
