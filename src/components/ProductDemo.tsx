"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { DEMO_CONTACT_DEFAULTS, DEMO_MARKER, DEMO_SCENARIOS, demoActionUrl, personalizeDemoText, resolveDemoContact, type DemoContactDetails, type DemoStep } from "@/lib/product-demo";
import { WhenPicker } from "@/components/WhenPicker";
import { addDays, dateKeyOf } from "@/lib/when-picker";

const channels: Record<DemoStep["channel"], { label: string; action: string; icon: AppIconName }> = {
  text: { label: "Text", action: "Text Message", icon: "message" },
  email: { label: "Email", action: "E-Mail", icon: "email" },
  phone: { label: "Phone", action: "Phone Call", icon: "phone" }
};

const HANDOFF_TIP = "Opens your messaging with the contact ready. Review, edit, send.";
const stampFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const formatBeatStamp = (at: number | Date) => stampFormat.format(at);
// datetime-local wants local wall-clock time without an offset.
const toLocalInput = (at: number) => { const d = new Date(at); const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// A planned beat starts on the usual follow-up window, tomorrow at ten, decided once the page is live in the browser.
type PlannedWhen = { date: string; time: string };
const defaultPlanned = (): PlannedWhen => ({ date: addDays(dateKeyOf(new Date()), 1), time: "10:00" });

const SkipIcon = () => <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5v9l7-4.5z" /><path d="M14.5 5.5v9" /></svg>;
const CopyIcon = () => <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></svg>;

type BeatState = { status: "completed" | "skipped"; at: number };

// One "i" that explains the handoff on hover, focus or tap, in place of the old help lines.
function InfoTip({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return <span className={`demo-info${open ? " open" : ""}`} onMouseLeave={() => setOpen(false)}>
    <button type="button" className="demo-info-button" aria-label="How opening your app works" aria-describedby={id} aria-expanded={open} onClick={() => setOpen(current => !current)} onBlur={() => setOpen(false)}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="10" cy="6.3" r="1.05" fill="currentColor" /><path d="M8.5 9h1.9v5M8.5 14h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </button>
    <span role="tooltip" id={id} className="demo-info-tip">{HANDOFF_TIP}</span>
  </span>;
}

// The recorded time is a button; clicking it opens a picker so the user can correct it.
function BeatStamp({ state, onChange }: { state: BeatState; onChange: (at: number) => void }) {
  const [editing, setEditing] = useState(false);
  const label = state.status === "completed" ? "Completed" : "Skipped";
  if (editing) {
    return <span className={`demo-beat-stamp editing ${state.status}`}>
      <input type="datetime-local" aria-label={`${label} time`} value={toLocalInput(state.at)} autoFocus onChange={event => { const next = new Date(event.target.value).getTime(); if (!Number.isNaN(next)) onChange(next); }} onBlur={() => setEditing(false)} onKeyDown={event => { if (event.key === "Enter" || event.key === "Escape") setEditing(false); }} />
    </span>;
  }
  return <button type="button" className={`demo-beat-stamp ${state.status}`} title={`${label} — click to change the time`} aria-label={`${label} ${formatBeatStamp(state.at)}. Change the time`} onClick={() => setEditing(true)}>
    {state.status === "completed" ? <AppIcon name="check" /> : <SkipIcon />}
    <time dateTime={new Date(state.at).toISOString()}>{formatBeatStamp(state.at)}</time>
  </button>;
}

function DemoBeat({ step, index, open, state, ready, appleMobile, contact, onToggle, onMark }: {
  step: DemoStep; index: number; open: boolean; state: BeatState | null; ready: boolean; appleMobile: boolean; contact: DemoContactDetails;
  onToggle: () => void; onMark: (status: BeatState["status"] | null, at?: number) => void;
}) {
  const uid = useId();
  const [messageDraft, setMessage] = useState<string | null>(null);
  const [subjectDraft, setSubject] = useState<string | null>(null);
  const [planned, setPlanned] = useState<PlannedWhen | null>(null);
  useEffect(() => { if (ready && step.planned) setPlanned(current => current ?? defaultPlanned()); }, [ready, step.planned]);
  const [status, setStatus] = useState("");
  const message = messageDraft ?? personalizeDemoText(step.message, contact);
  const subject = subjectDraft ?? personalizeDemoText(step.subject ?? "", contact);
  const messageField = useRef<HTMLTextAreaElement>(null);
  const channel = channels[step.channel];
  const actionUrl = demoActionUrl(step.channel, subject, message, appleMobile, contact);
  const edited = messageDraft !== null || subjectDraft !== null;
  const completed = state?.status === "completed";
  const skipped = state?.status === "skipped";
  const plannedLabel = step.planned ? (planned ? `Planned ${formatBeatStamp(new Date(`${planned.date}T${planned.time}`).getTime())}` : step.timing) : step.timing;

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(`${DEMO_MARKER}\n\n${subject ? `${subject}\n\n` : ""}${message}`);
      setStatus("Demo copied. You can paste it into your app.");
    } catch {
      messageField.current?.focus();
      messageField.current?.select();
      setStatus("Copy is unavailable here. The draft is selected so you can copy it manually.");
    }
  }

  return <li className={`demo-beat${open ? " open" : ""}${completed ? " done" : ""}${skipped ? " skipped" : ""}`}>
    <div className="demo-beat-head">
      {state && <BeatStamp state={state} onChange={at => onMark(state.status, at)} />}
      <button type="button" className="demo-beat-toggle" id={`${uid}-toggle`} aria-expanded={open} aria-controls={`${uid}-body`} onClick={onToggle}>
        <span className="demo-beat-number">Beat {index + 1}</span>
        <span className="demo-beat-title">{step.title}</span>
        <span className="demo-beat-meta"><AppIcon name={channel.icon} />{channel.label} · {plannedLabel}</span>
        <AppIcon name="chevronDown" />
      </button>
    </div>
    {/* Bodies stay mounted so edits survive switching between beats; only the open one is shown. */}
    <div className="demo-beat-body" id={`${uid}-body`} role="region" aria-labelledby={`${uid}-toggle`} hidden={!open}>
      {/* Inline rather than a drawer: the demo shares the page, so the calendar opens beneath the fields. */}
      {step.planned && <div className="field demo-planned"><span className="field-label">Planned date</span><WhenPicker label="Planned date" variant="inline" date={planned?.date ?? ""} time={planned?.time ?? "10:00"} noPast disabled={!ready || !planned} hint="The date this beat goes out." onChange={next => setPlanned({ date: next.date, time: next.time ?? "10:00" })} /></div>}
      {step.channel === "email" && <label className="field"><span>Subject</span><input disabled={!ready} value={subject} maxLength={160} onChange={event => { setSubject(event.target.value); setStatus(""); }} /></label>}
      {/* The name lives on the control: a wrapping label's text would include the draft itself. */}
      <div className="field demo-message-field"><span className="conversation-note demo-notes-bubble"><textarea className="demo-message" ref={messageField} aria-label={step.channel === "phone" ? "Call reminders, one per line" : "Message"} disabled={!ready} value={message} maxLength={1500} rows={step.channel === "email" ? 6 : 4} onChange={event => { setMessage(event.target.value); setStatus(""); }} /></span></div>
      {step.channel === "phone" && <details className="demo-contact-note-preview"><summary>Contact notes</summary><p>{contact.notes}</p></details>}
      {edited && <button className="button demo-reset-draft" type="button" onClick={() => { setMessage(null); setSubject(null); setStatus(""); }}>Use prepared {step.channel === "phone" ? "reminders" : "message"}</button>}
      <div className="demo-actions">
        <a className="button primary" href={ready && actionUrl ? actionUrl : undefined} aria-disabled={!ready || !actionUrl} tabIndex={ready && actionUrl ? undefined : -1} aria-describedby={`${uid}-tip${actionUrl ? "" : ` ${uid}-contact-help`}`} onClick={event => { if (!ready || !actionUrl) event.preventDefault(); }}><AppIcon name={channel.icon} /><span>{channel.action}</span></a>
        <button className="button demo-copy" type="button" disabled={!ready} aria-label={step.channel === "phone" ? "Copy notes" : "Copy message"} title={step.channel === "phone" ? "Copy notes" : "Copy message"} onClick={copyDraft}><CopyIcon /><span>Copy</span></button>
        <button className={`button demo-check${completed ? " done" : ""}`} type="button" disabled={!ready} aria-pressed={completed} aria-label={completed ? "Completed — undo" : "Mark completed"} title={completed ? "Undo completed" : "Mark completed"} onClick={() => onMark(completed ? null : "completed")}><AppIcon name="check" /></button>
        <button className={`button demo-skip${skipped ? " done" : ""}`} type="button" disabled={!ready} aria-pressed={skipped} aria-label={skipped ? "Skipped — undo" : "Skip"} title={skipped ? "Undo skip" : "Skip this beat"} onClick={() => onMark(skipped ? null : "skipped")}><SkipIcon /><span>Skip</span></button>
        <InfoTip id={`${uid}-tip`} />
      </div>
      {!actionUrl && <p className="demo-draft-help" id={`${uid}-contact-help`}>Enter a valid {step.channel === "email" ? "email address" : "phone number"} in Edit contact, or leave it blank to use the sample.</p>}
      <p className="demo-status" role="status">{status}</p>
    </div>
  </li>;
}

type DemoScenario = (typeof DEMO_SCENARIOS)[number];
// The homepage plays the generic mixes; each profession page hands in that persona's own.
export function ProductDemo({ scenarios = DEMO_SCENARIOS, heading = "Try a demo mix", legend = "Choose a demo mix" }: { scenarios?: readonly DemoScenario[]; heading?: string; legend?: string } = {}) {
  const [ready, setReady] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);
  const [selected, setSelected] = useState(0);
  const [openBeat, setOpenBeat] = useState(0);
  const [beatStates, setBeatStates] = useState<Record<string, BeatState>>({});
  const [contactValues, setContactValues] = useState<DemoContactDetails>({ ...DEMO_CONTACT_DEFAULTS });
  const [highlighted, setHighlighted] = useState(false);
  const demoWindow = useRef<HTMLElement>(null);
  const contactEditor = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    setAppleMobile(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    setReady(true);
    let highlightTimeout: number | undefined;
    const highlight = () => {
      window.clearTimeout(highlightTimeout);
      setHighlighted(true);
      demoWindow.current?.focus({ preventScroll: true });
      highlightTimeout = window.setTimeout(() => setHighlighted(false), 3000);
    };
    const handleTrigger = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest('[data-demo-trigger][href="#sample"]')) highlight();
    };
    document.addEventListener("click", handleTrigger);
    if (window.location.hash === "#sample") highlight();
    return () => { document.removeEventListener("click", handleTrigger); window.clearTimeout(highlightTimeout); };
  }, []);
  const scenario = scenarios[selected];
  const contact = resolveDemoContact(contactValues);
  const sampleContact = contact.name === DEMO_CONTACT_DEFAULTS.name && contact.phone === DEMO_CONTACT_DEFAULTS.phone && contact.email === DEMO_CONTACT_DEFAULTS.email;
  const initials = contact.name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase();
  const updateContact = (field: keyof DemoContactDetails, value: string) => setContactValues(current => ({ ...current, [field]: value }));
  // Completion and skips are remembered per beat of each mix while the page is open, like a real day's list.
  const beatKey = (index: number) => `${scenario.id}:${index}`;
  const markBeat = (index: number, status: BeatState["status"] | null, at?: number) => setBeatStates(current => {
    const key = beatKey(index);
    if (!status) { const { [key]: _removed, ...rest } = current; return rest; }
    return { ...current, [key]: { status, at: at ?? Date.now() } };
  });

  return <section ref={demoWindow} className={`product-demo conversation-panel speech-bubble${highlighted ? " demo-highlighted" : ""}`} id="sample" tabIndex={-1} aria-label={heading} aria-busy={!ready}>
    <div className="product-demo-heading"><h2>{heading}</h2></div>
    <div className="demo-contact">
      <div className="demo-person"><span className="demo-avatar" aria-hidden="true">{initials}</span><div><strong>{contact.name}</strong><p>{sampleContact ? "Fictional demo contact" : "Your test contact"}</p></div></div>
      <div className="demo-contact-details"><span>{contact.phone}</span><span>{contact.email}</span></div>
      <details className="demo-contact-editor" ref={contactEditor}>
        <summary>Edit contact</summary>
        <p className="demo-contact-help">Try your own details. Names update the prepared messages below as you type. Leave any field blank to use the sample.</p>
        <div className="demo-contact-fields">
          <label className="field"><span>Contact name</span><input autoComplete="off" name="demo-contact-name" disabled={!ready} value={contactValues.name} maxLength={120} onChange={event => updateContact("name", event.target.value)} /></label>
          <label className="field"><span>Your name</span><input autoComplete="off" name="demo-sender-name" disabled={!ready} value={contactValues.senderName} maxLength={120} onChange={event => updateContact("senderName", event.target.value)} /></label>
          <label className="field"><span>Phone</span><input type="tel" autoComplete="off" name="demo-contact-phone" disabled={!ready} value={contactValues.phone} maxLength={40} onChange={event => updateContact("phone", event.target.value)} /></label>
          <label className="field"><span>Email</span><input type="email" autoComplete="off" name="demo-contact-email" disabled={!ready} value={contactValues.email} maxLength={254} onChange={event => updateContact("email", event.target.value)} /></label>
          <div className="field demo-contact-notes"><label htmlFor="demo-contact-notes">Notes</label><textarea id="demo-contact-notes" autoComplete="off" name="demo-contact-notes" disabled={!ready} value={contactValues.notes} maxLength={1000} rows={3} onChange={event => updateContact("notes", event.target.value)} /></div>
        </div>
        <div className="demo-contact-editor-actions"><button className="button" type="button" disabled={!ready} onClick={() => setContactValues({ ...DEMO_CONTACT_DEFAULTS })}>Use sample contact</button><button className="button" type="button" onClick={() => { if (contactEditor.current) contactEditor.current.open = false; }}>Done</button></div>
        <p className="demo-contact-help">These details stay in this demo and reset when you refresh.</p>
      </details>
    </div>
    <fieldset className="demo-scenarios" disabled={!ready}><legend>{legend}</legend>{scenarios.map((item, index) => <label key={item.id}><input type="radio" name="demo-scenario" checked={selected === index} onChange={() => { setSelected(index); setOpenBeat(0); }} /><span>{item.label}</span></label>)}</fieldset>
    <section className="demo-rhythm" aria-labelledby="demo-rhythm-title">
      <h3 id="demo-rhythm-title">Rhythm <span>· {scenario.steps.length} beats</span></h3>
      <p className="demo-scenario-description">{scenario.description}</p>
      <ol className="demo-beats" key={scenario.id}>
        {scenario.steps.map((step, index) => <DemoBeat key={`${scenario.id}-${index}`} step={step} index={index} open={openBeat === index} state={beatStates[beatKey(index)] ?? null} ready={ready} appleMobile={appleMobile} contact={contact} onToggle={() => setOpenBeat(current => current === index ? -1 : index)} onMark={(status, at) => markBeat(index, status, at)} />)}
      </ol>
    </section>
    <Link className="demo-start" href="/waitlist">Join the waitlist <span aria-hidden="true">→</span></Link>
  </section>;
}
