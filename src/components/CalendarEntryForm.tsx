"use client";
import { useActionState, useState } from "react";
import { saveCalendarAction } from "@/lib/calendar-actions";
import { Notice } from "@/components/Notice";
export function CalendarEntryForm({ contacts, contactId = "", timezone, date, entry }: { contacts: Array<{ id: string; displayName: string }>; contactId?: string; timezone: string; date: string; entry?: { id: string; version: number; title: string; kind: string; startsAt: string; endsAt: string; contactId: string | null } }) {
  const [values, setValues] = useState({ title: entry?.title ?? "", kind: entry?.kind ?? "MEETING", contactId: entry?.contactId ?? contactId, startsAt: entry?.startsAt ?? `${date}T09:00`, endsAt: entry?.endsAt ?? `${date}T09:30`, timezone, allowOverlap: false });
  const [state, action, pending] = useActionState(saveCalendarAction, { error: "" });
  return <form action={action} className="form-grid" onChange={event => { const field = event.target as HTMLInputElement; setValues(current => ({ ...current, [field.name]: field.type === "checkbox" ? field.checked : field.value })); }}>{state.error && <div className="field full"><Notice type="error">{state.error}</Notice></div>}<input type="hidden" name="id" value={entry?.id ?? ""} /><input type="hidden" name="version" value={entry?.version ?? 0} />
    <label className="field full"><span>Title</span><input name="title" maxLength={160} value={values.title} onChange={() => {}} placeholder="For example, Discovery call or Focus time" required /></label>
    <label className="field"><span>Event type</span><select name="kind" value={values.kind} onChange={() => {}}><option value="MEETING">Meeting</option><option value="BLOCK">Time block</option></select></label>
    <label className="field"><span>Contact (optional)</span><select name="contactId" value={values.contactId} onChange={() => {}}><option value="">No contact</option>{contacts.map(contact => <option value={contact.id} key={contact.id}>{contact.displayName}</option>)}</select></label>
    <label className="field"><span>Starts</span><input type="datetime-local" name="startsAt" value={values.startsAt} onChange={() => {}} required /></label>
    <label className="field"><span>Ends</span><input type="datetime-local" name="endsAt" value={values.endsAt} onChange={() => {}} required /></label>
    <label className="field full"><span>Timezone</span><input name="timezone" value={values.timezone} onChange={() => {}} list="calendar-timezones" required /><datalist id="calendar-timezones">{[timezone,"UTC","America/Los_Angeles","America/New_York","Europe/London","Europe/Paris","Asia/Kolkata","Asia/Tokyo","Australia/Sydney"].filter((zone, index, all) => all.indexOf(zone) === index).map(zone => <option value={zone} key={zone} />)}</datalist></label>
    <label className="field full checkbox-row"><input type="checkbox" name="allowOverlap" checked={values.allowOverlap} onChange={() => {}} /><span>Allow an intentional overlap with another event</span></label>
    <p className="muted-copy field full">A meeting linked to a contact can trigger your journey rules. Save it here, then use its calendar download to share through your preferred provider. Saving does not send an invitation.</p>
    <div className="form-actions field full"><button className="button primary" disabled={pending}>{pending ? "Saving…" : entry ? "Save changes" : "Save event"}</button></div>
  </form>;
}
