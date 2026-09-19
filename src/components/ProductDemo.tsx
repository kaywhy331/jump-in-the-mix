"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { DEMO_SCENARIOS } from "@/lib/product-demo";
import { MARKETING_SCENARIOS } from "@/lib/marketing-scenarios";

const examples = [
  { id: "client", label: "A client check-in", person: "Alex", context: "Alex asked you to check back this week.", message: "Hi Alex, you asked me to check back this week. Is now a good time to pick up our conversation?" },
  { id: "personal", label: "A personal hello", person: "Sam", context: "It has been a while since you caught up.", message: "Hi Sam, you crossed my mind today. How have you been? It would be lovely to catch up when you have a moment." },
  { id: "networking", label: "After meeting someone", person: "Jordan", context: "You met Jordan at an event yesterday.", message: "Hi Jordan, it was great meeting you yesterday. I enjoyed hearing about your work. Would you like to grab a coffee next week?" }
];
type Practice = { message: string; step: 0 | 1 | 2 | 3; next: "tomorrow" | "later" };
type DemoScenario = (typeof DEMO_SCENARIOS)[number];

// A short, in-memory showcase. It never opens a composer, sends, or saves a schedule.
export function ProductDemo({ scenarioId, scenarios, heading = "Try one follow-up" }: { scenarioId?: string; scenarios?: readonly DemoScenario[]; heading?: string; legend?: string } = {}) {
  const persona = MARKETING_SCENARIOS.find(item => item.id === scenarioId);
  const choices = persona ? [{ id: persona.id === "consulting" ? "milestone" : scenarios?.[0]?.id ?? persona.id, label: persona.starterTitle, person: persona.person, context: persona.context, message: persona.draft }] : examples;
  const [selected, setSelected] = useState(choices[0].id);
  const [practices, setPractices] = useState<Record<string, Practice>>({});
  const [ready, setReady] = useState(false);
  const example = choices.find(item => item.id === selected) ?? choices[0];
  const initial: Practice = { message: example.message, step: 0, next: "tomorrow" };
  const practice = practices[example.id] ?? initial;
  const update = (patch: Partial<Practice>) => setPractices(current => ({ ...current, [example.id]: { ...(current[example.id] ?? initial), ...patch } }));
  const field = useRef<HTMLTextAreaElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const focusStep = useRef(false);
  const uid = useId();
  const selection = persona ? `${persona.id}~${example.id}` : undefined;
  useEffect(() => { setReady(true); }, []);
  useEffect(() => { if (selection) window.dispatchEvent(new CustomEvent("jitm:scenario", { detail: { scenario: selection } })); }, [selection]);
  useEffect(() => { if (focusStep.current) { stepHeading.current?.focus(); focusStep.current = false; } }, [practice.step]);
  useEffect(() => {
    const highlight = () => { setPractices(current => ({ ...current, [example.id]: { ...(current[example.id] ?? initial), step: 0 } })); requestAnimationFrame(() => { field.current?.focus(); field.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }); };
    const trigger = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest('[data-demo-trigger][href="#sample"]')) { event.preventDefault(); highlight(); }
    };
    document.addEventListener("click", trigger, true);
    return () => document.removeEventListener("click", trigger, true);
  }, [example.id, example.message]);
  const go = (step: Practice["step"]) => { focusStep.current = true; update({ step }); };
  const title = ["Make it sound like you", "Review your message", "Choose the next step", practice.next === "later" ? "Left for now" : "A next step, ready to review"][practice.step];

  return <section className="product-demo quick-demo" id="sample" aria-label={heading} data-marketing-scenario={selection} aria-busy={!ready}>
    <div className="quick-demo-header"><h2>{heading}</h2><p>Fictional example. Nothing is sent.</p></div>
    {choices.length > 1 && <details className="quick-demo-examples"><summary>Change example</summary><label className="field"><span>Example</span><select value={example.id} disabled={!ready} onChange={event => setSelected(event.target.value)}>{choices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></details>}
    <div className="quick-demo-step" aria-labelledby={`${uid}-step`}>
      <ol className="demo-rhythm" aria-label="Practice progress">{["Make it sound like you", "Preview", "Record what happened"].map((label, index) => <li key={label} aria-current={Math.min(practice.step, 2) === index ? "step" : undefined}><i aria-hidden="true" /><span>{label}</span></li>)}</ol>
      <p className="quick-demo-progress">{practice.step < 3 ? `Step ${practice.step + 1} of 3` : "Practice complete"}</p>
      <h3 id={`${uid}-step`} ref={stepHeading} tabIndex={-1}>{title}</h3>
      {practice.step === 0 && <><p className="quick-demo-context">{example.context}</p><label className="field"><span>Message to {example.person}</span><textarea ref={field} value={practice.message} onChange={event => update({ message: event.target.value })} maxLength={1500} rows={4} disabled={!ready} /></label><button className="button primary" type="button" disabled={!ready || !practice.message.trim()} onClick={() => go(1)}>Preview message</button></>}
      {practice.step === 1 && <><p className="quick-demo-recipient">To {example.person}</p><blockquote>{practice.message}</blockquote><p>In your account, you send through your own messaging app. This preview sends nothing.</p><div className="quick-demo-actions"><button className="button" type="button" onClick={() => go(0)}>Back to edit</button><button className="button primary" type="button" onClick={() => go(2)}>Choose next step</button></div></>}
      {practice.step === 2 && <><p>When would you like to check in again?</p><fieldset className="quick-demo-next"><legend className="sr-only">Next step</legend><label><input type="radio" name={`${uid}-next`} checked={practice.next === "tomorrow"} onChange={() => update({ next: "tomorrow" })} />Review tomorrow</label><label><input type="radio" name={`${uid}-next`} checked={practice.next === "later"} onChange={() => update({ next: "later" })} />Leave it for now</label></fieldset><div className="quick-demo-actions"><button className="button" type="button" onClick={() => go(1)}>Back</button><button className="button primary" type="button" onClick={() => go(3)}>Finish practice</button></div></>}
      {practice.step === 3 && <><p role="status">{practice.next === "tomorrow" ? "In your account, this follow-up would appear in Today tomorrow." : "You chose to leave this follow-up for now."} Nothing was sent or scheduled in this demo.</p><p>A Mix is a follow-up plan you can reuse.</p><Link className="button primary" href={selection ? `/waitlist?scenario=${encodeURIComponent(selection)}` : "/waitlist"}>Join the waitlist</Link><p className="quick-demo-access">Confirm your email, then wait for an invitation. Free account; no card.</p></>}
    </div>
    <button className="text-button quick-demo-reset" type="button" disabled={!ready} onClick={() => { focusStep.current = true; setPractices(current => ({ ...current, [example.id]: initial })); }}>Reset example</button>
    <noscript><p>This example needs JavaScript to edit. You can still read it and <Link href="/waitlist">join the waitlist</Link>.</p></noscript>
  </section>;
}
