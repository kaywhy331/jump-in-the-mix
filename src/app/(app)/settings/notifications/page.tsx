import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { PushNotificationControl } from "@/components/PushNotificationControl";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { updateNotificationPreferencesAction } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { transactionalEmailConfigured } from "@/lib/transactional-email";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; automationSaved?: string; error?: string }> }) {
  const [params, { workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
  const preference = await prisma.notificationPreference.findUnique({ where: { workspaceId: workspace.id } });
  const emailConfigured = transactionalEmailConfigured();
  return <div className="page">
    <header className="page-header"><div><h1>Notifications</h1><p>Reminders to you, so the next conversation stays on your radar.</p></div><Link className="button" href="/settings">Back</Link></header>
    {params.saved && <Notice type="success">Notifications saved.</Notice>}
    {params.error && <Notice type="error">{params.error}</Notice>}
    <section className="card"><div className="card-header"><div><h2>Email reminders</h2><p>Sent to {user.email} in your saved timezone.</p></div></div>{!emailConfigured && <Notice type="info">Email reminders are not available for this account yet. You can use push reminders on your device instead.</Notice>}{emailConfigured && <form action={updateNotificationPreferencesAction} className="form-stack"><label className="checkbox-card"><input type="checkbox" name="emailDigestEnabled" defaultChecked={preference?.emailDigestEnabled ?? true} disabled={!emailConfigured} /><span><strong>Morning digest</strong><small>A short list of due and overdue follow-ups.</small></span></label><label className="checkbox-card"><input type="checkbox" name="weeklyReportEnabled" defaultChecked={preference?.weeklyReportEnabled ?? true} disabled={!emailConfigured} /><span><strong>Monday owner report</strong><small>Completed follow-ups, quiet customers, and referrals.</small></span></label><label className="field"><span>Send at</span><select name="digestHour" defaultValue={String(preference?.digestHour ?? 7)} disabled={!emailConfigured}>{Array.from({ length: 24 }, (_, hour) => <option value={hour} key={hour}>{new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, hour)))}</option>)}</select></label><button className="button primary" type="submit" disabled={!emailConfigured}>Save email reminders</button></form>}</section>
    <section className="card"><div className="card-header"><div><h2>Push reminders</h2><p>Opt in separately on each phone or computer.</p></div></div><PushNotificationControl publicKey={env.vapidPublicKey} configured={Boolean(env.vapidPublicKey && env.vapidPrivateKey)} /></section>
    <p className="muted-copy">Messages to customers are managed in <Link href="/settings/sending">Sending to customers</Link>.</p>
    <p className="muted-copy">Quiet hours come from <Link href="/account/preferences">Scheduling defaults</Link>.</p>
  </div>;
}
