"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { updateLibraryOptionsAction } from "@/lib/admin-settings-actions";
import { useAdminDraft } from "@/components/AdminDraftProvider";
export function LibraryOptionsForm({ settingKey, options, allowed, revision }: { settingKey: string; options: string[]; allowed: string[]; revision: string }) {
  const router = useRouter();
  const draft = useAdminDraft(`library-options:${settingKey}`, { options, revision });
  const [state, action, pending] = useActionState(updateLibraryOptionsAction, {});
  const applied = useRef<unknown>(null);
  const [reset, setReset] = useState(false);
  useEffect(() => { if (state.options && applied.current !== state.options) { applied.current = state.options; draft.clear(); setReset(false); } }, [state.options, draft]);
  const selected = draft.dirty ? draft.value.options : options;
  const currentRevision = revision;
  const conflict = draft.dirty && draft.value.revision !== currentRevision;
  const setOptions = (next: string[]) => draft.set({ options: next, revision: draft.dirty ? draft.value.revision : currentRevision });
  const order = [...selected, ...allowed.filter(item => !selected.includes(item))];
  function move(item: string, direction: number) { const next = [...selected]; const index = next.indexOf(item); if (index < 0 || !next[index + direction]) return; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setOptions(next); }
  return <form action={action} className="form-stack"><input type="hidden" name="key" value={settingKey} /><input type="hidden" name="expectedRevision" value={draft.dirty ? draft.value.revision : currentRevision} /><input type="hidden" name="options" value={selected.join("\n")} />
    <fieldset className="admin-options-list" tabIndex={0}><legend>{selected.length} enabled · display order</legend>{order.map(item => <div className="admin-option-row" key={item}><label><input type="checkbox" checked={selected.includes(item)} onChange={event => setOptions(event.target.checked ? [...selected, item] : selected.filter(value => value !== item))} />{item}</label>{selected.includes(item) && <span className="page-actions"><button className="button small" type="button" aria-label={`Move ${item} up`} disabled={selected.indexOf(item) === 0} onClick={() => move(item, -1)}>↑</button><button className="button small" type="button" aria-label={`Move ${item} down`} disabled={selected.indexOf(item) === selected.length - 1} onClick={() => move(item, 1)}>↓</button></span>}</div>)}</fieldset>
    <small>Choose at least one. Existing content keeps its values.</small><details><summary>Preview customer choices and saved values</summary><label className="field"><span>New Mix choices, in order</span><select aria-label="Preview new Mix choices">{selected.map(item => <option key={item}>{item}</option>)}</select></label><p>Hidden choices: {allowed.filter(item => !selected.includes(item)).join(", ") || "none"}. Existing Mixes retain these values and remain available through All Mixes and search; new Mixes cannot select a hidden choice.</p></details>
    {conflict && <p role="alert">Current values: {options.join(", ")}. Your selection is retained. <button className="button" type="button" onClick={() => draft.set({ options: selected, revision: currentRevision })}>I reviewed the current values; keep my selection</button></p>}
    {state.error && <p className="notice error" role="alert">{state.error} <button className="button" type="button" onClick={() => router.refresh()}>Load current values</button></p>}{state.saved && !draft.dirty && <p className="notice success" role="status">{state.saved}</p>}
    <div className="form-actions"><button className="button primary" disabled={pending || conflict || !selected.length} type="submit">{pending ? "Saving…" : "Save options"}</button><button className="button" type="button" disabled={pending} onClick={() => setReset(true)}>Reset to defaults…</button></div>
    {reset && <div className="notice info"><p>Restore all {allowed.length} reviewed options in their default order? Existing Mixes and customer records will keep their values.</p><button className="button" name="operation" value="reset" type="submit" disabled={pending || conflict}>Restore defaults</button><button className="button" type="button" onClick={() => setReset(false)}>Cancel</button></div>}
  </form>;
}
