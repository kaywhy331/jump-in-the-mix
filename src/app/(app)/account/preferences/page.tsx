import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { TimezonePicker } from "@/components/TimezonePicker";
import { updatePersonalPreferencesAction, updatePersonalSchedulingAction } from "@/lib/account-preference-actions";
import { requireWorkspace } from "@/lib/auth";
import { formatTimeInput } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Personal preferences" };

type SearchParams = { error?: string; personalSaved?: string; schedulingSaved?: string };

export default async function AccountPreferencesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { user, workspace, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  if (impersonation) return <div className="page"><Notice type="info">Preferences are private during a view-only support session.</Notice></div>;
  const [userPreference, schedulingPreference] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    prisma.workspacePreference.findUnique({ where: { workspaceId: workspace.id } })
  ]);
  const quietHoursStart = schedulingPreference?.quietHoursStart ?? workspace.profile?.quietHoursStart ?? 1200;
  const quietHoursEnd = schedulingPreference?.quietHoursEnd ?? workspace.profile?.quietHoursEnd ?? 480;

  return <div className="page account-preferences-page">
    {query.error && <Notice type="error">{query.error}</Notice>}
    {query.personalSaved && <Notice type="success">Personal preferences saved.</Notice>}
    {query.schedulingSaved && <Notice type="success">Scheduling defaults saved. Future pending work is being reconciled.</Notice>}
    <header className="page-header"><div><h1>Personal preferences</h1><p>Choose how your account identifies you and schedules relationship work.</p></div><Link className="button" href="/account">Account</Link></header>

    <section className="card"><div className="card-header"><div><h2>Profile</h2><p>These details apply to your personal account.</p></div></div><form action={updatePersonalPreferencesAction} className="form-grid"><label className="field"><span>Display name</span><input name="name" defaultValue={user.name} maxLength={120} required /></label><label className="field"><span>Locale</span><select name="locale" defaultValue={userPreference?.locale ?? "en-US"}><option value="en-US">English · United States</option><option value="en-CA">English · Canada</option><option value="en-GB">English · United Kingdom</option><option value="en-AU">English · Australia</option></select></label><div className="field full"><span className="field-label">Timezone</span><TimezonePicker name="timezone" id="personal-timezone" label="Personal timezone" defaultValue={userPreference?.timezone ?? workspace.profile?.timezone ?? "UTC"} /></div><div className="form-actions field full"><button className="button primary" type="submit">Save profile</button></div></form></section>

    <section className="card"><div className="card-header"><div><h2>Scheduling defaults</h2><p>Used when an action or Important Date does not specify its own time.</p></div></div><form action={updatePersonalSchedulingAction} className="form-grid"><label className="field"><span>Default follow-up time</span><input type="time" name="defaultFollowUpTime" defaultValue={formatTimeInput(schedulingPreference?.defaultFollowUpMinutes ?? 600)} required /></label><label className="field"><span>Weekend scheduling</span><select name="weekendScheduling" defaultValue={schedulingPreference?.weekendScheduling ?? "KEEP"}><option value="KEEP">Keep Saturday and Sunday</option><option value="NEXT_MONDAY">Move to next Monday</option><option value="PREVIOUS_FRIDAY">Move to previous Friday</option></select></label><label className="field"><span>Quiet hours begin</span><input type="time" name="quietHoursStart" defaultValue={formatTimeInput(quietHoursStart)} required /></label><label className="field"><span>Quiet hours end</span><input type="time" name="quietHoursEnd" defaultValue={formatTimeInput(quietHoursEnd)} required /></label><div className="form-actions field full"><button className="button primary" type="submit">Save scheduling defaults</button></div></form></section>
  </div>;
}
