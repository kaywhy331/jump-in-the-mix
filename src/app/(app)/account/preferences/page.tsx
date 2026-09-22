import { JourneyPreferencesEditor } from "@/components/JourneyPreferencesEditor";
import { initialJourneySetup, readJourneyPreferences } from "@/lib/journey-preferences";
import { SchedulePreview } from "@/components/SchedulePreview";
import { AppearanceControl } from "@/components/Appearance";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { TimezonePicker } from "@/components/TimezonePicker";
import { updateQuietDayPreferenceFormAction, updateMixActivationPreferenceFormAction, updatePersonalPreferencesFormAction, updatePersonalSchedulingFormAction } from "@/lib/account-preference-actions";
import { requireWorkspace } from "@/lib/auth";
import { APPOINTMENT_BUFFER_CHOICES, normalizeBufferMinutes } from "@/lib/calendar-availability";
import { formatTimeInput } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Personal preferences" };

type SearchParams = { journeySetup?: string; journeySaved?: string; quietDaysSaved?: string; mixActivationSaved?: string; error?: string; personalSaved?: string; schedulingSaved?: string };

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
    {query.journeySaved && <Notice type="success">Journey preferences saved. Future flexible follow-ups use your working hours; new mega-mixes use your communication and spacing choices.</Notice>}
    {query.error && <Notice type="error">{query.error}</Notice>}
    {query.quietDaysSaved && <Notice type="success">Quiet-day check-in preferences saved.</Notice>}
    {query.mixActivationSaved && <Notice type="success">Mix activation preference saved.</Notice>}
    {query.personalSaved && <Notice type="success">Personal preferences saved.</Notice>}
    {query.schedulingSaved && <Notice type="success">Scheduling defaults saved. Pending follow-ups are updating in the background.</Notice>}
    <header className="page-header"><div><h1>Personal preferences</h1><p>Choose how your account identifies you and schedules relationship work.</p></div><Link className="button" href="/account">Account</Link></header>

    <p><Link href="/settings/business">Review message signatures</Link> · <Link href="/settings/sending">Review sending defaults</Link></p>
    <section className="card"><h2>Make yourself at home</h2><AppearanceControl /></section>
    <section className="card"><div className="card-header"><div><h2>Profile</h2><p>These details apply to your personal account.</p></div></div><ActionForm protect action={updatePersonalPreferencesFormAction} className="form-grid"><label className="field"><span>Display name</span><input name="name" defaultValue={user.name} maxLength={120} required /></label><label className="field"><span>Locale</span><select name="locale" defaultValue={userPreference?.locale ?? "en-US"}><option value="en-US">English · United States</option><option value="en-CA">English · Canada</option><option value="en-GB">English · United Kingdom</option><option value="en-AU">English · Australia</option></select></label><div className="field full"><span className="field-label">Timezone</span><TimezonePicker name="timezone" id="personal-timezone" label="Personal timezone" defaultValue={userPreference?.timezone ?? "UTC"} /></div><div className="form-actions field full"><FormSubmitButton label="Save profile" pendingLabel="Saving…" /></div></ActionForm></section>

    <section className="card"><h2>Starting mixes</h2><p>Choose what happens when you save a mix with “Start the mix” selected.</p><ActionForm protect action={updateMixActivationPreferenceFormAction} className="form-stack"><label className="field"><span>Mix activation</span><select name="mixActivation" defaultValue={userPreference?.reviewMixActivation === false ? "DIRECT" : "REVIEW"}><option value="REVIEW">Review who gets it before activating</option><option value="DIRECT">Activate when I save</option></select><small>You can still review first on any mix. Activation prepares follow-ups using your existing audience and sending settings.</small></label><div className="form-actions"><FormSubmitButton label="Save activation preference" pendingLabel="Saving…" /></div></ActionForm></section>

    <section className="card" id="quiet-days"><h2>Quiet-day check-ins</h2><p>A suggestion to reconnect after a quiet stretch. These settings apply to everyone in this workspace. No message is sent and nobody changes stage.</p><ActionForm protect action={updateQuietDayPreferenceFormAction} className="form-stack"><label className="checkbox-row"><input type="checkbox" name="quietDaysEnabled" defaultChecked={schedulingPreference?.quietDaysEnabled ?? false} /><span>Suggest check-ins after quiet days</span></label><label className="field"><span>Quiet days before a suggestion</span><input name="quietDays" type="number" min={1} max={365} required defaultValue={schedulingPreference?.quietDays ?? 60}/></label><p className="muted-copy">A completed follow-up, a logged conversation or completed meeting restarts the period. You can also mark a suggestion completed or skipped. Ordinary notes and simply opening a message do not reset it. People who are already due can appear as soon as this is enabled.</p><div className="form-actions"><FormSubmitButton label="Save check-in preferences" pendingLabel="Saving…"/><Link className="button" href="/journey?touchpoint=quiet-days">View check-ins</Link></div></ActionForm></section>

    {readJourneyPreferences(schedulingPreference?.journeyPreferences) || query.journeySetup === "1" ? <section className="card" id="journey-preferences"><h2>Journey preferences</h2><JourneyPreferencesEditor initial={initialJourneySetup(schedulingPreference, userPreference?.timezone ?? "UTC")} /></section> : <>
    <section className="card"><div className="card-header"><div><h2>Scheduling defaults</h2><p>Used when a follow-up or saved date does not specify its own time.</p></div></div><ActionForm protect action={updatePersonalSchedulingFormAction} className="form-grid"><label className="field"><span>Default follow-up time</span><input type="time" name="defaultFollowUpTime" defaultValue={formatTimeInput(schedulingPreference?.defaultFollowUpMinutes ?? 600)} required /></label><label className="field"><span>Weekend scheduling</span><select name="weekendScheduling" defaultValue={schedulingPreference?.weekendScheduling ?? "KEEP"}><option value="KEEP">Keep Saturday and Sunday</option><option value="NEXT_MONDAY">Move to next Monday</option><option value="PREVIOUS_FRIDAY">Move to previous Friday</option></select></label><label className="field"><span>Quiet hours begin</span><input type="time" name="quietHoursStart" defaultValue={formatTimeInput(quietHoursStart)} required /></label><label className="field"><span>Quiet hours end</span><input type="time" name="quietHoursEnd" defaultValue={formatTimeInput(quietHoursEnd)} required /></label><label className="field"><span>Buffer between appointments</span><select name="appointmentBufferMinutes" defaultValue={String(normalizeBufferMinutes(schedulingPreference?.appointmentBufferMinutes))}>{APPOINTMENT_BUFFER_CHOICES.map(minutes => <option key={minutes} value={minutes}>{minutes === 0 ? "No buffer · book back to back" : `${minutes} minutes before and after`}</option>)}</select><small>Kept free around each meeting when you book. Time blocks are not padded.</small></label><div className="field full"><SchedulePreview settings timezone={userPreference?.timezone ?? "UTC"} /></div><div className="form-actions field full"><FormSubmitButton label="Save scheduling defaults" pendingLabel="Saving…" /></div></ActionForm></section>
    <Link className="button" href="/account/preferences?journeySetup=1#journey-preferences">Add working hours and journey preferences</Link></>}
  </div>;
}
