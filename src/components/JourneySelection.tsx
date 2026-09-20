"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function JourneySelection({ people, children }: { people: { id: string; quiet: boolean }[]; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const ids = people.map(person => person.id).join(",");
  useEffect(() => {
    setSelected([]);
    root.current?.querySelectorAll<HTMLInputElement>(".journey-select-person").forEach(input => { input.checked = false; });
    const selectQuiet = () => {
      const quiet = new Set(people.filter(person => person.quiet).map(person => person.id));
      setSelecting(true); setExpanded(true); setSelected([...quiet]);
      root.current?.querySelectorAll<HTMLInputElement>(".journey-select-person").forEach(input => { input.checked = quiet.has(input.value); });
      root.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    window.addEventListener("jitm:select-quiet", selectQuiet);
    return () => window.removeEventListener("jitm:select-quiet", selectQuiet);
  }, [ids, people]);
  return <div ref={root} className={`journey-selection${selecting ? " selecting" : ""}${expanded || selecting ? " expanded" : ""}`} onChange={event => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.matches(".journey-select-person")) return;
    setSelected([...root.current!.querySelectorAll<HTMLInputElement>(".journey-select-person:checked")].map(input => input.value));
  }}>
    <div className="journey-selection-tools"><span>{selecting ? `${selected.length} selected on this page` : ""}</span><button className="button small" type="button" onClick={() => setSelecting(value => !value)}>{selecting ? "Done selecting" : "Select"}</button></div>
    {children}
    {!expanded && !selecting && people.length > 5 && <button className="button journey-show-people" type="button" onClick={() => setExpanded(true)}>Show all {people.length} people on this page</button>}
    {selecting && selected.length > 0 && <div className="journey-selection-actions"><Link className="button primary" href={`/contacts?intent=one-time-jump&people=${encodeURIComponent(selected.join(","))}`}>Prepare a follow-up for {selected.length}</Link><p>Review the message and date before scheduling.</p></div>}
  </div>;
}
