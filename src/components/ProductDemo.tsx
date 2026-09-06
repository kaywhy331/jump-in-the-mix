"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";

const examples = [
  { label: "An open estimate", name: "Alex Morgan", context: "Estimate follow-up · Day 3", message: "Hi Alex, have you had a chance to look over the estimate? Happy to talk through any questions and find a time that works for you." },
  { label: "A finished job", name: "Jordan Lee", context: "After the job · Day 2", message: "Hi Jordan, just checking in now that the work is finished. Is everything working the way you expected? Let me know if there’s anything we can help with." },
  { label: "A past customer", name: "Sam Rivera", context: "Keep in touch · Day 90", message: "Hi Sam, it’s been a little while! How is everything holding up? If anything needs attention, we’re here to help." }
];

export function ProductDemo() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [selected, setSelected] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const example = examples[selected];
  return <section className="product-demo" aria-label="Try a sample follow-up" aria-busy={!ready}>
    <div className="product-demo-heading"><div><span className="eyebrow">A little follow-through</span><h2>Today</h2></div><span className="status-pill">{ready ? "Interactive sample" : "Loading sample…"}</span></div>
    <fieldset className="demo-scenarios" disabled={!ready}><legend>Choose a moment</legend>{examples.map((item, index) => <label key={item.label}><input type="radio" name="demo-scenario" checked={selected === index} onChange={() => { setSelected(index); setReviewed(false); }} /><span>{item.label}</span></label>)}</fieldset>
    <div className="demo-follow-up" aria-live="polite" aria-atomic="true">
      <div className="demo-person"><span className="demo-avatar" aria-hidden="true">{example.name.split(" ").map(part => part[0]).join("")}</span><div><h3>{example.name}</h3><p>{example.context}</p></div><AppIcon name="message" /></div>
      <p className="demo-message">{example.message}</p>
      <p className="demo-status">{reviewed ? "That’s the idea. A personal touch, ready when you are." : "A thoughtful starting point. Make it sound like you."}</p>
    </div>
    <button className={`button ${reviewed ? "soft" : "primary"}`} type="button" disabled={!ready} onClick={() => setReviewed(!reviewed)}>{reviewed ? "Try it again" : "Try reviewing a follow-up"}<AppIcon name={reviewed ? "check" : "message"} /></button>
    <small>Sample people and messages. Nothing is sent.</small>
  </section>;
}
