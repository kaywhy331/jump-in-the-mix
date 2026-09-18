"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { VoiceNoteButton } from "@/components/VoiceNoteButton";
import { inferQuickAddCapture } from "@/lib/quick-add-capture";
import { useBrowserScope } from "@/components/BrowserAccountBoundary";
import { saveCaptureDraft } from "@/lib/capture-draft";

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

export function QuickAddDialog({ timezone }: { timezone: string }) {
  const scope = useBrowserScope();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const [capture, setCapture] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof inferQuickAddCapture> | null>(null);
  const [error, setError] = useState("");
  const interpret = (text: string) => inferQuickAddCapture(text, new Date(), timezone);

  useEffect(() => {
    if (dialogRef.current?.open) (preview ? reviewRef.current : inputRef.current)?.focus();
  }, [preview]);

  const closeDialog = () => {
    if (capture.trim() && !window.confirm("Discard this Quick Add draft?")) return;
    setCapture("");
    setPreview(null);
    setError("");
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

  const continueWithContact = () => {
    if (!preview) return;
    const id = saveCaptureDraft(scope, preview);
    if (!id) { setError("Your browser could not keep this temporary draft. Keep or copy your text here, then open Add a person to enter it."); return; }
    dialogRef.current?.close(); setCapture(""); setPreview(null); setError("");
    router.push(`/contacts/new?draft=${id}`);
  };

  return <dialog ref={dialogRef} className="quick-add-dialog" aria-labelledby="quick-add-title" onCancel={(event) => { if (capture.trim()) { event.preventDefault(); closeDialog(); } }}>
    <div className="quick-add-dialog-header"><div><h2 id="quick-add-title">Quick Add</h2></div><button className="icon-button" type="button" onClick={closeDialog} aria-label="Close Quick Add"><AppIcon name="close" /></button></div>
    <form className="quick-add-composer" hidden={Boolean(preview)} onSubmit={(event) => { event.preventDefault(); if (capture.trim()) setPreview(interpret(capture)); }}>
      <label className="field"><span className="sr-only">What do you want to remember?</span><textarea id="quick-add-capture" ref={inputRef} value={capture} maxLength={2000} onChange={(event) => { const next = event.target.value; setCapture(next); event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`; }} placeholder="Text Maria Friday about the estimate" rows={2}/></label>
      <VoiceNoteButton targetId="quick-add-capture" label="Speak" />
      <button className="button primary quick-add-review" type="submit" disabled={!capture.trim()}>Continue</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {preview && <section className="quick-add-proposal" aria-live="polite"><strong ref={reviewRef} tabIndex={-1}>Check the details</strong><dl><div><dt>Person</dt><dd>{preview.name ?? "Choose a contact"}</dd></div>{preview.email && <div><dt>Email</dt><dd>{preview.email}</dd></div>}{preview.phone && <div><dt>Phone</dt><dd>{preview.phone}</dd></div>}<div><dt>When</dt><dd>{preview.dateValue ? `${preview.dateValue} · ${timezone}` : preview.timing}</dd></div><div><dt>Reason</dt><dd>{preview.reason}</dd></div></dl><p>{preview.confidence}</p><div className="card-actions"><button className="button primary" type="button" onClick={continueWithContact}>Add person & follow-up</button><button className="button" type="button" onClick={() => setPreview(null)}>Edit capture</button></div></section>}
    {!preview && <><details className="workflow-options"><summary>Other ways to add</summary>
    <nav className="quick-add-grid" aria-label="Quick Add options">
      <Link href="/contacts/new" onClick={() => dialogRef.current?.close()}><AppIcon name="contacts"/><span><strong>Add a person</strong><small>Name, phone, and optional follow-up</small></span></Link>
      <Link href="/contacts?intent=log-note" onClick={() => dialogRef.current?.close()}><AppIcon name="edit"/><span><strong>Log what happened</strong><small>Choose a person and add a note</small></span></Link>
    </nav></details></>}
  </dialog>;
}
