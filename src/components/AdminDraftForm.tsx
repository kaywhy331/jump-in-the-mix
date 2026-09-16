"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAdminDraft } from "@/components/AdminDraftProvider";

type Field = { value: string; checked?: boolean };
type Draft = { values: Record<string, Field[]>; revision?: string };
/** Allowlisted nonsecret fields only. Reauthentication never submits the retained change. */
export function AdminDraftForm({ draftKey, fields, revision, revisionField = "revision", saved, action, children, className = "form-stack" }: {
  draftKey: string; fields: string[]; revision?: string | number; revisionField?: string; saved?: string;
  action: (data: FormData) => void | Promise<void>; children: ReactNode; className?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const draft = useAdminDraft<Draft>(draftKey, { values: {}, revision: revision === undefined ? undefined : String(revision) });
  const allowReset = useRef(false);
  const applied = useRef(false);
  const savedBefore = useRef<string | undefined>(undefined);
  const [reviewedRevision, setReviewedRevision] = useState<string | null>(null);
  const currentRevision = revision === undefined ? undefined : String(revision);
  const conflict = draft.dirty && draft.value.revision !== currentRevision && reviewedRevision !== currentRevision;
  useEffect(() => {
    if (saved && savedBefore.current !== saved) { savedBefore.current = saved; draft.clear(); applied.current = true; return; }
    if (applied.current || !form.current) return;
    applied.current = true;
    for (const control of form.current.elements) {
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) continue;
      const index = Array.from(form.current.elements).filter(element => element instanceof HTMLElement && element.getAttribute("name") === control.name).indexOf(control);
      const retained = draft.value.values[control.name]?.[index];
      if (!fields.includes(control.name) || !retained || (control instanceof HTMLInputElement && ["password", "hidden", "file"].includes(control.type))) continue;
      control.value = retained.value;
      if (control instanceof HTMLInputElement && retained.checked !== undefined) control.checked = retained.checked;
    }
  }, [draft, fields, saved]);
  function capture() {
    if (!form.current) return;
    const values: Draft["values"] = {};
    for (const control of form.current.elements) {
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) continue;
      if (!fields.includes(control.name) || (control instanceof HTMLInputElement && ["password", "hidden", "file"].includes(control.type))) continue;
      (values[control.name] ??= []).push({ value: control.value, ...(control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type) ? { checked: control.checked } : {}) });
    }
    draft.set({ values, revision: conflict ? draft.value.revision : currentRevision });
  }
  return <form ref={form} action={action} className={className} onReset={event => { if (draft.dirty && !allowReset.current) event.preventDefault(); allowReset.current = false; }} onInput={capture} onChange={capture} onSubmit={event => {
    if (conflict) { event.preventDefault(); return; }
    capture();
    // Passwords are sent for this submission only and are never retained in a draft.
    window.setTimeout(() => form.current?.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = ""; }), 0);
  }}>
    {currentRevision !== undefined && <input name={revisionField} type="hidden" value={currentRevision} />}
    {conflict && <div className="notice info" role="alert"><p>This record changed while your draft was open. Review the current record before applying the retained fields.</p><button className="button" type="button" onClick={() => { setReviewedRevision(currentRevision ?? ""); draft.set({ ...draft.value, revision: currentRevision }); }}>I reviewed the current record; keep my draft</button></div>}
    {draft.dirty && <p className="admin-result-summary" role="status">Unsaved changes retained in this tab for 30 minutes. After verification, review and submit again. <button type="button" className="button small" onClick={() => { if (window.confirm("Discard these unsaved changes?")) { draft.clear(); allowReset.current = true; form.current?.reset(); } }}>Discard draft</button></p>}
    {children}
  </form>;
}
