"use client";
import { useActionState, useEffect, useState } from "react";
import { saveCalendarAction } from "@/lib/calendar-actions";
import { Notice } from "@/components/Notice";
import { WhenPicker, type WhenAvailability } from "@/components/WhenPicker";
import { addMinutesToLocal, formatDateTrigger, formatDurationLabel, formatTimeLabel, minutesOf, splitLocal } from "@/lib/when-picker";

const DURATIONS = [15, 30, 45, 60, 90, 120] as const;
type Duration = (typeof DURATIONS)[number] | "custom";

type Entry = { id: string; version: number; title: string; kind: string; startsAt: string; endsAt: string; contactId: string | null };

function initialDuration(entry: Entry | undefined): Duration {
  if (!entry) return 30;
  const starts = splitLocal(entry.startsAt), ends = splitLocal(entry.endsAt);
  if (!starts || !ends) return "custom";
  const minutes = starts.date === ends.date ? minutesOf(ends.time) - minutesOf(starts.time) : -1;
  return (DURATIONS as readonly number[]).includes(minutes) ? minutes as Duration : "custom";
}

export function CalendarEntryForm({ contacts, contactId = "", timezone, date, entry, locale }: { contacts: Array<{ id: string; displayName: string }>; contactId?: string; timezone: string; date: string; entry?: Entry; locale?: string }) {
  const starts = splitLocal(entry?.startsAt ?? "") ?? { date, time: "09:00" };
  const [values, setValues] = useState({ title: entry?.title ?? "", kind: entry?.kind ?? "MEETING", contactId: entry?.contactId ?? contactId, date: starts.date, time: starts.time, duration: initialDuration(entry), customEnd: entry?.endsAt ?? `${date}T09:30`, timezone, allowOverlap: false });
  const [availability, setAvailability] = useState<WhenAvailability | null>(null);
  const [state, action, pending] = useActionState(saveCalendarAction, { error: "" });
  const update = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues(current => ({ ...current, [key]: value }));

  // What is already on the calendar that day, so the time grid can gray out taken slots by name.
  useEffect(() => {
    let cancelled = false;
    setAvailability(current => ({ bufferMinutes: current?.bufferMinutes ?? 0, entries: current?.entries ?? [], candidateKind: values.kind, loading: true }));
    fetch(`/api/calendar/availability?date=${encodeURIComponent(values.date)}&timezone=${encodeURIComponent(values.timezone)}`, { headers: { accept: "application/json" } })
      .then(async response => {
        const payload = await response.json().catch(() => ({})) as { bufferMinutes?: number; entries?: WhenAvailability["entries"]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Your calendar could not be checked.");
        if (!cancelled) setAvailability({ bufferMinutes: payload.bufferMinutes ?? 0, entries: (payload.entries ?? []).filter(item => item.id !== entry?.id), candidateKind: values.kind });
      })
      .catch(error => { if (!cancelled) setAvailability({ bufferMinutes: 0, entries: [], candidateKind: values.kind, error: error instanceof Error ? error.message : "Your calendar could not be checked." }); });
    return () => { cancelled = true; };
  }, [values.date, values.timezone, values.kind, entry?.id]);

  const end = values.duration === "custom" ? splitLocal(values.customEnd) : addMinutesToLocal(values.date, values.time, values.duration);
  const startsAt = `${values.date}T${values.time}`;
  const endsAt = values.duration === "custom" ? values.customEnd : `${end!.date}T${end!.time}`;
  const endSummary = end ? `Ends ${end.date === values.date ? "" : `${formatDateTrigger(end.date)} at `}${formatTimeLabel(end.time)}` : "Choose when it ends";

  return <form action={action} className="form-grid">{state.error && <div className="field full"><Notice type="error">{state.error}</Notice></div>}<input type="hidden" name="id" value={entry?.id ?? ""} /><input type="hidden" name="version" value={entry?.version ?? 0} />
    <input type="hidden" name="startsAt" value={startsAt} /><input type="hidden" name="endsAt" value={endsAt} />
    <label className="field full"><span>Title</span><input name="title" maxLength={160} value={values.title} onChange={event => update("title", event.target.value)} placeholder="For example, Discovery call or Focus time" required /></label>
    <label className="field"><span>Event type</span><select name="kind" value={values.kind} onChange={event => update("kind", event.target.value)}><option value="MEETING">Meeting</option><option value="BLOCK">Time block</option></select></label>
    <label className="field"><span>Contact (optional)</span><select name="contactId" value={values.contactId} onChange={event => update("contactId", event.target.value)}><option value="">No contact</option>{contacts.map(contact => <option value={contact.id} key={contact.id}>{contact.displayName}</option>)}</select></label>
    <div className="field full"><span className="field-label">Starts</span><WhenPicker label="Starts" locale={locale} date={values.date} time={values.time} availability={availability ?? undefined} allowOverlap={values.allowOverlap} onChange={next => setValues(current => ({ ...current, date: next.date, time: next.time ?? current.time }))} /></div>
    <div className="field full when-duration"><span className="field-label">How long</span>
      <div className="when-chips" role="group" aria-label="How long">{DURATIONS.map(minutes => <button type="button" key={minutes} className="when-chip" aria-pressed={values.duration === minutes} onClick={() => update("duration", minutes)}>{formatDurationLabel(minutes)}</button>)}<button type="button" className="when-chip" aria-pressed={values.duration === "custom"} onClick={() => update("duration", "custom")}>Custom end</button></div>
      {values.duration === "custom" ? <label className="when-duration-custom"><span className="sr-only">Ends</span><input type="datetime-local" aria-label="Ends" value={values.customEnd} onChange={event => update("customEnd", event.target.value)} required /></label> : <p className="when-ends-summary">{endSummary}</p>}
    </div>
    <label className="field full"><span>Timezone</span><input name="timezone" value={values.timezone} onChange={event => update("timezone", event.target.value)} list="calendar-timezones" required /><datalist id="calendar-timezones">{[timezone,"UTC","America/Los_Angeles","America/New_York","Europe/London","Europe/Paris","Asia/Kolkata","Asia/Tokyo","Australia/Sydney"].filter((zone, index, all) => all.indexOf(zone) === index).map(zone => <option value={zone} key={zone} />)}</datalist></label>
    <label className="field full checkbox-row"><input type="checkbox" name="allowOverlap" checked={values.allowOverlap} onChange={event => update("allowOverlap", event.target.checked)} /><span>Allow an intentional overlap with another event{availability && availability.bufferMinutes > 0 ? ` or its ${availability.bufferMinutes}-minute buffer` : ""}</span></label>
    <p className="muted-copy field full">A meeting linked to a contact can trigger your journey rules. Save it here, then use its calendar download to share through your preferred provider. Saving does not send an invitation.</p>
    <div className="form-actions field full"><button className="button primary" disabled={pending}>{pending ? "Saving…" : entry ? "Save changes" : "Save event"}</button></div>
  </form>;
}
