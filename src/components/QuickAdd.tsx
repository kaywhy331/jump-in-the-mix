"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { inferQuickAddCapture } from "@/lib/quick-add-capture";

const OPEN_QUICK_ADD = "jitm:quick-add";
type QuickAddWindow = Window & { __jitmQuickAddPending?: boolean };

function requestQuickAdd() {
  const target = window as QuickAddWindow;
  target.__jitmQuickAddPending = true;
  target.dispatchEvent(new Event(OPEN_QUICK_ADD));
}

export function QuickAddButton({ mobile = false }: { mobile?: boolean }) {
  return <button type="button" className={mobile ? "nav-link nav-quick-add" : "button primary global-quick-add"} onClick={requestQuickAdd} aria-label="Quick Add">
    <AppIcon name="add" /> <span>Quick Add</span>
  </button>;
}

export function QuickAddDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [capture, setCapture] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof inferQuickAddCapture> | null>(null);

  const closeDialog = () => {
    if (capture.trim() && !window.confirm("Discard this Quick Add draft?")) return;
    setCapture("");
    setPreview(null);
    dialogRef.current?.close();
  };

  useEffect(() => {
    const open = () => {
      (window as QuickAddWindow).__jitmQuickAddPending = false;
      dialogRef.current?.showModal();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener(OPEN_QUICK_ADD, open);
    if ((window as QuickAddWindow).__jitmQuickAddPending) open();
    return () => window.removeEventListener(OPEN_QUICK_ADD, open);
  }, []);

  const contactHref = (() => {
    if (!preview) return "/contacts/new";
    const params = new URLSearchParams({ capture: preview.original });
    if (preview.name) params.set("name", preview.name);
    if (preview.phone) params.set("phone", preview.phone);
    if (preview.dateValue) params.set("followUpDate", preview.dateValue);
    if (preview.reason) params.set("reason", preview.reason);
    return `/contacts/new?${params.toString()}`;
  })();

  return <dialog ref={dialogRef} className="quick-add-dialog" aria-labelledby="quick-add-title" onCancel={(event) => { if (capture.trim()) { event.preventDefault(); closeDialog(); } }}>
    <div className="quick-add-dialog-header"><div><span className="eyebrow quick-add-instruction">Capture without losing your place</span><h2 id="quick-add-title">Quick Add</h2></div><button className="icon-button" type="button" onClick={closeDialog} aria-label="Close Quick Add"><AppIcon name="close" /></button></div>
    <form className="quick-add-composer" onSubmit={(event) => { event.preventDefault(); if (capture.trim()) setPreview(inferQuickAddCapture(capture)); }}>
      <label className="field"><span className="sr-only">What do you want to remember?</span><textarea ref={inputRef} value={capture} onChange={(event) => { setCapture(event.target.value); setPreview(null); event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`; }} placeholder="Follow up with Jordan next Monday about the proposal" rows={2}/></label>
      <button className="button primary quick-add-review" type="submit" disabled={!capture.trim()}><span className="desktop-label">Preview capture</span><span className="mobile-label">Review</span></button>
    </form>
    {preview && <section className="quick-add-proposal" aria-live="polite"><strong>Confirm this interpretation</strong><dl><div><dt>Person</dt><dd>{preview.name ?? "Choose a contact"}</dd></div>{preview.phone && <div><dt>Phone</dt><dd>{preview.phone}</dd></div>}<div><dt>When</dt><dd>{preview.timing}</dd></div><div><dt>Reason</dt><dd>{preview.reason}</dd></div><div><dt>Note</dt><dd>{preview.original}</dd></div></dl><p>{preview.confidence}</p><div className="card-actions"><Link className="button primary" href={contactHref} onClick={() => dialogRef.current?.close()}>Continue with Contact</Link><button className="button" type="button" onClick={() => setPreview(null)}>Edit capture</button></div></section>}
    {!preview && <><div className="quick-add-divider"><span>Or choose a type</span></div>
    <nav className="quick-add-grid" aria-label="Quick Add options">
      <Link href="/contacts/new" onClick={() => dialogRef.current?.close()}><AppIcon name="contacts"/><span><strong>New Contact</strong><small>Add one person</small></span></Link>
      <Link href="/contacts?intent=important-date" onClick={() => dialogRef.current?.close()}><AppIcon name="calendar"/><span><strong>Important Date</strong><small>Choose a Contact, then add the date</small></span></Link>
      <Link href="/contacts?intent=one-time-jump" onClick={() => dialogRef.current?.close()}><AppIcon name="bolt"/><span><strong>One-time Jump</strong><small>Choose Contacts, then prepare one action</small></span></Link>
      <Link className="quick-add-secondary-type" href="/mixes/new" onClick={() => dialogRef.current?.close()}><AppIcon name="mixes"/><span><strong>New Mix</strong><small>Build a follow-up plan</small></span></Link>
      <Link className="quick-add-secondary-type" href="/contacts/import" onClick={() => dialogRef.current?.close()}><AppIcon name="import"/><span><strong>Import Contacts</strong><small>Device, CSV, or VCF</small></span></Link>
    </nav></>}
  </dialog>;
}
