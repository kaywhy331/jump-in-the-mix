"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { VoiceNoteButton } from "@/components/VoiceNoteButton";
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
    if (preview.email) params.set("email", preview.email);
    if (preview.dateValue) params.set("followUpDate", preview.dateValue);
    if (preview.reason) params.set("reason", preview.reason);
    return `/contacts/new?${params.toString()}`;
  })();

  return <dialog ref={dialogRef} className="quick-add-dialog" aria-labelledby="quick-add-title" onCancel={(event) => { if (capture.trim()) { event.preventDefault(); closeDialog(); } }}>
    <div className="quick-add-dialog-header"><div><span className="eyebrow quick-add-instruction">Capture without losing your place</span><h2 id="quick-add-title">Quick Add</h2></div><button className="icon-button" type="button" onClick={closeDialog} aria-label="Close Quick Add"><AppIcon name="close" /></button></div>
    <form className="quick-add-composer" onSubmit={(event) => { event.preventDefault(); if (capture.trim()) setPreview(inferQuickAddCapture(capture)); }}>
      <label className="field"><span className="sr-only">What do you want to remember?</span><textarea id="quick-add-capture" ref={inputRef} value={capture} onChange={(event) => { const next = event.target.value; setCapture(next); setPreview(next.trim() ? inferQuickAddCapture(next) : null); event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`; }} placeholder="Text Maria Friday about the estimate" rows={2}/></label>
      <VoiceNoteButton targetId="quick-add-capture" label="Speak" />
      <button className="button primary quick-add-review" type="submit" disabled={!capture.trim()}>Continue</button>
    </form>
    {preview && <section className="quick-add-proposal" aria-live="polite"><strong>Confirm this interpretation</strong><dl><div><dt>Person</dt><dd>{preview.name ?? "Choose a contact"}</dd></div>{preview.phone && <div><dt>Phone</dt><dd>{preview.phone}</dd></div>}<div><dt>When</dt><dd>{preview.timing}</dd></div><div><dt>Reason</dt><dd>{preview.reason}</dd></div><div><dt>Note</dt><dd>{preview.original}</dd></div></dl><p>{preview.confidence}</p><div className="card-actions"><Link className="button primary" href={contactHref} onClick={() => dialogRef.current?.close()}>Continue with Contact</Link><button className="button" type="button" onClick={() => setPreview(null)}>Edit capture</button></div></section>}
    {!preview && <><div className="quick-add-divider"><span>Or start here</span></div>
    <nav className="quick-add-grid" aria-label="Quick Add options">
      <Link href="/contacts/new" onClick={() => dialogRef.current?.close()}><AppIcon name="contacts"/><span><strong>Add a person</strong><small>Name, phone, and optional follow-up</small></span></Link>
      <Link href="/contacts?intent=log-note" onClick={() => dialogRef.current?.close()}><AppIcon name="edit"/><span><strong>Log what happened</strong><small>Choose a person and add a note</small></span></Link>
    </nav></>}
  </dialog>;
}
