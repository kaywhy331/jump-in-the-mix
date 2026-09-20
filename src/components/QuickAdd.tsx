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
  return <button type="button" className={mobile ? "nav-link nav-quick-add" : "button primary global-quick-add"} onClick={requestQuickAdd} aria-label="Quick Add" aria-keyshortcuts="N">
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
  }, [Boolean(preview)]);

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
    const shortcut = (event: KeyboardEvent) => { if (event.key.toLowerCase() !== "n" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector("dialog:modal")) return; const target = event.target; if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return; event.preventDefault(); open(); };
    window.addEventListener("keydown", shortcut);
    window.addEventListener(OPEN_QUICK_ADD, open);
    if ((window as QuickAddWindow).__jitmQuickAddPending) open();
    return () => { window.removeEventListener(OPEN_QUICK_ADD, open); window.removeEventListener("keydown", shortcut); };
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
    {preview && <section className="quick-add-proposal"><blockquote className="quick-add-original">{capture}</blockquote><strong ref={reviewRef} tabIndex={-1}>Saving as</strong><p>Check the recognized details. The next screen lets you choose the follow-up plan before saving.</p><form className="form-stack" onSubmit={event => { event.preventDefault(); continueWithContact(); }}><fieldset className="quick-add-item"><legend><AppIcon name="contacts" />Person</legend><label className="field"><span>Name</span><input value={preview.name ?? ""} maxLength={200} onChange={event => setPreview({ ...preview, name: event.target.value })} /></label><div className="form-grid"><label className="field"><span>Phone</span><input type="tel" value={preview.phone ?? ""} onChange={event => setPreview({ ...preview, phone: event.target.value })} /></label><label className="field"><span>Email</span><input type="email" value={preview.email ?? ""} onChange={event => setPreview({ ...preview, email: event.target.value })} /></label></div></fieldset><fieldset className="quick-add-item"><legend><AppIcon name="today" />Follow-up</legend><label className="field"><span>When · {timezone}</span><input type="date" value={preview.dateValue ?? ""} onChange={event => setPreview({ ...preview, dateValue: event.target.value || null })} /></label><label className="field"><span>Reason</span><input value={preview.reason} maxLength={300} onChange={event => setPreview({ ...preview, reason: event.target.value })} /></label></fieldset><div className="card-actions"><button className="button primary" type="submit">Review person & follow-up</button><button className="button" type="button" onClick={() => setPreview(null)}>Edit capture</button></div></form></section>}
    {!preview && <><details className="workflow-options"><summary>Other ways to add</summary>
    <nav className="quick-add-grid" aria-label="Quick Add options">
      <Link href="/contacts/new" onClick={() => dialogRef.current?.close()}><AppIcon name="contacts"/><span><strong>Add a person</strong><small>Name, phone, and optional follow-up</small></span></Link>
      <Link href="/contacts?intent=log-note" onClick={() => dialogRef.current?.close()}><AppIcon name="edit"/><span><strong>Log what happened</strong><small>Choose a person and add a note</small></span></Link>
    </nav></details></>}
  </dialog>;
}
