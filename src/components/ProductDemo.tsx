"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { DEMO_CONTACT_DEFAULTS, DEMO_MARKER, DEMO_SCENARIOS, demoActionUrl, personalizeDemoText, resolveDemoContact, type DemoContactDetails, type DemoStep } from "@/lib/product-demo";

const channels: Record<DemoStep["channel"], { label: string; action: string; icon: AppIconName }> = {
  text: { label: "Text", action: "Open text app", icon: "message" },
  email: { label: "Email", action: "Open email app", icon: "email" },
  phone: { label: "Phone", action: "Open phone app", icon: "phone" }
};

function DemoDraft({ step, ready, appleMobile, contact }: { step: DemoStep; ready: boolean; appleMobile: boolean; contact: DemoContactDetails }) {
  const [messageDraft, setMessage] = useState<string | null>(null);
  const [subjectDraft, setSubject] = useState<string | null>(null);
  const message = messageDraft ?? personalizeDemoText(step.message, contact);
  const subject = subjectDraft ?? personalizeDemoText(step.subject ?? "", contact);
  const [status, setStatus] = useState("");
  const messageField = useRef<HTMLTextAreaElement>(null);
  const notesEditor = useRef<HTMLDetailsElement>(null);
  const channel = channels[step.channel];
  const actionUrl = demoActionUrl(step.channel, subject, message, appleMobile, contact);
  const resetDraft = <button className="button demo-reset-draft" type="button" onClick={() => { setMessage(null); setSubject(null); setStatus(""); }}>Use prepared {step.channel === "phone" ? "reminders" : "message"}</button>;

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(`${DEMO_MARKER}\n\n${subject ? `${subject}\n\n` : ""}${message}`);
      setStatus("Demo copied. You can paste it into your app.");
    } catch {
      if (notesEditor.current) notesEditor.current.open = true;
      messageField.current?.focus();
      messageField.current?.select();
      setStatus("Copy is unavailable here. The draft is selected so you can copy it manually.");
    }
  }

  return <div className="demo-draft">
    <div className="demo-step-heading" aria-live="polite" aria-atomic="true">
      <span><AppIcon name={channel.icon} />{channel.label} · {step.timing}</span>
      <h3>{step.title}</h3>
    </div>
    {step.channel === "phone" ? <>
      <div className="demo-call-notes conversation-note"><p>Call reminders</p><ul aria-label="Call reminders">{message.split("\n").map(line => line.trim().replace(/^[•*-]\s+/, "")).filter(Boolean).map((note, index) => <li key={index}>{note}</li>)}</ul></div>
      <details className="demo-contact-note-preview"><summary>Contact notes</summary><p>{contact.notes}</p></details>
      <details className="demo-notes-editor" ref={notesEditor}><summary>Edit reminders</summary><label className="field"><span>One reminder per line</span><textarea className="demo-message" ref={messageField} disabled={!ready} value={message} maxLength={1500} rows={4} onChange={event => { setMessage(event.target.value); setStatus(""); }} /></label>{messageDraft !== null && resetDraft}</details>
    </> : <>
      <div className="demo-message-preview speech-bubble speech-bubble--soft">{step.channel === "email" && <p className="demo-subject"><strong>Subject:</strong> {subject}</p>}<p>{message}</p></div>
      <details className="demo-notes-editor" ref={notesEditor}><summary>Fine-tune this message</summary>
        {step.channel === "email" && <label className="field"><span>Sample subject</span><input disabled={!ready} value={subject} maxLength={160} onChange={event => { setSubject(event.target.value); setStatus(""); }} /></label>}
        <label className="field"><span>Make it sound like you</span><textarea className="demo-message" ref={messageField} disabled={!ready} value={message} maxLength={1500} rows={step.channel === "email" ? 6 : 4} onChange={event => { setMessage(event.target.value); setStatus(""); }} /></label>
        {(messageDraft !== null || subjectDraft !== null) && <><p className="demo-draft-help">Your edits stay as written. Use the prepared message to refresh the names.</p>{resetDraft}</>}
      </details>
    </>}
    <div className="demo-actions">
      <a className="button primary" href={ready && actionUrl ? actionUrl : undefined} aria-disabled={!ready || !actionUrl} tabIndex={ready && actionUrl ? undefined : -1} aria-describedby={`demo-handoff-help${actionUrl ? "" : " demo-contact-action-help"}`} onClick={() => { if (ready && actionUrl) setStatus("Your device handles opening the app. You can return here to try another beat."); }}><AppIcon name={channel.icon} />{channel.action}</a>
      <button className="button" type="button" disabled={!ready} onClick={copyDraft}>{step.channel === "phone" ? "Copy notes" : "Copy message"}</button>
    </div>
    {!actionUrl && <p className="demo-draft-help" id="demo-contact-action-help">Enter a valid {step.channel === "email" ? "email address" : "phone number"} in Edit contact, or leave it blank to use the sample.</p>}
    <p className="demo-status" role="status">{status}</p>
  </div>;
}

export function ProductDemo() {
  const [ready, setReady] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);
  const [selected, setSelected] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [contactValues, setContactValues] = useState<DemoContactDetails>({ ...DEMO_CONTACT_DEFAULTS });
  const [highlighted, setHighlighted] = useState(false);
  const demoWindow = useRef<HTMLElement>(null);
  const contactEditor = useRef<HTMLDetailsElement>(null);
  const draftPreview = useRef<HTMLDivElement>(null);
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
  const scenario = DEMO_SCENARIOS[selected];
  const step = scenario.steps[stepIndex];
  const contact = resolveDemoContact(contactValues);
  const sampleContact = contact.name === DEMO_CONTACT_DEFAULTS.name && contact.phone === DEMO_CONTACT_DEFAULTS.phone && contact.email === DEMO_CONTACT_DEFAULTS.email;
  const initials = contact.name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase();
  const updateContact = (field: keyof DemoContactDetails, value: string) => setContactValues(current => ({ ...current, [field]: value }));

  return <section ref={demoWindow} className={`product-demo conversation-panel speech-bubble${highlighted ? " demo-highlighted" : ""}`} id="sample" tabIndex={-1} aria-label="Try a demo mix" aria-busy={!ready}>
    <div className="product-demo-heading"><h2>Try a demo mix</h2></div>
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
          <div className="field demo-contact-notes"><label htmlFor="demo-contact-notes">Notes</label><textarea id="demo-contact-notes" autoComplete="off" name="demo-contact-notes" disabled={!ready} value={contactValues.notes} maxLength={1000} rows={3} aria-describedby="demo-contact-notes-help" onChange={event => updateContact("notes", event.target.value)} /><small id="demo-contact-notes-help">For your reference. Notes aren’t included in messages.</small></div>
        </div>
        <div className="demo-contact-editor-actions"><button className="button" type="button" disabled={!ready} onClick={() => setContactValues({ ...DEMO_CONTACT_DEFAULTS })}>Use sample contact</button><button className="button" type="button" onClick={() => { if (contactEditor.current) { contactEditor.current.open = false; contactEditor.current.querySelector("summary")?.focus(); } }}>Done editing</button></div>
        <p className="demo-contact-help">These details stay in this demo and reset when you refresh.</p>
      </details>
    </div>
    <fieldset className="demo-scenarios" disabled={!ready}><legend>Choose a demo mix</legend>{DEMO_SCENARIOS.map((item, index) => <label key={item.id}><input type="radio" name="demo-scenario" checked={selected === index} onChange={() => { setSelected(index); setStepIndex(0); }} /><span>{item.label}</span></label>)}</fieldset>
    <div ref={draftPreview} tabIndex={-1} role="group" aria-label="Selected sample beat"><DemoDraft key={`${scenario.id}-${stepIndex}`} step={step} ready={ready} appleMobile={appleMobile} contact={contact} /></div>
    <p className="demo-help" id="demo-handoff-help">Opens your own app using the contact above. No app? Copy the demo. Call notes stay here.</p>
    <details className="demo-plan-overview" key={scenario.id}><summary>Preview the rhythm · {scenario.steps.length} beats</summary>
      <p className="demo-scenario-description">{scenario.description} Each beat is a message or call reminder; the tempo is when it happens.</p>
      <label className="field demo-step-picker"><span>Explore a beat</span><select disabled={!ready} value={stepIndex} onChange={event => setStepIndex(Number(event.target.value))}>{scenario.steps.map((item, index) => <option key={index} value={index}>{index + 1}. {item.timing} · {item.title}</option>)}</select></label>
      <div className="demo-step-navigation"><button className="button" type="button" disabled={!ready || stepIndex === 0} onClick={() => setStepIndex(index => index - 1)}>Previous</button><span aria-live="polite">Beat {stepIndex + 1} of {scenario.steps.length}</span><button className="button" type="button" disabled={!ready || stepIndex === scenario.steps.length - 1} onClick={() => setStepIndex(index => index + 1)}>Next</button></div>
      <ol>{scenario.steps.map((item, index) => <li key={index}><button type="button" disabled={!ready} aria-pressed={stepIndex === index} onClick={() => { setStepIndex(index); draftPreview.current?.focus(); }}><AppIcon name={channels[item.channel].icon} /><span><strong>{item.title}</strong><small>{channels[item.channel].label} · {item.timing}</small></span></button></li>)}</ol>
    </details>
    <small>Nothing sends or schedules automatically.</small>
    <Link className="demo-start" href="/waitlist">Join the waitlist <span aria-hidden="true">→</span></Link>
  </section>;
}
