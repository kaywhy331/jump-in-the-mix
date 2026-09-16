"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { inviteWaitlistSelectionAction } from "@/lib/waitlist-admin-actions";
import { useAdminDraft } from "@/components/AdminDraftProvider";
type Row = { id: string; email: string; requested: string; confirmed: boolean; canInvite: boolean; context?: string; href?: string };
function SendButton({ disabled }: { disabled: boolean }) { const { pending } = useFormStatus(); return <button className="button primary" type="submit" disabled={pending || disabled}>{pending ? "Queueing invitations…" : "Confirm and queue invitations"}</button>; }
export function WaitlistSelectionForm({ rows, returnTo, capacity, canManage, problem, saved }: { rows: Row[]; returnTo: string; capacity: number; canManage: boolean; problem: string | null; saved?: string }) {
  const draft = useAdminDraft(`waitlist-selection:${returnTo}`, { selected: [] as string[], reason: "" });
  const [review, setReview] = useState(false);
  const cleared = useRef<string | undefined>(undefined);
  useEffect(() => { if (saved && cleared.current !== saved) { cleared.current = saved; draft.clear(); setReview(false); } }, [saved, draft]);
  const selected = rows.filter(row => row.canInvite && draft.value.selected.includes(row.id));
  function select(ids: string[]) { draft.set({ ...draft.value, selected: ids }); setReview(false); }
  return <form action={inviteWaitlistSelectionAction} className="form-stack" onSubmit={event => { if (!review) event.preventDefault(); }}><input type="hidden" name="returnTo" value={returnTo} />
    {canManage && <div className="page-actions"><button className="button small" type="button" disabled={Boolean(problem)} onClick={() => select(rows.filter(row => row.canInvite).map(row => row.id))}>Select eligible on this page</button><button className="button small" type="button" onClick={() => select([])}>Clear selection</button><span role="status">{selected.length} selected · {capacity} spaces available</span></div>}
    <div className="admin-queue">{rows.map(row => <div className="admin-queue-row" key={row.id}><div>{canManage ? <label><input type="checkbox" name="entryId" value={row.id} checked={selected.some(item => item.id === row.id)} disabled={!row.canInvite} onChange={event => select(event.target.checked ? [...draft.value.selected, row.id] : draft.value.selected.filter(id => id !== row.id))} />{row.email}</label> : <strong>{row.email}</strong>}<p>Requested {row.requested} · {row.confirmed ? "Email confirmed" : "Awaiting confirmation"}</p>{row.context && <small>{row.context}</small>}</div>{row.href && <Link className="button small" href={row.href}>Review invitation</Link>}</div>)}</div>
    {!rows.length && <p>No matching entries.</p>}
    {canManage && <><label className="field"><span>Reason for manual invitations</span><input name="reason" value={draft.value.reason} onChange={e => { draft.set({ ...draft.value, reason: e.target.value }); setReview(false); }} maxLength={500} required /></label><p>Up to 50 confirmed entries on this page. The full eligible selection must fit the current capacity. Eligibility is checked again when queued.</p>{problem && <p className="notice error">{problem}</p>}{selected.length > capacity && <p className="notice error" role="alert">Select {selected.length - capacity} fewer people to fit the current capacity.</p>}
      {!review ? <button className="button primary" type="button" disabled={!selected.length || selected.length > capacity || !draft.value.reason.trim()} onClick={() => setReview(true)}>Review {selected.length} invitations</button> : <section className="card form-stack"><h3>Review before queueing</h3><p>{selected.length} customer invitations will reserve {selected.length} places and queue email. They are additional to scheduled waves; your personal invitation allowance is unchanged.</p><ul>{selected.map(row => <li key={row.id}>{row.email}</li>)}</ul><p>Reason: {draft.value.reason}</p><div className="form-actions"><SendButton disabled={!selected.length || selected.length > capacity || Boolean(problem)} /><button className="button" type="button" onClick={() => setReview(false)}>Edit selection</button></div></section>}
    </>}
  </form>;
}
