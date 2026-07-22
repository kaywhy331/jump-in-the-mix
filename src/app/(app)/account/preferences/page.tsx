import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { TimezonePicker } from "@/components/TimezonePicker";
import {
  updateNotificationPreferencesAction,
  updatePersonalPreferencesAction,
  updateWorkspaceSchedulingAction
} from "@/lib/account-preference-actions";
import { requireWorkspace } from "@/lib/auth";
import { formatTimeInput } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Preferences" };

type SearchParams = { error?: string; personalSaved?: string; notificationsSaved?: string; schedulingSaved?: string };

const notificationRows = [
  ["dailyDigest", "Daily Jump digest", "One daily summary of due and overdue relationship work."],
  ["overdueReminders", "Overdue reminders", "Remind me when pending Jumps remain overdue."],
  ["upcomingDates", "Upcoming Important Dates", "Warn me before upcoming moments without enough prepared work."],
  ["integrationFailures", "Integration failures", "Notify me when Google or another connection needs attention."],
  ["importComplete", "Import completion", "Notify me when a background Contact import finishes."],
  ["supportReplies", "Support replies", "Notify me when support responds to a ticket."],
  ["billingAlerts", "Billing alerts", "Notify me about payment recovery, cancellation, and plan changes."],
  ["securityAlerts", "Security alerts", "Notify me about password, MFA, email, and session changes."]
] as const;

export default async function AccountPreferencesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { user, workspace, membership, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  if (impersonation) return <div className="page"><Notice type="info">Preferences are private during a view-only support session.</Notice></div>;
  const [userPreference, workspacePreference, notificationPreference] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    prisma.workspacePreference.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.notificationPreference.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } } })
  ]);
  const canManageWorkspace = membership.role === "OWNER" || membership.role === "ADMIN";
  const quietHoursStart = workspacePreference?.quietHoursStart ?? workspace.profile?.quietHoursStart ?? 1200;
  const quietHoursEnd = workspacePreference?.quietHoursEnd ?? workspace.profile?.quietHoursEnd ?? 480;
  const preference = notificationPreference ?? {
    emailEnabled: true,
    inAppEnabled: true,
    dailyDigest: true,
    overdueReminders: true,
    upcomingDates: true,
    integrationFailures: true,
    importComplete: true,
    supportReplies: true,
    billingAlerts: true,
    securityAlerts: true,
    digestMinutes: 480
  };

  return (
    <div className="page account-preferences-page">
      {query.error && <Notice type="error">{query.error}</Notice>}
      {query.personalSaved && <Notice type="success">Personal preferences saved.</Notice>}
      {query.notificationsSaved && <Notice type="success">Notification preferences saved.</Notice>}
      {query.schedulingSaved && <Notice type="success">Workspace scheduling defaults saved. Future pending work is being reconciled.</Notice>}
      <header className="page-header"><div><h1>Preferences</h1><p>Control personal identity, scheduling behavior, and when this workspace should notify you.</p></div><Link className="button" href="/account">My Account</Link></header>

      <section className="card"><div className="card-header"><div><h2>Personal preferences</h2><p>These settings follow your account across workspaces.</p></div></div><form action={updatePersonalPreferencesAction} className="form-grid"><label className="field"><span>Display name</span><input name="name" defaultValue={user.name} maxLength={120} required /></label><label className="field"><span>Locale</span><select name="locale" defaultValue={userPreference?.locale ?? "en-US"}><option value="en-US">English · United States</option><option value="en-CA">English · Canada</option><option value="en-GB">English · United Kingdom</option><option value="en-AU">English · Australia</option></select></label><div className="field full"><span className="field-label">Personal timezone</span><TimezonePicker name="timezone" id="personal-timezone" label="Personal timezone" defaultValue={userPreference?.timezone ?? workspace.profile?.timezone ?? "UTC"} /></div><div className="form-actions field full"><button className="button primary" type="submit">Save personal preferences</button></div></form></section>

      <section className="card"><div className="card-header"><div><h2>Workspace scheduling</h2><p>Defaults apply when a Mix action or Important Date does not specify its own time.</p></div><span className="status-pill">{workspace.name}</span></div>{canManageWorkspace ? <form action={updateWorkspaceSchedulingAction} className="form-grid"><label className="field"><span>Default follow-up time</span><input type="time" name="defaultFollowUpTime" defaultValue={formatTimeInput(workspacePreference?.defaultFollowUpMinutes ?? 600)} required /></label><label className="field"><span>Weekend scheduling</span><select name="weekendScheduling" defaultValue={workspacePreference?.weekendScheduling ?? "KEEP"}><option value="KEEP">Keep Saturday and Sunday</option><option value="NEXT_MONDAY">Move to next Monday</option><option value="PREVIOUS_FRIDAY">Move to previous Friday</option></select></label><label className="field"><span>Quiet hours begin</span><input type="time" name="quietHoursStart" defaultValue={formatTimeInput(quietHoursStart)} required /></label><label className="field"><span>Quiet hours end</span><input type="time" name="quietHoursEnd" defaultValue={formatTimeInput(quietHoursEnd)} required /></label><div className="form-actions field full"><button className="button primary" type="submit">Save scheduling defaults</button></div></form> : <Notice type="info">Only workspace owners and administrators can change workspace-wide scheduling defaults.</Notice>}</section>

      <section className="card"><div className="card-header"><div><h2>Notifications</h2><p>Choose the events worth interrupting you for in this workspace.</p></div></div><form action={updateNotificationPreferencesAction} className="form-stack"><div className="checkbox-row"><label className="checkbox-card"><input type="checkbox" name="emailEnabled" defaultChecked={preference.emailEnabled} /><span><strong>Email notifications</strong><small>Send selected notices to {user.email}.</small></span></label><label className="checkbox-card"><input type="checkbox" name="inAppEnabled" defaultChecked={preference.inAppEnabled} /><span><strong>In-app notifications</strong><small>Keep a notification inbox inside Jump in the Mix.</small></span></label></div><label className="field"><span>Daily digest time</span><input type="time" name="digestTime" defaultValue={formatTimeInput(preference.digestMinutes)} required /></label><div className="notification-preference-list">{notificationRows.map(([key, label, description]) => <label className="checkbox-card" key={key}><input type="checkbox" name={key} defaultChecked={preference[key]} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</div><div className="form-actions"><button className="button primary" type="submit">Save notification preferences</button></div></form></section>
    </div>
  );
}
