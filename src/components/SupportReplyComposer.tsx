"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { adminReplyToSupportTicketFormAction } from "@/lib/support-admin-actions";
import { SUPPORT_REPLY_TEMPLATES } from "@/lib/support-content";
import { useAdminDraft } from "@/components/AdminDraftProvider";

export function SupportReplyComposer({ ticketId, requestKey, returnTo }: { ticketId: string; requestKey: string; returnTo: string }) {
  const [state, action, pending] = useActionState(adminReplyToSupportTicketFormAction, {});
  const draft = useAdminDraft(`support-reply:${ticketId}`, { body: "", requestKey });
  const [template, setTemplate] = useState("");
  const [replacement, setReplacement] = useState<string | null>(null);
  const applied = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.nextKey && applied.current !== state.nextKey) { applied.current = state.nextKey; draft.clear(); setTemplate(""); }
  }, [state.nextKey, draft]);
  const body = draft.value.body;
  function changeBody(body: string) { draft.set({ body, requestKey: draft.dirty ? draft.value.requestKey : state.nextKey ?? requestKey }); }
  return <form action={action} className="form-stack support-reply-composer">
    <input type="hidden" name="ticketId" value={ticketId} />
    <input type="hidden" name="returnTo" value={returnTo} />
    <input type="hidden" name="requestKey" value={draft.dirty ? draft.value.requestKey : state.nextKey ?? requestKey} />
    <label className="field"><span className="field-label">Response template</span><select value={template} onChange={event => {
      setTemplate(event.target.value);
      const selected = SUPPORT_REPLY_TEMPLATES.find(item => item.name === event.target.value);
      if (selected) { if (body.trim()) setReplacement(selected.body); else changeBody(selected.body); }
    }}><option value="">Choose a starting point</option>{SUPPORT_REPLY_TEMPLATES.map(item => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label>
    {replacement !== null && <div className="notice info" role="status"><p>Replace your current reply with this template?</p><button className="button" type="button" onClick={() => { changeBody(replacement); setReplacement(null); }}>Replace reply</button><button className="button" type="button" onClick={() => { setReplacement(null); setTemplate(""); }}>Keep my reply</button></div>}
    <label className="field"><span className="field-label">Reply to customer</span><textarea name="body" aria-describedby={`support-reply-help-${ticketId}`} value={body} onChange={event => changeBody(event.target.value)} minLength={2} maxLength={5000} rows={8} required /></label>
    <small id={`support-reply-help-${ticketId}`}>Replies appear in the ticket immediately. Email is queued separately. Unsaved text stays in this tab for 30 minutes while you update ticket details; reloading or closing the tab discards it.</small>
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
    {state.saved && !draft.dirty && <p className="notice success" role="status">{state.saved}</p>}
    <div className="form-actions"><button className="button primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Send reply"}</button><button className="button" name="resolve" value="true" type="submit" disabled={pending}>Send reply and resolve</button>{draft.dirty && <button className="button" type="button" onClick={() => { if (window.confirm("Discard this unsent reply?")) draft.clear(); }}>Discard draft</button>}</div>
  </form>;
}
