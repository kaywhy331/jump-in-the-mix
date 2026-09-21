"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";
import { VoiceNoteButton } from "@/components/VoiceNoteButton";
import { inferQuickCaptureReview } from "@/lib/quick-add-capture";
import type { QuickCaptureContact, QuickCaptureInput, QuickCaptureReceipt } from "@/lib/quick-capture-input";

const OPEN_QUICK_ADD = "jitm:quick-add";
type QuickAddWindow = Window & { __jitmQuickAddPending?: boolean };

function requestQuickAdd() {
  const target = window as QuickAddWindow;
  target.__jitmQuickAddPending = true;
  target.dispatchEvent(new Event(OPEN_QUICK_ADD));
}

export function QuickAddButton({ mobile = false }: { mobile?: boolean }) {
  return <button type="button" className={mobile ? "nav-link nav-quick-add" : "button primary global-quick-add"} onClick={requestQuickAdd} aria-label="Quick Add" aria-keyshortcuts="N">
    <AppIcon name="plus" /> <span>Quick Add</span>{!mobile && <kbd aria-hidden="true">N</kbd>}
  </button>;
}

function CaptureDetails({ initialOpen, children }: { initialOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  return <details open={open} onToggle={e => setOpen(e.currentTarget.open)}>{children}</details>;
}

export function QuickAddDialog({ timezone }: { timezone: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const requestId = useRef("");
  const saveController = useRef<AbortController | null>(null);
  const [capture, setCapture] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof inferQuickCaptureReview> | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState(true);
  const [person, setPerson] = useState<QuickCaptureContact | null>(null);
  const [contacts, setContacts] = useState<QuickCaptureContact[]>([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [recoveryReceipt, setRecoveryReceipt] = useState<QuickCaptureReceipt | null>(null);
  const [receipt, setReceipt] = useState<QuickCaptureReceipt | null>(null);

  useEffect(() => { if (dialogRef.current?.open) { dialogRef.current.scrollTop = 0; (preview || receipt ? reviewRef.current : inputRef.current)?.focus({ preventScroll: true }); } }, [Boolean(preview), Boolean(receipt)]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (!preview || person || !search.trim()) { setContacts([]); setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true); setSearchError("");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/quick-capture?q=${encodeURIComponent(search)}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Contact search is unavailable.");
        setContacts(result.contacts);
      } catch (failure) { if (!controller.signal.aborted) setSearchError(failure instanceof Error ? failure.message : "Contact search is unavailable."); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, Boolean(preview), person]);

  useEffect(() => {
    if (!capture.trim() || receipt) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [capture, receipt]);
  useEffect(() => () => saveController.current?.abort(), []);

  const reset = () => { setCapture(""); setPreview(null); setError(""); setReceipt(null); setRecoveryReceipt(null); setPerson(null); setContacts([]); setSearch(""); setAllowDuplicate(false); setSaveNote(true); requestId.current = ""; };
  const closeDialog = () => {
    if (saving || (!receipt && capture.trim() && !window.confirm(recoveryReceipt ? "Leave without applying your later edits? Your earlier capture is saved." : "Discard this Quick Add draft? If a save was interrupted, it may already have completed."))) return false;
    reset(); dialogRef.current?.close(); return true;
  };
  useEffect(() => {
    const open = () => { (window as QuickAddWindow).__jitmQuickAddPending = false; dialogRef.current?.showModal(); window.setTimeout(() => inputRef.current?.focus(), 0); };
    const shortcut = (event: KeyboardEvent) => { if (event.key.toLowerCase() !== "n" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector("dialog:modal")) return; const target = event.target; if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return; event.preventDefault(); open(); };
    window.addEventListener("keydown", shortcut); window.addEventListener(OPEN_QUICK_ADD, open);
    if ((window as QuickAddWindow).__jitmQuickAddPending) open();
    return () => { window.removeEventListener("keydown", shortcut); window.removeEventListener(OPEN_QUICK_ADD, open); };
  }, []);

  const save = async () => {
    if (!preview || saving || recoveryReceipt) return;
    setSaving(true); setError("");
    const start = `${preview.event.date}T${preview.event.time}`;
    // Add the reviewed duration in local wall-clock time; the server validates both instants, including DST.
    const end = new Date(`${start}:00Z`);
    end.setUTCMinutes(end.getUTCMinutes() + Number(preview.event.duration));
    const payload: QuickCaptureInput = {
      requestId: requestId.current,
      person: person ? { mode: "existing", id: person.id } : { mode: "new", name: preview.name, phone: preview.phone ?? "", email: preview.email ?? "", allowDuplicate },
      note: saveNote ? preview.note : null,
      event: preview.event.enabled ? { title: preview.event.title, startsAt: start, endsAt: Number.isFinite(end.getTime()) ? end.toISOString().slice(0, 16) : "", location: preview.event.location, allowOverlap: preview.event.allowOverlap } : null,
      followUp: preview.followUp.enabled ? { reason: preview.followUp.reason, when: `${preview.followUp.date}T${preview.followUp.time}`, channel: preview.followUp.channel as NonNullable<QuickCaptureInput["followUp"]>["channel"], subject: preview.followUp.subject, wording: preview.followUp.wording } : null
    };
    const controller = new AbortController();
    saveController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    const uncertain = "We couldn’t confirm whether your capture saved. Your draft is still here. Try saving again to check safely; saved items won’t be duplicated.";
    try {
      const response = await fetch("/api/quick-capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
      const result = await response.json();
      if (!response.ok) {
        if (result.contacts?.length) setContacts(result.contacts);
        if (response.status === 409 && result.receipt) setRecoveryReceipt(result.receipt);
        setError(response.status >= 500 ? uncertain : result.error || "Your capture could not be saved. Review the details and try again.");
        return;
      }
      setReceipt(result.receipt); setPreview(null); router.refresh();
    } catch { setError(uncertain); }
    finally { window.clearTimeout(timeout); saveController.current = null; setSaving(false); }
  };
  const event = preview?.event, followUp = preview?.followUp;
  const updateEvent = (patch: Partial<NonNullable<typeof event>>) => setPreview(current => current ? { ...current, event: { ...current.event, ...patch } } : current);
  const updateFollowUp = (patch: Partial<NonNullable<typeof followUp>>) => setPreview(current => current ? { ...current, followUp: { ...current.followUp, ...patch } } : current);
  const count = (person ? 0 : 1) + Number(saveNote) + Number(event?.enabled) + Number(followUp?.enabled);

  return <dialog ref={dialogRef} className="quick-add-dialog" aria-labelledby="quick-add-title" onCancel={e => { e.preventDefault(); closeDialog(); }}>
    <div className="quick-add-dialog-header"><h2 id="quick-add-title">Quick Add</h2><button className="icon-button" type="button" disabled={saving} onClick={closeDialog} aria-label="Close Quick Add"><AppIcon name="close" /></button></div>
    <form className="quick-add-composer" hidden={Boolean(preview || receipt)} onSubmit={e => { e.preventDefault(); if (!capture.trim()) return; const result = inferQuickCaptureReview(capture, new Date(), timezone); setPreview(result); setSearch(result.name); setError(""); requestId.current ||= crypto.randomUUID(); }}>
      <label className="field"><span className="sr-only">What do you want to remember?</span><textarea id="quick-add-capture" ref={inputRef} value={capture} maxLength={2000} onChange={e => setCapture(e.target.value)} placeholder="Coffee with Maria Thursday at 9 am, then call Friday about the estimate" rows={2}/></label>
      <VoiceNoteButton targetId="quick-add-capture" label="Speak" /><button className="button primary quick-add-review" type="submit" disabled={!capture.trim()}>Continue</button>
    </form>
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className={`notice ${recoveryReceipt ? "info" : "error"}`}><p>{error}{recoveryReceipt && " Your later edits are still shown below. Open the saved person to continue editing."}</p>{recoveryReceipt && <Link className="button" href={`/contacts/${recoveryReceipt.contactId}`} onClick={e => { if (!closeDialog()) e.preventDefault(); }}>Open saved person</Link>}</div>}
    {receipt && <section className="quick-add-proposal"><strong ref={reviewRef} tabIndex={-1}>Saved together</strong><p>{[receipt.createdPerson && "Person", receipt.noteId && "private note", receipt.eventId && "event", receipt.jumpId && "follow-up"].filter(Boolean).join(", ")} saved.</p><div className="card-actions"><Link className="button" href={`/contacts/${receipt.contactId}`} onClick={closeDialog}>View person</Link>{receipt.jumpId && <Link className="button" href={`/jumps?jump=${receipt.jumpId}&range=all`} onClick={closeDialog}>View follow-up</Link>}<button type="button" className="button primary" onClick={closeDialog}>Done</button></div></section>}
    {preview && event && followUp && <section className="quick-add-proposal"><blockquote className="quick-add-original">{capture}</blockquote><strong ref={reviewRef} tabIndex={-1}>Saving as</strong><p>Check each item. Dates and times use {timezone}.</p>
      <form className="quick-capture-form" onSubmit={e => { e.preventDefault(); void save(); }} onInvalid={e => { const details = (e.target as HTMLElement).closest("details"); if (details) details.open = true; }}>
      <fieldset disabled={saving} className="quick-capture-fields">
        <section className="quick-add-item" aria-label="Person"><h3><AppIcon name="contacts" />{person ? "Existing person" : "New person"}</h3>
          {person ? <div className="quick-capture-match"><div><strong>{person.displayName}</strong><small>{person.email || person.phone || "No contact details yet"}</small></div><button className="button small" type="button" onClick={() => { setPerson(null); setSearch(preview.name); }}>Someone else</button></div> : <>
            <label className="field"><span>Name or search for someone</span><input value={search} maxLength={200} required onChange={e => { setSearch(e.target.value); setPreview({ ...preview, name: e.target.value }); setAllowDuplicate(false); }} /></label>
            <div aria-live="polite">{searching && <small>Looking for a match…</small>}{searchError && <p>{searchError} Saving will still check for duplicates.</p>}</div>
            {contacts.length > 0 && <div className="quick-capture-matches"><p>Use an existing person?</p>{contacts.map(contact => <button type="button" className="quick-capture-match" key={contact.id} disabled={contact.archived} onClick={() => { setPerson(contact); setAllowDuplicate(false); setError(""); }}><span><strong>{contact.displayName}</strong><small>{contact.archived ? "Archived · restore from Contacts to use" : contact.email || contact.phone || "No contact details yet"}</small></span>{!contact.archived && <span>Choose</span>}</button>)}<label className="checkbox-label"><input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)} />This is a different person. Create a new contact.</label></div>}
            <details><summary>{[preview.phone, preview.email].filter(Boolean).join(" · ") || "Add phone or email (optional)"}</summary><div className="form-grid"><label className="field"><span>Phone</span><input type="tel" value={preview.phone ?? ""} maxLength={80} onChange={e => { setPreview({ ...preview, phone: e.target.value }); setAllowDuplicate(false); }} /></label><label className="field"><span>Email</span><input type="email" value={preview.email ?? ""} maxLength={254} onChange={e => { setPreview({ ...preview, email: e.target.value }); setAllowDuplicate(false); }} /></label></div>{(preview.phone || preview.email) && <small>Recognized details are included when you save.</small>}</details>
          </>}
        </section>
        <section className="quick-add-item"><label className="quick-capture-toggle"><input type="checkbox" checked={saveNote} onChange={e => setSaveNote(e.target.checked)} /><strong>Private note</strong></label>{saveNote && <details><summary>Keep the original capture · edit note</summary><label className="field"><span>Note</span><textarea value={preview.note} maxLength={2000} required rows={3} onChange={e => setPreview({ ...preview, note: e.target.value })}/></label></details>}</section>
        <section className="quick-add-item"><label className="quick-capture-toggle"><input type="checkbox" checked={event.enabled} onChange={e => updateEvent({ enabled: e.target.checked })} /><strong>Event</strong></label>{event.enabled && <CaptureDetails initialOpen={!event.date || !event.time || !event.title}><summary>{event.title || "Add event details"} <span>{event.date} {event.time} · {event.duration} min{event.location ? ` · ${event.location}` : ""} · Edit</span></summary><div className="form-grid"><label className="field full"><span>Event title</span><input required maxLength={160} value={event.title} onChange={e => updateEvent({ title: e.target.value })}/></label><label className="field"><span>Event date</span><input type="date" required value={event.date} onChange={e => updateEvent({ date: e.target.value })}/></label><label className="field"><span>Start time</span><input type="time" required value={event.time} onChange={e => updateEvent({ time: e.target.value })}/></label><label className="field"><span>Duration</span><select value={event.duration} onChange={e => updateEvent({ duration: e.target.value })}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="90">1½ hours</option><option value="120">2 hours</option></select></label><label className="field"><span>Location</span><input maxLength={500} value={event.location} onChange={e => updateEvent({ location: e.target.value })}/></label><label className="checkbox-label full"><input type="checkbox" checked={event.allowOverlap} onChange={e => updateEvent({ allowOverlap: e.target.checked })}/>Allow this event to overlap my calendar or appointment buffer</label></div></CaptureDetails>}</section>
        <section className="quick-add-item"><label className="quick-capture-toggle"><input type="checkbox" checked={followUp.enabled} onChange={e => updateFollowUp({ enabled: e.target.checked })}/><strong>Follow-up</strong></label>{followUp.enabled && <CaptureDetails initialOpen={!followUp.date || !followUp.time || !followUp.wording}><summary>{followUp.reason} <span>{followUp.date} {followUp.time} · Edit</span></summary><div className="form-grid"><label className="field full"><span>Reason</span><input maxLength={300} required value={followUp.reason} onChange={e => updateFollowUp({ reason: e.target.value })}/></label><label className="field"><span>Follow-up date</span><input type="date" required value={followUp.date} onChange={e => updateFollowUp({ date: e.target.value })}/></label><label className="field"><span>Follow-up time</span><input type="time" required value={followUp.time} onChange={e => updateFollowUp({ time: e.target.value })}/></label><label className="field full"><span>How to follow up</span><select required value={followUp.channel} onChange={e => updateFollowUp({ channel: e.target.value, wording: ["PHONE_CALL", "VOICEMAIL"].includes(e.target.value) ? followUp.reason : "" })}><option value="" disabled>Choose a method</option><option value="PHONE_CALL">Call</option><option value="SMS">Text</option><option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option><option value="VOICEMAIL">Voicemail</option></select></label>{followUp.channel === "EMAIL" && <label className="field full"><span>Email subject</span><input value={followUp.subject} maxLength={300} required onChange={e => updateFollowUp({ subject: e.target.value })}/></label>}<label className="field full"><span>{["PHONE_CALL", "VOICEMAIL"].includes(followUp.channel) ? "Call notes" : "Draft message"}</span><textarea value={followUp.wording} required rows={3} maxLength={5000} onChange={e => updateFollowUp({ wording: e.target.value })}/></label></div><p className="muted">Saved for you to review and complete. This follow-up is not sent automatically.</p></CaptureDetails>}</section>
      </fieldset><div className="card-actions"><button className="button" type="button" disabled={saving || Boolean(recoveryReceipt)} onClick={() => { setPreview(null); setPerson(null); setError(""); }}>Edit capture</button><button className="button primary" type="submit" disabled={saving || Boolean(recoveryReceipt) || !count}>{saving ? "Saving…" : `Save all ${count}`}</button>{saving && <button className="button" type="button" onClick={() => saveController.current?.abort()}>Stop waiting</button>}</div>{saving && <p role="status" className="muted-copy">Saving your capture… You can stop waiting and retry safely. Stopping the wait does not cancel a save already received.</p>}</form>
    </section>}
    {!preview && !receipt && <details className="workflow-options"><summary>Other ways to add</summary><nav className="quick-add-grid" aria-label="Quick Add options"><Link href="/contacts/new" onClick={e => { if (!closeDialog()) e.preventDefault(); }}><AppIcon name="contacts"/><span><strong>Add a person</strong><small>Name, phone, and optional follow-up</small></span></Link><Link href="/contacts?intent=log-note" onClick={e => { if (!closeDialog()) e.preventDefault(); }}><AppIcon name="edit"/><span><strong>Log what happened</strong><small>Choose a person and add a note</small></span></Link></nav></details>}
  </dialog>;
}
