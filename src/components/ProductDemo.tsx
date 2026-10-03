"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { DEMO_BEATS, demoContact, demoDrafts, demoSituations } from "@/lib/demo-workspace";
import { MARKETING_SCENARIOS } from "@/lib/marketing-scenarios";
import { DEMO_MARKER, demoActionUrl, isAppleMobile } from "@/lib/product-demo";
import styles from "./ProductDemo.module.css";

type Practice = { drafts: ReturnType<typeof demoDrafts>; beat: number; view: "edit" | "preview" | "recorded"; done: number[]; handoff: boolean; copied: "" | "copied" | "manual" };

// Memory-only practice: no storage, account actions or delivery claims. The native links are
// ordinary anchors to the visitor's own apps; a click only proves a handoff was requested.
export function ProductDemo({ scenarioId, heading = "Try a 3-step Mix" }: { scenarioId?: string; heading?: string } = {}) {
  const choices = demoSituations(scenarioId);
  const [selected, setSelected] = useState(choices[0].id);
  const [practices, setPractices] = useState<Record<string, Practice>>({});
  const [ready, setReady] = useState(false);
  const [apple, setApple] = useState(false);
  const example = choices.find(item => item.id === selected) ?? choices[0];
  const key = `${scenarioId ?? "home"}~${example.id}`;
  const initial: Practice = { drafts: demoDrafts(example), beat: 0, view: "edit", done: [], handoff: false, copied: "" };
  const practice = practices[key] ?? initial;
  const beat = DEMO_BEATS[practice.beat];
  const draft = practice.drafts[practice.beat];
  const contact = demoContact(example);
  const update = (patch: Partial<Practice>) => setPractices(current => ({ ...current, [key]: { ...(current[key] ?? initial), ...patch } }));
  const edit = (patch: Partial<typeof draft>) => update({ drafts: practice.drafts.map((value, index) => index === practice.beat ? { ...value, ...patch } : value) });
  const field = useRef<HTMLTextAreaElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const focusStep = useRef(false);
  const uid = useId();
  const selection = MARKETING_SCENARIOS.some(item => item.id === scenarioId) ? key : undefined;
  const recorded = practice.done.includes(practice.beat);
  const nextBeat = DEMO_BEATS.findIndex((_, index) => !practice.done.includes(index));

  const manual = useRef<HTMLTextAreaElement>(null);
  const nativeUrl = ready ? demoActionUrl(beat.channel, draft.subject, draft.message, apple, contact) : null;
  const nativeApp = beat.channel === "text" ? "text" : beat.channel === "email" ? "email" : "phone";
  // Copied and hand-selected text keeps the same demo markers as the native link.
  const copyText = beat.channel === "email" ? `Subject: [DEMO] ${draft.subject.replace(/\s+/g, " ").trim()}\n\n${DEMO_MARKER}\n\n${draft.message}` : `${DEMO_MARKER}\n\n${draft.message}`;
  const copyDraft = async () => {
    try { await navigator.clipboard.writeText(copyText); update({ copied: "copied" }); }
    catch { update({ copied: "manual" }); requestAnimationFrame(() => { manual.current?.focus(); manual.current?.select(); }); }
  };

  useEffect(() => { setApple(isAppleMobile(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)); setReady(true); }, []);
  useEffect(() => { if (selection) window.dispatchEvent(new CustomEvent("jitm:scenario", { detail: { scenario: selection } })); }, [selection]);
  useEffect(() => { if (focusStep.current) { stepHeading.current?.focus(); focusStep.current = false; } }, [practice.view, practice.beat, key]);
  useEffect(() => {
    const trigger = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest('[data-demo-trigger][href="#sample"]')) {
        event.preventDefault();
        setPractices(current => ({ ...current, [key]: { ...(current[key] ?? initial), beat: 0, view: "edit" } }));
        requestAnimationFrame(() => { (field.current?.disabled ? stepHeading.current : field.current)?.focus(); field.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); });
      }
    };
    document.addEventListener("click", trigger, true);
    return () => document.removeEventListener("click", trigger, true);
  }, [key]);
  const go = (view: Practice["view"], index = practice.beat) => { focusStep.current = true; update({ view, beat: index, handoff: false, copied: "" }); };
  const record = () => { focusStep.current = true; update({ view: "recorded", handoff: false, copied: "", done: [...new Set([...practice.done, practice.beat])] }); };
  // Undo changes only this demo record; it cannot recall a message or call made elsewhere.
  const undo = () => { focusStep.current = true; update({ view: "edit", handoff: false, copied: "", done: practice.done.filter(index => index !== practice.beat) }); };
  const title = practice.view === "recorded" ? "Recorded in this demo" : practice.view === "preview" ? `${beat.label === "Text" ? "SMS" : beat.label} preview` : `${beat.label === "Call" ? "Prepare a call" : `Review your ${beat.label.toLowerCase()}`} · ${beat.due.toLowerCase()}`;

  return <section className={`product-demo ${styles.demo}`} id="sample" aria-label={heading} data-marketing-scenario={selection} aria-busy={!ready}>
    <header className={styles.header}><h2>{heading}</h2><p>Fictional contact. This page sends nothing and schedules nothing. Edits stay in this tab and clear on refresh.</p></header>
    <label className={`field ${styles.situation}`}><span>Situation</span><select value={example.id} disabled={!ready} onChange={event => { focusStep.current = true; setSelected(event.target.value); }}>{choices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <div className={styles.workspace}>
      <div className={styles.today}><span><AppIcon name="today" />Today</span><span>{practice.done.includes(0) ? "Today’s Beat done" : "1 Beat due"}</span></div>
      <div className={styles.person}><span className={styles.avatar} aria-hidden="true">{contact.initials}</span><div><strong>{example.person}</strong><p>{example.context}</p></div></div>
      <div className={styles.mix}><AppIcon name="mixes" /><span>3 Beats · a reusable follow-up plan</span></div>
      <ol className={styles.rhythm} aria-label="Mix schedule">
        {DEMO_BEATS.map((item, index) => <li key={item.channel}><button type="button" disabled={!ready} aria-current={practice.beat === index ? "step" : undefined} onClick={() => go(practice.done.includes(index) ? "recorded" : "edit", index)} data-demo-beat={item.channel} data-due-day={item.day}>
          <span className={styles.node}><AppIcon name={practice.done.includes(index) ? "check" : item.icon} /></span><strong>{item.label}</strong><span>{item.due}</span>{practice.done.includes(index) && <small>Done in demo</small>}
        </button></li>)}
      </ol>
      <div className={styles.review} aria-labelledby={`${uid}-step`}>
        <p className={styles.beat}>Beat {practice.beat + 1} of 3{practice.beat > 0 && " · Upcoming"}</p>
        <h3 id={`${uid}-step`} ref={stepHeading} tabIndex={-1}>{title}</h3>
        {practice.view === "edit" && <>
          <p className={styles.recipient}>{beat.channel === "email" ? `To ${contact.email}` : `${beat.channel === "phone" ? "Call" : "SMS to"} ${contact.phone}`}</p>
          {beat.channel === "email" && <label className="field"><span>Subject</span><input value={draft.subject} maxLength={200} disabled={!ready || recorded} onChange={event => edit({ subject: event.target.value })} /></label>}
          <label className={styles.draft}><span className="sr-only">{beat.channel === "phone" ? "Call notes" : "Message"} to {example.person}</span><textarea ref={field} value={draft.message} onChange={event => edit({ message: event.target.value })} maxLength={1500} rows={beat.channel === "email" ? 7 : 4} disabled={!ready || recorded} /></label>
          {recorded ? <><p>This Beat is already recorded in the demo.</p><button className="button" type="button" onClick={undo}>Undo recorded outcome</button></> : <button className={`button primary ${styles.primary}`} type="button" disabled={!ready || !draft.message.trim() || (beat.channel === "email" && !draft.subject.trim())} onClick={() => go("preview")}><AppIcon name={beat.icon} />{beat.preview}</button>}
          <p className={styles.hint}>{practice.beat === 0 ? "Make the draft your own, then preview it." : "Preview this upcoming Beat now. Its due date stays the same."}</p>
        </>}
        {practice.view === "preview" && <>
          <div className={`${styles.preview} ${beat.channel === "text" ? styles.sms : beat.channel === "phone" ? styles.call : ""}`} data-demo-preview={beat.channel}>
            <div className={styles.previewHeader}><AppIcon name={beat.icon} /><strong>{beat.channel === "text" ? "Messages" : beat.channel === "email" ? "Email" : "Phone"}</strong><span>Preview only</span></div>
            {beat.channel === "phone" && <span className={styles.avatar} aria-hidden="true">{contact.initials}</span>}
            <p className={styles.previewTo}>{example.person}<span>{beat.channel === "email" ? contact.email : contact.phone}</span></p>
            {beat.channel === "email" && <p className={styles.subject}><strong>Subject:</strong> {draft.subject}</p>}
            {beat.channel === "phone" && <p className={styles.callLabel}>Your call notes · no call is placed</p>}
            <blockquote>{draft.message}</blockquote>
          </div>
          <p className={styles.hint}>Sample only. {beat.channel === "email" ? contact.email : contact.phone} is a fictional, non-working {beat.channel === "email" ? "address" : "number"}, so expect no reply. {beat.channel === "phone" ? "If your device has a phone app, the link asks it to show this number only; your call notes stay on this page." : `If your device has a ${nativeApp} app, the link asks it to open with this draft, marked as a demo. Some apps ignore the draft or its subject, so check it there.`} You decide whether to {beat.channel === "phone" ? "call" : "send"}, and this page cannot tell what you did.</p>
          <div className={styles.actions}>
            {nativeUrl && <a className="button primary" href={nativeUrl} data-demo-native={beat.channel} onClick={() => update({ handoff: true })}>{beat.channel === "phone" ? "Open your phone app" : `Open in your ${nativeApp} app`}</a>}
            <button className="button" type="button" onClick={copyDraft}>{beat.channel === "phone" ? "Copy call notes" : "Copy draft"}</button>
          </div>
          <div role="status" className={styles.hint}>
            {practice.handoff && "Handoff requested. This page cannot tell whether anything opened or was sent. If nothing opened, your device may have no app for this link; copy the text instead. Your edits are still here."}
            {practice.copied === "copied" && " Copied to your clipboard."}
            {practice.copied === "manual" && " Copying was blocked. Select the text below and copy it yourself."}
          </div>
          {(practice.handoff || practice.copied === "manual") && <label className="field"><span>Draft text to copy by hand</span><textarea ref={manual} readOnly rows={4} value={copyText} onFocus={event => event.currentTarget.select()} /></label>}
          <div className={styles.actions}><button className="button" type="button" onClick={() => go("edit")}>Back to edit</button><button className="button primary" type="button" onClick={record}>{beat.channel === "phone" ? "Mark called (demo)" : "Mark sent (demo)"}</button></div>
          <button className="text-button" type="button" onClick={() => go("edit")}>Not yet</button>
        </>}
        {practice.view === "recorded" && <>
          <p className={styles.outcome} role="status"><AppIcon name="check" />{beat.label} marked {beat.channel === "phone" ? "called" : "sent"} in the demo. {beat.channel === "phone" ? "No call was placed by this demo." : "Nothing was sent by this demo."} Undo changes only this demo record; it cannot recall a message or call.</p>
          <button className="text-button" type="button" onClick={undo}>Undo recorded outcome</button>
          {nextBeat >= 0 ? <><p className={styles.hint}>Still on the plan: {DEMO_BEATS[nextBeat].label.toLowerCase()} {DEMO_BEATS[nextBeat].due.toLowerCase()}. You can preview it now.</p><button className={`button primary ${styles.primary}`} type="button" onClick={() => go("edit", nextBeat)}>Review {DEMO_BEATS[nextBeat].label.toLowerCase()} · {DEMO_BEATS[nextBeat].due.toLowerCase()}</button></> : <><p>You tried all three Beats: text today, email tomorrow, and a call in one week.</p><Link className={`button primary ${styles.primary}`} href={selection ? `/waitlist?scenario=${encodeURIComponent(selection)}` : "/waitlist"}>Join the waitlist</Link><p className={styles.hint}>Confirm your email, then wait for an invitation. Free account; no card.</p></>}
        </>}
      </div>
    </div>
    <button className={`text-button ${styles.reset}`} type="button" disabled={!ready} onClick={() => { setPractices(current => ({ ...current, [key]: initial })); requestAnimationFrame(() => field.current?.focus()); }}>Reset example</button>
    <noscript><p>This example needs JavaScript to edit and preview. The Mix is text today, email tomorrow, and a call in one week. Opening a draft in your own text, email or phone app also needs JavaScript. You can still <Link href="/waitlist">join the waitlist</Link>.</p></noscript>
  </section>;
}
