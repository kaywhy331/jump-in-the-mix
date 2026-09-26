"use client";
import { useState } from "react";
import Link from "next/link";
import { MARKETING_SCENARIOS } from "@/lib/marketing-scenarios";

export function ProfessionExamples() {
  const [selected, setSelected] = useState("");
  const example = MARKETING_SCENARIOS.find(item => item.id === selected);
  return <section className="profession-examples" aria-label="Quick profession examples">
    <label className="field"><span>See a quick example for your work</span><select value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose your profession</option>{MARKETING_SCENARIOS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    {example && <div className="profession-example" role="region" aria-label={`${example.label} example`}><p>{example.context}</p><blockquote>{example.draft}</blockquote><p className="muted-copy">Fictional example. Nothing is sent.</p><Link className="inline-action" href={`/templates?industry=${encodeURIComponent(example.businessType)}`}>Find a follow-up plan</Link></div>}
  </section>;
}
