"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";

const OPEN_QUICK_ADD = "jitm:quick-add";

export function QuickAddButton({ mobile = false }: { mobile?: boolean }) {
  return <button type="button" className={mobile ? "nav-link nav-quick-add" : "button primary global-quick-add"} onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_ADD))} aria-label="Quick Add">
    <AppIcon name="add" /> <span>{mobile ? "Quick Add" : "Quick Add"}</span>
  </button>;
}

function inferredCapture(input: string) {
  const trimmed = input.trim();
  const date = trimmed.match(/\b(today|tomorrow|next (?:monday|week)|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i)?.[0];
  const name = trimmed.match(/(?:follow up with|call|text|email|add)\s+(.+?)(?=\s+(?:today|tomorrow|next|on|about)\b|$)/i)?.[1];
  return { original: trimmed, name: name ?? "a contact", timing: date ?? "a date you choose", confidence: name || date ? "Review the interpretation below." : "Choose a capture type and finish the details." };
}

export function QuickAddDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [capture, setCapture] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof inferredCapture> | null>(null);

  useEffect(() => {
    const open = () => { dialogRef.current?.showModal(); window.setTimeout(() => inputRef.current?.focus(), 0); };
    window.addEventListener(OPEN_QUICK_ADD, open);
    return () => window.removeEventListener(OPEN_QUICK_ADD, open);
  }, []);

  return <dialog ref={dialogRef} className="quick-add-dialog" aria-labelledby="quick-add-title" onClose={() => { setPreview(null); setCapture(""); }}>
    <div className="quick-add-dialog-header"><div><span className="eyebrow">Capture without losing your place</span><h2 id="quick-add-title">Quick Add</h2></div><button className="icon-button" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close Quick Add"><AppIcon name="close" /></button></div>
    <form onSubmit={(event) => { event.preventDefault(); if (capture.trim()) setPreview(inferredCapture(capture)); }}>
      <label className="field"><span>What do you want to remember?</span><textarea ref={inputRef} value={capture} onChange={(event) => { setCapture(event.target.value); setPreview(null); }} placeholder="Follow up with Jordan next Monday about the proposal" rows={3}/><small>We always show a preview before anything is saved.</small></label>
      <button className="button primary" type="submit" disabled={!capture.trim()}>Preview capture</button>
    </form>
    {preview && <section className="quick-add-proposal" aria-live="polite"><strong>Confirm this interpretation</strong><dl><div><dt>Person</dt><dd>{preview.name}</dd></div><div><dt>When</dt><dd>{preview.timing}</dd></div><div><dt>Note</dt><dd>{preview.original}</dd></div></dl><p>{preview.confidence}</p><div className="card-actions"><Link className="button primary" href={`/contacts/new?capture=${encodeURIComponent(preview.original)}`} onClick={() => dialogRef.current?.close()}>Continue with Contact</Link><button className="button" type="button" onClick={() => setPreview(null)}>Edit capture</button></div></section>}
    <div className="quick-add-divider"><span>Or choose a type</span></div>
    <nav className="quick-add-grid" aria-label="Quick Add options">
      <Link href="/contacts/new" onClick={() => dialogRef.current?.close()}><AppIcon name="contacts"/><span><strong>New Contact</strong><small>Add one person</small></span></Link>
      <Link href="/contacts?intent=important-date" onClick={() => dialogRef.current?.close()}><AppIcon name="calendar"/><span><strong>Important Date</strong><small>Choose a Contact, then add the date</small></span></Link>
      <Link href="/contacts?intent=one-time-jump" onClick={() => dialogRef.current?.close()}><AppIcon name="bolt"/><span><strong>One-time Jump</strong><small>Choose Contacts, then prepare one action</small></span></Link>
      <Link href="/mixes/new" onClick={() => dialogRef.current?.close()}><AppIcon name="mixes"/><span><strong>New Mix</strong><small>Build a follow-up plan</small></span></Link>
      <Link href="/contacts/import" onClick={() => dialogRef.current?.close()}><AppIcon name="import"/><span><strong>Import Contacts</strong><small>Device, CSV, or VCF</small></span></Link>
    </nav>
  </dialog>;
}
