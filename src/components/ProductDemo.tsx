"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { DEMO_BEATS, demoContact, demoDrafts, demoSituations } from "@/lib/demo-workspace";
import { MARKETING_SCENARIOS } from "@/lib/marketing-scenarios";
import { DemoPhoneQr } from "@/components/DemoPhoneQr";
import { demoActionUrl, demoHandoff, demoQrPayload, isAppleMobile } from "@/lib/product-demo";
import styles from "./ProductDemo.module.css";

type Practice = { drafts: ReturnType<typeof demoDrafts>; beat: number; view: "edit" | "returned" | "recorded"; done: number[] };

// Memory-only practice: no storage, account actions or delivery claims. Like a Beat in the app, the
// action is an ordinary anchor to the visitor's own app; a click only proves a handoff was requested,
// so the demo then asks what happened, as the app's return tray does.
export function ProductDemo({ scenarioId, heading = "Try a 3-step Mix" }: { scenarioId?: string; heading?: string } = {}) {
  const choices = demoSituations(scenarioId);
  const [selected, setSelected] = useState(choices[0].id);
  const [practices, setPractices] = useState<Record<string, Practice>>({});
  const [ready, setReady] = useState(false);
  const [apple, setApple] = useState(false);
  // Computers without a built-in texting/calling app show a code to scan for those Beats instead.
  const [desktop, setDesktop] = useState(false);
  const [scanning, setScanning] = useState(false);
  const example = choices.find(item => item.id === selected) ?? choices[0];
  const key = `${scenarioId ?? "home"}~${example.id}`;
  const initial: Practice = { drafts: demoDrafts(example), beat: 0, view: "edit", done: [] };
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

  const nativeUrl = ready && draft.message.trim() && (beat.channel !== "email" || draft.subject.trim()) ? demoActionUrl(beat.channel, draft.subject, draft.message, apple, contact) : null;
  const returnTimer = useRef<number | undefined>(undefined);
  // Same outcome choices as the app's return tray.
  const outcomes = beat.channel === "phone"
    ? [["Connected", true], ["Left voicemail", true], ["No answer", true], ["Did not call", false]] as const
    : [["Sent", true], ["Not sent", false]] as const;

  useEffect(() => {
    const { userAgent, platform, maxTouchPoints } = navigator;
    const mac = /Macintosh|Mac OS X/.test(userAgent) || platform === "MacIntel";
    // Apple Messages, on iPhone, iPad and Mac, reads the body after "&".
    setApple(isAppleMobile(userAgent, platform, maxTouchPoints) || mac);
    setDesktop(demoHandoff(userAgent, platform, maxTouchPoints, window.matchMedia("(hover: hover) and (pointer: fine)").matches) === "scan");
    setReady(true);
  }, []);
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
  useEffect(() => () => window.clearTimeout(returnTimer.current), []);
  const go = (view: Practice["view"], index = practice.beat) => { window.clearTimeout(returnTimer.current); focusStep.current = true; update({ view, beat: index }); };
  // The anchor's default action hands off to the device; the outcome question follows, as in the app.
  const handOff = () => { window.clearTimeout(returnTimer.current); returnTimer.current = window.setTimeout(() => go("returned"), 900); };
  const record = () => { focusStep.current = true; update({ view: "recorded", done: [...new Set([...practice.done, practice.beat])] }); };
  // Undo changes only this demo record; it cannot recall a message or call made elsewhere.
  const undo = () => { focusStep.current = true; update({ view: "edit", done: practice.done.filter(index => index !== practice.beat) }); };
  const title = practice.view === "recorded" ? "Recorded in this demo" : practice.view === "returned" ? `How did the ${beat.channel === "phone" ? "call" : beat.label.toLowerCase()} with ${example.person.split(" ")[0]} go?` : `${beat.label === "Call" ? "Prepare a call" : `Review your ${beat.label.toLowerCase()}`} · ${beat.due.toLowerCase()}`;

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
          {recorded ? <><p>This Beat is already recorded in the demo.</p><button className="button" type="button" onClick={undo}>Undo recorded outcome</button></> : nativeUrl && desktop && beat.channel !== "email"
            ? <button className={`button primary ${styles.primary}`} type="button" aria-haspopup="dialog" onClick={() => setScanning(true)}><AppIcon name={beat.icon} />{beat.action}</button>
            : nativeUrl
            ? <a className={`button primary ${styles.primary}`} href={nativeUrl} data-demo-native={beat.channel} onClick={handOff}><AppIcon name={beat.icon} />{beat.action}</a>
            : <button className={`button primary ${styles.primary}`} type="button" disabled><AppIcon name={beat.icon} />{beat.action}</button>}
          {!recorded && <p className={styles.hint}>{desktop && beat.channel !== "email" ? "Shows a code to scan with your phone." : beat.channel === "phone" ? "Opens your calling app, ready to dial. Your notes stay here." : `Opens your ${beat.channel === "text" ? "messages" : "email"} app with this draft.`}</p>}
          {scanning && nativeUrl && beat.channel !== "email" && <DemoPhoneQr channel={beat.channel} person={example.person} phone={contact.phone} code={demoQrPayload(beat.channel, draft.message, contact) ?? nativeUrl}
            onDone={() => { setScanning(false); go("returned"); }} onClose={() => setScanning(false)} />}
        </>}
        {practice.view === "returned" && <>
          <p className={styles.hint}>Opening an app does not send it. Record what happened.</p>
          <div className={styles.actions}>{outcomes.map(([label, done]) => <button key={label} className={done && (label === "Sent" || label === "Connected") ? "button primary" : "button"} type="button" onClick={done ? record : () => go("edit")}>{label}</button>)}</div>
        </>}
        {practice.view === "recorded" && <>
          <p className={styles.outcome} role="status"><AppIcon name="check" />{beat.label} marked {beat.channel === "phone" ? "called" : "sent"} in the demo. {beat.channel === "phone" ? "No call was placed by this demo." : "Nothing was sent by this demo."} Undo changes only this demo record; it cannot recall a message or call.</p>
          <button className="text-button" type="button" onClick={undo}>Undo recorded outcome</button>
          {nextBeat >= 0 ? <><p className={styles.hint}>Still on the plan: {DEMO_BEATS[nextBeat].label.toLowerCase()} {DEMO_BEATS[nextBeat].due.toLowerCase()}. You can preview it now.</p><button className={`button primary ${styles.primary}`} type="button" onClick={() => go("edit", nextBeat)}>Review {DEMO_BEATS[nextBeat].label.toLowerCase()} · {DEMO_BEATS[nextBeat].due.toLowerCase()}</button></> : <><p>You tried all three Beats: text today, email tomorrow, and a call in one week.</p><Link className={`button primary ${styles.primary}`} href={selection ? `/waitlist?scenario=${encodeURIComponent(selection)}` : "/waitlist"}>Join the waitlist</Link><p className={styles.hint}>Confirm your email, then wait for an invitation. Free account; no card.</p></>}
        </>}
      </div>
    </div>
    <button className={`text-button ${styles.reset}`} type="button" disabled={!ready} onClick={() => { setPractices(current => ({ ...current, [key]: initial })); requestAnimationFrame(() => field.current?.focus()); }}>Reset example</button>
    <noscript><p>This example needs JavaScript to edit and try. The Mix is text today, email tomorrow, and a call in one week. Opening a draft in your own text, email or phone app also needs JavaScript. You can still <Link href="/waitlist">join the waitlist</Link>.</p></noscript>
  </section>;
}
