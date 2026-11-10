"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TimezonePicker } from "@/components/TimezonePicker";
import { FormGuard } from "@/components/FormGuard";
import { startTransition, useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { saveCalendarAction, type CalendarSaveState } from "@/lib/calendar-actions";
import { UNCONFIRMED_SAVE, isNavigationSignal } from "@/lib/unconfirmed-save";
import type { ContactCandidate } from "@/lib/appointment-bindings";
import { Notice } from "@/components/Notice";
import { RequiredFieldsNote } from "@/components/RequiredFieldsNote";
import { WhenPicker, type WhenAvailability } from "@/components/WhenPicker";
import { addMinutesToLocal, formatDateTrigger, formatDurationLabel, formatTimeLabel, minutesOf, splitLocal } from "@/lib/when-picker";
import { zoneLabel } from "@/lib/display-labels";

const DURATIONS = [15, 30, 45, 60, 90, 120] as const;
type Duration = (typeof DURATIONS)[number] | "custom";

type Entry = { id: string; version: number; title: string; kind: string; startsAt: string; endsAt: string; contactId: string | null; location?: string | null; link?: string | null; details?: string | null };

function initialDuration(entry: Entry | undefined): Duration {
  if (!entry) return 30;
  const starts = splitLocal(entry.startsAt), ends = splitLocal(entry.endsAt);
  if (!starts || !ends) return "custom";
  const minutes = starts.date === ends.date ? minutesOf(ends.time) - minutesOf(starts.time) : -1;
  return (DURATIONS as readonly number[]).includes(minutes) ? minutes as Duration : "custom";
}

export function CalendarEntryForm({ contacts, contactId = "", timezone, date, entry, locale, plans = [], returnTo, viewOnly = false }: { returnTo?: string | null; /** A support session reads the form but cannot save it. */ viewOnly?: boolean; plans?: Array<{ id: string; name: string }>; contacts: Array<{ id: string; displayName: string }>; contactId?: string; timezone: string; date: string; entry?: Entry; locale?: string }) {
  const starts = splitLocal(entry?.startsAt ?? "") ?? { date, time: "09:00" };
  // Every field is controlled so a returned error or an inline person choice never clears what was typed.
  const initialValues = { title: entry?.title ?? "", kind: entry?.kind ?? "MEETING", contactId: entry?.contactId ?? contactId, date: starts.date, time: starts.time, duration: initialDuration(entry), customEnd: entry?.endsAt ?? `${date}T09:30`, timezone, allowOverlap: false, location: entry?.location ?? "", link: entry?.link ?? "", details: entry?.details ?? "", newContactName: "", newContactPhone: "", newContactEmail: "", resolvedContactId: "", planId: "" };
  const [values, setValues] = useState(initialValues);
  const [availability, setAvailability] = useState<WhenAvailability | null>(null);
  const [newPersonOpen, setNewPersonOpen] = useState(false);
  const [state, action, pending] = useActionState<CalendarSaveState, FormData>(async (previous, data) => {
    try { return await saveCalendarAction(previous, data); }
    catch (cause) { if (isNavigationSignal(cause)) throw cause; return { error: UNCONFIRMED_SAVE }; }
  }, { error: "" });
  // Directory searches must not remove an already selected option from this draft.
  const selectedContact = useRef(contacts.find(contact => contact.id === values.contactId));
  const initialContact = useRef(selectedContact.current);
  const matchingContact = contacts.find(contact => contact.id === values.contactId);
  if (matchingContact) selectedContact.current = matchingContact;
  const contactOptions = !matchingContact && selectedContact.current?.id === values.contactId ? [selectedContact.current, ...contacts] : contacts;
  const router = useRouter(), searchParams = useSearchParams(), contactListId = useId();
  const [contactSearch, setContactSearch] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [activeContact, setActiveContact] = useState(0);
  const [searchPending, searchTransition] = useTransition();
  const contactInput = useRef<HTMLInputElement>(null);
  const query = contactSearch?.trim() ?? searchParams.get("q")?.trim() ?? "";
  const searching = searchPending || (contactOpen && contactSearch !== null && query !== (searchParams.get("q") ?? "").trim());
  const visibleContacts = contactOptions.filter(contact => !query || contact.displayName.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const highlightedContact = Math.min(activeContact, visibleContacts.length);
  useEffect(() => {
    if (contactOpen) document.getElementById(`${contactListId}-${highlightedContact}`)?.scrollIntoView({ block: "nearest" });
  }, [contactOpen, contactListId, highlightedContact]);
  const chooseContact = (contact?: { id: string; displayName: string }) => {
    selectedContact.current = contact;
    setValues(current => ({ ...current, contactId: contact?.id ?? "", resolvedContactId: "" }));
    setContactSearch(""); setContactOpen(false); setNewPersonOpen(false); setChoice([]);
  };
  // Keep the page's workspace-scoped directory search: the initial list is capped, not the directory.
  // Only q changes, so the form's stable key and every unsaved field survive the server refresh.
  useEffect(() => {
    if (!contactOpen || contactSearch === null || query === (searchParams.get("q") ?? "").trim()) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) params.set("q", query); else params.delete("q");
      searchTransition(() => router.replace(`/calendar?${params}`, { scroll: false }));
    }, 200);
    return () => clearTimeout(timer);
  }, [contactOpen, contactSearch, query, router, searchParams]);
  useEffect(() => {
    contactInput.current?.setCustomValidity(values.kind === "MEETING" && !newPersonOpen && !values.contactId && query ? "Choose a saved contact, create a new contact, or clear the search." : "");
  }, [values.kind, values.contactId, newPersonOpen, query]);
  const errorRef = useRef<HTMLDivElement>(null);
  const choiceRef = useRef<HTMLLegendElement>(null);
  useEffect(() => { if (state.error) errorRef.current?.focus(); }, [state]);
  const update = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues(current => ({ ...current, [key]: value }));
  // The people to choose between stay on the form until the person's details change, so a choice
  // already made survives a later error (an overlap, say) and is sent with the next save.
  const [choice, setChoice] = useState<ContactCandidate[]>([]);
  useEffect(() => { if (state.choice) setChoice(state.choice.candidates); }, [state]);
  useEffect(() => { if (choice.length) choiceRef.current?.focus(); }, [choice]);
  // Changing the person's details makes an earlier choice stale; the server rechecks it against the same matches anyway.
  const updatePerson = (key: "newContactName" | "newContactPhone" | "newContactEmail", value: string) => { setChoice([]); setValues(current => ({ ...current, [key]: value, resolvedContactId: "" })); };
  // FormGuard's capture listener permits this click only after any discard confirmation.
  // Reset explicitly: the agenda may keep this same event mounted after Cancel.
  const cancel = () => {
    setValues(initialValues); selectedContact.current = initialContact.current;
    setContactSearch(""); setContactOpen(false); setNewPersonOpen(false); setChoice([]);
  };

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
  const endSummary = end ? `Ends ${end.date === values.date ? "" : `${formatDateTrigger(end.date, undefined, locale)} at `}${formatTimeLabel(end.time, locale)}` : "Choose when it ends";

  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(() => action(data)); };
  // React resets a form submitted through its action prop once the action settles, which blanks
  // controlled fields too. Dispatching the same action from the submit event keeps what was typed
  // while a returned error or person choice is shown; the action prop remains for no-script submits.
  return <form action={action} onReset={event => event.preventDefault()} onSubmit={submit} onInvalid={event => {
    let details = (event.target as HTMLElement).closest("details");
    while (details) { details.open = true; details = details.parentElement?.closest("details") ?? null; }
  }} className="form-grid calendar-entry-form"><FormGuard preservedQuery={{ ...(returnTo ? { returnTo } : {}), date, ...(entry ? { edit: entry.id } : { new: "1", contact: contactId }) }} />{state.error && <div ref={errorRef} tabIndex={-1} className="field full"><Notice type="error">{state.error}</Notice></div>}<fieldset disabled={pending || viewOnly} className="calendar-entry-fields" aria-label="Event details"><input type="hidden" name="id" value={entry?.id ?? ""} /><input type="hidden" name="version" value={entry?.version ?? 0} />{returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
    <input type="hidden" name="startsAt" value={startsAt} /><input type="hidden" name="endsAt" value={endsAt} /><RequiredFieldsNote />
    <label className="field full calendar-title"><span>Title</span><input name="title" maxLength={160} value={values.title} onChange={event => update("title", event.target.value)} placeholder="For example, Discovery call or Focus time" required /></label>
    <label className="field calendar-kind"><span>Event type</span><select name="kind" value={values.kind} onChange={event => update("kind", event.target.value)}><option value="MEETING">Meeting</option><option value="BLOCK">Time block</option></select></label>
    <input type="hidden" name="contactId" value={values.kind === "MEETING" ? values.contactId : ""} />
    {values.kind === "MEETING" && <div className="field full calendar-form-row calendar-with">
      <label htmlFor={`${contactListId}-input`}>Contact (optional)</label>
      <div className="calendar-contact-picker">
        <input id={`${contactListId}-input`} ref={contactInput} role="combobox" aria-autocomplete="list" aria-expanded={contactOpen} aria-controls={contactListId} aria-describedby={`${contactListId}-hint`}
          aria-activedescendant={contactOpen ? `${contactListId}-${highlightedContact}` : undefined} autoComplete="off" maxLength={160} placeholder="Search saved contacts"
          value={contactOpen && contactSearch !== null ? contactSearch : values.contactId ? selectedContact.current?.displayName ?? "" : contactSearch ?? searchParams.get("q") ?? ""}
          onFocus={() => { setContactOpen(true); setActiveContact(0); }} onBlur={() => setContactOpen(false)}
          onChange={event => { setContactSearch(event.target.value); setContactOpen(true); setActiveContact(0); setNewPersonOpen(false); }}
          onKeyDown={event => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); setContactOpen(true);
              setActiveContact(current => (current + (event.key === "ArrowDown" ? 1 : visibleContacts.length)) % (visibleContacts.length + 1));
            } else if (event.key === "Enter" && contactOpen) {
              event.preventDefault(); chooseContact(visibleContacts[highlightedContact - 1]);
            } else if (event.key === "Escape") { event.preventDefault(); setContactOpen(false); }
          }} />
        <ul id={contactListId} role="listbox" aria-label="Saved contacts" className="calendar-contact-options" hidden={!contactOpen}>
          {[{ id: "", displayName: "No contact" }, ...visibleContacts].map((contact, index) => <li key={contact.id} id={`${contactListId}-${index}`} role="option" aria-selected={highlightedContact === index}
            onPointerDown={event => event.preventDefault()} onClick={() => chooseContact(contact.id ? contact : undefined)}>{contact.displayName}</li>)}
        </ul>
        <small id={`${contactListId}-hint`} role="status">{contactOpen && values.contactId && <>Selected: {selectedContact.current?.displayName}. </>}{searching ? "Searching contacts…" : contactOpen && query && !visibleContacts.length ? "No saved contacts match. Try another name or create a new contact." : "Search your directory by name, then choose a contact."}</small>
        {!entry && <button type="button" className="button" aria-expanded={newPersonOpen} onClick={() => { chooseContact(); setNewPersonOpen(!newPersonOpen); }}>{newPersonOpen ? "Use a saved contact" : "Create new contact"}</button>}
      </div>
    {newPersonOpen && !entry && <div className="calendar-new-contact">
      <div className="form-grid">
        <label className="field full"><span>Name</span><input name="newContactName" maxLength={200} value={values.newContactName} onChange={event => updatePerson("newContactName", event.target.value)} placeholder="Jordan Lee" /></label>
        <label className="field"><span>Phone (optional)</span><input name="newContactPhone" inputMode="tel" autoComplete="off" value={values.newContactPhone} onChange={event => updatePerson("newContactPhone", event.target.value)} placeholder="(555) 555-0123" /></label>
        <label className="field"><span>Email (optional)</span><input name="newContactEmail" inputMode="email" autoComplete="off" value={values.newContactEmail} onChange={event => updatePerson("newContactEmail", event.target.value)} placeholder="jordan@example.com" /></label>
        {choice.length > 0 && <fieldset className="field full contact-choice"><legend ref={choiceRef} tabIndex={-1}>Which saved person is this visit with?</legend>
          <p className="muted-copy">More than one saved person matches the phone or email you entered. Choose one, or change the phone or email. Everything you entered is kept, and nothing has been saved yet.</p>
          {choice.map(candidate => <label className="checkbox-card" key={candidate.id}><input type="radio" name="resolvedContactId" value={candidate.id} checked={values.resolvedContactId === candidate.id} onChange={() => update("resolvedContactId", candidate.id)} required /><span><strong>{candidate.displayName}</strong><small>Matches the {candidate.matched.join(" and ")} you entered</small></span></label>)}
        </fieldset>}
        <p className="muted-copy field full">Saved with the visit. A person already saved with this phone or email is used instead of a duplicate; if more than one matches, you choose which.</p>
      </div>
    </div>}
    </div>}
    <div className="field full calendar-form-row"><span className="field-label">When</span><WhenPicker label="Starts" locale={locale} date={values.date} time={values.time} availability={availability ?? undefined} allowOverlap={values.allowOverlap} onChange={next => setValues(current => ({ ...current, date: next.date, time: next.time ?? current.time }))} /></div>
    <div className="field full calendar-form-row calendar-timezone"><TimezonePicker defaultValue={values.timezone} onChange={zone => update("timezone", zone)} label="Event timezone" /><small>Times are {zoneLabel(values.timezone)}. Changing the time zone keeps the clock times you entered.</small></div>
    <div className="field full when-duration calendar-form-row"><span className="field-label">Duration</span>
      <div className="when-chips" role="group" aria-label="How long">{DURATIONS.map(minutes => <button type="button" key={minutes} className="when-chip" aria-pressed={values.duration === minutes} onClick={() => update("duration", minutes)}>{formatDurationLabel(minutes)}</button>)}<button type="button" className="when-chip" aria-pressed={values.duration === "custom"} onClick={() => update("duration", "custom")}>Custom end</button></div>
      {values.duration === "custom" ? <label className="when-duration-custom"><span>Ends</span><input type="datetime-local" aria-label="Ends" value={values.customEnd} onChange={event => update("customEnd", event.target.value)} required /></label> : <p className="when-ends-summary">{endSummary}</p>}
    </div>
    <label className="field full calendar-form-row"><span>Where (optional)</span><input name="location" maxLength={200} value={values.location} onChange={event => update("location", event.target.value)} placeholder="Address or place, for reminders" /></label>
    {values.kind === "MEETING" && plans.length > 0 && !entry && <label className="field full"><span>Follow-up Mix for this visit (optional)</span><select name="planId" value={values.planId} onChange={event => update("planId", event.target.value)}><option value="">No Mix</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><small>Its reminders and check-ins line up with this appointment and move with it. Nothing is sent automatically unless you turn that on for this visit.</small></label>}
    {values.kind === "MEETING" && plans.length === 0 && !entry && <p className="muted-copy field full">No Mix is ready to line up with a visit yet. <Link href="/mixes/new?custom=1" className="inline-action">Create a Mix</Link> with the cue “When I start it for someone” and start it; no one needs to be enrolled first.</p>}
    <details className="field full calendar-extra-details" open={Boolean(entry?.link || entry?.details)}><summary>More event details</summary><div className="form-grid">
    <label className="field full"><span>Link to join or find it (optional)</span><input name="link" type="url" inputMode="url" maxLength={500} value={values.link} onChange={event => update("link", event.target.value)} placeholder="https://" /></label>
    <label className="field full"><span>Details the customer should be reminded of (optional)</span><textarea name="details" maxLength={1000} rows={2} value={values.details} onChange={event => update("details", event.target.value)} placeholder="What to bring, where to park, who to ask for" /></label>
    <label className="field full checkbox-row"><input type="checkbox" name="allowOverlap" checked={values.allowOverlap} onChange={event => update("allowOverlap", event.target.checked)} /><span>Allow an intentional overlap with another event{availability && availability.bufferMinutes > 0 ? ` or its ${availability.bufferMinutes}-minute buffer` : ""}</span></label>
    </div></details>
    <div className="form-actions field full calendar-save-actions"><p className="muted-copy">Saved to your calendar only. No invitation is sent.{values.kind === "MEETING" && values.contactId ? " Your stage rules may start follow-ups for this person." : ""}</p>{entry && <a className="button" href={`/api/calendar/export?id=${encodeURIComponent(entry.id)}`}>Download for sharing</a>}{pending ? <span className="button" aria-disabled="true">Cancel</span> : <Link className="button" href={`/calendar?date=${date}`} onClick={cancel}>Cancel</Link>}<button className="button primary" disabled={pending}>{pending ? "Saving…" : entry ? "Save changes" : "Save event"}</button></div>
  </fieldset>
  </form>;
}
