import { SchedulePreview } from "@/components/SchedulePreview";
import { AppearanceControl } from "@/components/Appearance";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { TimezonePicker } from "@/components/TimezonePicker";
import { updatePersonalPreferencesFormAction, updatePersonalSchedulingFormAction } from "@/lib/account-preference-actions";
import { requireWorkspace } from "@/lib/auth";
import { APPOINTMENT_BUFFER_CHOICES, normalizeBufferMinutes } from "@/lib/calendar-availability";
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
  const quietHoursStart = schedulingPreference?.quietHoursStart ?? 1200;
  const quietHoursEnd = schedulingPreference?.quietHoursEnd ?? 480;

  return <div className="page page--form account-preferences-page">
    {query.error && <Notice type="error">{query.error}</Notice>}
    {query.personalSaved && <Notice type="success">Personal preferences saved.</Notice>}
    {query.schedulingSaved && <Notice type="success">Scheduling defaults saved. Pending follow-ups are updating in the background.</Notice>}
    <header className="page-header"><div><h1>Personal preferences</h1><p>Choose how your account identifies you and schedules relationship work.</p></div><Link className="button" href="/account">Account</Link></header>

    <p><Link href="/settings/business">Review message signatures</Link> · <Link href="/settings/sending">Review sending defaults</Link></p>
    <section className="card"><h2>Make yourself at home</h2><AppearanceControl /></section>
    <section className="card"><div className="card-header"><div><h2>Profile</h2><p>These details apply to your personal account.</p></div></div><ActionForm protect action={updatePersonalPreferencesFormAction} className="form-grid"><label className="field"><span>Display name</span><input name="name" defaultValue={user.name} maxLength={120} required /></label><label className="field"><span>Locale</span><select name="locale" defaultValue={userPreference?.locale ?? "en-US"}><option value="en-US">English · United States</option><option value="en-CA">English · Canada</option><option value="en-GB">English · United Kingdom</option><option value="en-AU">English · Australia</option></select></label><div className="field full"><span className="field-label">Timezone</span><TimezonePicker name="timezone" id="personal-timezone" label="Personal timezone" defaultValue={userPreference?.timezone ?? "UTC"} /></div><div className="form-actions field full"><FormSubmitButton label="Save profile" pendingLabel="Saving…" /></div></ActionForm></section>

    <section className="card"><div className="card-header"><div><h2>Scheduling defaults</h2><p>Used when a follow-up or saved date does not specify its own time.</p></div></div><ActionForm protect action={updatePersonalSchedulingFormAction} className="form-grid"><label className="field"><span>Default follow-up time</span><input type="time" name="defaultFollowUpTime" defaultValue={formatTimeInput(schedulingPreference?.defaultFollowUpMinutes ?? 600)} required /></label><label className="field"><span>Weekend scheduling</span><select name="weekendScheduling" defaultValue={schedulingPreference?.weekendScheduling ?? "KEEP"}><option value="KEEP">Keep Saturday and Sunday</option><option value="NEXT_MONDAY">Move to next Monday</option><option value="PREVIOUS_FRIDAY">Move to previous Friday</option></select></label><label className="field"><span>Quiet hours begin</span><input type="time" name="quietHoursStart" defaultValue={formatTimeInput(quietHoursStart)} required /></label><label className="field"><span>Quiet hours end</span><input type="time" name="quietHoursEnd" defaultValue={formatTimeInput(quietHoursEnd)} required /></label><label className="field"><span>Buffer between appointments</span><select name="appointmentBufferMinutes" defaultValue={String(normalizeBufferMinutes(schedulingPreference?.appointmentBufferMinutes))}>{APPOINTMENT_BUFFER_CHOICES.map(minutes => <option key={minutes} value={minutes}>{minutes === 0 ? "No buffer · book back to back" : `${minutes} minutes before and after`}</option>)}</select><small>Kept free around each meeting when you book. Time blocks are not padded.</small></label><div className="field full"><SchedulePreview settings timezone={userPreference?.timezone ?? "UTC"} /></div><div className="form-actions field full"><FormSubmitButton label="Save scheduling defaults" pendingLabel="Saving…" /></div></ActionForm></section>
  </div>;
}
