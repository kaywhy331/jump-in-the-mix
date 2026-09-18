import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { PushNotificationControl } from "@/components/PushNotificationControl";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { sendReminderTestFormAction, updateNotificationPreferencesFormAction } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { transactionalEmailConfigured } from "@/lib/transactional-email";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ testAccepted?: string; saved?: string; automationSaved?: string; error?: string }> }) {
  const [params, { workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
  const preference = await prisma.notificationPreference.findUnique({ where: { workspaceId: workspace.id } });
  const emailConfigured = transactionalEmailConfigured();
  const pushConfigured = Boolean(env.vapidPublicKey && env.vapidPrivateKey);
  return <div className="page">
    <header className="page-header"><div><h1>Notifications</h1><p>Reminders to you, so the next conversation stays on your radar.</p></div><Link className="button" href="/settings">Back</Link></header>
    {params.testAccepted && <Notice type="success">The email service accepted the test reminder for your verified address. Check your inbox and spam folder; acceptance does not guarantee inbox delivery.</Notice>}{params.saved && <Notice type="success">Notifications saved.</Notice>}
    {params.error && <Notice type="error">{params.error}</Notice>}
    <section className="card"><div className="card-header"><div><h2>Email reminders</h2><p>Choose the email reminders you want. Sent to {user.email} in your saved timezone.</p></div></div>{!emailConfigured && <Notice type="info">Email reminders are unavailable. {pushConfigured ? "Device reminders may be available below if your browser supports them." : "Device reminders are also unavailable. Continue using Today and contact support for availability."} <Link href="/help#contact-support">Message support</Link></Notice>}{emailConfigured && <ActionForm protect action={updateNotificationPreferencesFormAction} className="form-stack"><label className="checkbox-card"><input type="checkbox" name="emailDigestEnabled" defaultChecked={preference?.emailDigestEnabled ?? false} disabled={!emailConfigured} /><span><strong>Morning digest</strong><small>A short list of due and overdue follow-ups.</small></span></label><label className="checkbox-card"><input type="checkbox" name="weeklyReportEnabled" defaultChecked={preference?.weeklyReportEnabled ?? false} disabled={!emailConfigured} /><span><strong>Monday owner report</strong><small>Completed follow-ups, quiet customers, and referrals.</small></span></label><label className="field"><span>Send at</span><select name="digestHour" defaultValue={String(preference?.digestHour ?? 7)} disabled={!emailConfigured}>{Array.from({ length: 24 }, (_, hour) => <option value={hour} key={hour}>{new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, hour)))}</option>)}</select></label><FormSubmitButton label="Save email reminders" pendingLabel="Saving…" /></ActionForm>}</section>
    <section className="card"><h2>Example morning email</h2><p>To: {user.email}</p><p>“2 people to reach today”</p><p>Good morning. Alex — estimate follow-up; Jamie — check-in. Open Today to review your actual list.</p><small>Fictional sample. Your real digest includes up to ten due items and an overdue count. The weekly report summarizes completed work, quiet relationships, and referrals.</small>{emailConfigured && <ActionForm action={sendReminderTestFormAction}><p>A test uses fictional Alex and sends only to your verified account email.</p><FormSubmitButton label="Send me a test reminder" pendingLabel="Sending test…" /></ActionForm>}</section>
    <section className="card"><div className="card-header"><div><h2>Push reminders</h2><p>Opt in separately on each phone or computer.</p></div></div><PushNotificationControl publicKey={env.vapidPublicKey} configured={pushConfigured} /></section>
    <p className="muted-copy">Messages to customers are managed in <Link href="/settings/sending">Sending to customers</Link>.</p>
    <p className="muted-copy">Quiet hours come from <Link href="/account/preferences">Scheduling defaults</Link>.</p>
  </div>;
}
