"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormGuard } from "@/components/FormGuard";
import type { WorkflowGraphMix } from "@/lib/mix-workflow-view";
import { workflowNodeKey, type WorkflowRule, type WorkflowTarget } from "@/lib/mix-workflow-types";
import styles from "@/components/WorkflowJourney.module.css";

const newId = () => crypto.randomUUID();
export function WorkflowTargetOptions({ mixes, end = false }: { mixes: WorkflowGraphMix[]; end?: boolean }) {
  return <>{end && <option value="end">Finish this path</option>}<option value="">Choose a Mix or Beat</option>{mixes.filter(mix => mix.status !== "ARCHIVED" && mix.source !== "ONE_TIME").map(mix => <optgroup key={mix.id} label={mix.name}><option value={`mix:${mix.id}`}>{mix.name} · whole Mix</option>{mix.steps.map(step => <option key={step.id} value={`beat:${step.id}`}>{step.name} · Beat</option>)}</optgroup>)}</>;
}
export function workflowTargetFromValue(value: string, mixes: WorkflowGraphMix[]): WorkflowTarget | null {
  if (value.startsWith("mix:")) return { mixId: value.slice(4), stepId: null };
  const mix = mixes.find(item => item.steps.some(step => `beat:${step.id}` === value));
  return mix ? { mixId: mix.id, stepId: value.slice(5) } : null;
}

export function WorkflowRuleEditor({ initial, isNew = !initial, mixes, sourceMixId, onSave, onDelete, onCancel }: { initial?: WorkflowRule; isNew?: boolean; mixes: WorkflowGraphMix[]; sourceMixId?: string; onSave: (rule: WorkflowRule) => Promise<void>; onDelete?: () => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<WorkflowRule>(() => initial ? structuredClone(initial) : ({ id: newId(), name: "Next connection", source: { mixId: sourceMixId ?? mixes.find(mix => mix.status !== "ARCHIVED" && mix.source !== "ONE_TIME")?.id ?? "", stepId: null }, mode: "PARALLEL", enabled: false, routes: [{ id: newId(), label: "After completion", when: "FINISHED", outcome: "", delayMinutes: 0, target: null, maxVisits: null, replace: false }], join: null }));
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); headingRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, []);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) { errorRef.current?.focus({ preventScroll: true }); errorRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); } }, [error]);
  const route = (index: number, patch: Partial<WorkflowRule["routes"][number]>) => setDraft(current => ({ ...current, routes: current.routes.map((item, position) => position === index ? { ...item, ...patch } : item) }));
  return <form className={styles.editor} onSubmit={async event => { event.preventDefault(); setError(""); setSaving(true); try { await onSave(draft); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this connection."); } finally { setSaving(false); } }}>
    <FormGuard />
    <h2 ref={headingRef} tabIndex={-1}>{isNew ? "Connect what happens next" : "Edit connection"}</h2>
    <p className="muted-copy">This rule follows the same person and piece of work. Changes apply to new journey instances.</p>
    <label className="field"><span>Connection name</span><input required maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <label className="field"><span>After which Mix or Beat?</span><select required value={workflowNodeKey(draft.source)} onChange={event => { const source = workflowTargetFromValue(event.target.value, mixes); if (source) setDraft({ ...draft, source }); }}><WorkflowTargetOptions mixes={mixes} /></select></label>
    <label className="field"><span>How should the paths work?</span><select value={draft.mode} onChange={event => setDraft({ ...draft, mode: event.target.value as WorkflowRule["mode"] })}><option value="PARALLEL">Run matching paths together</option><option value="CHOICE">Choose one path from the recorded outcome</option></select></label>
    {draft.routes.map((item, index) => <fieldset key={item.id} className={styles.routeForm}>
      <legend>Path {index + 1}</legend>
      <label className="field"><span>Path label</span><input required maxLength={160} value={item.label} onChange={event => route(index, { label: event.target.value })} /></label>
      <label className="field"><span>Continue when</span><select value={item.when} onChange={event => route(index, { when: event.target.value as typeof item.when })}><option value="FINISHED">The action or Mix finishes</option><option value="OUTCOME">An outcome is recorded</option><option value="TIMEOUT">No outcome has been recorded after a wait</option></select></label>
      {item.when === "OUTCOME" && <label className="field"><span>Recorded outcome</span><input required maxLength={160} value={item.outcome} onChange={event => route(index, { outcome: event.target.value })} placeholder="Name the outcome you want to track" /><small>People choose this outcome when recording what happened. It is not inferred from sending a message.</small></label>}
      <label className="field"><span>{item.when === "TIMEOUT" ? "Wait for an outcome (minutes)" : "Wait before continuing (minutes)"}</span><input type="number" min={item.when === "TIMEOUT" ? 1 : 0} max={525600} required value={item.delayMinutes} onChange={event => route(index, { delayMinutes: Number(event.target.value) })} /></label>
      <label className="field"><span>Continue to</span><select required value={item.target ? workflowNodeKey(item.target) : "end"} onChange={event => route(index, { target: workflowTargetFromValue(event.target.value, mixes) })}><WorkflowTargetOptions mixes={mixes} end /></select>{item.target?.stepId && <small>Only this Beat starts at this entry. It will wait for a connection instead of also starting on its own schedule in future instances.</small>}</label>
      <details open={error.includes("repeat limit") || undefined}><summary>Return paths and source work</summary><label className="field"><span>Maximum traversals in one journey instance</span><input type="number" min={1} max={100} value={item.maxVisits ?? ""} onChange={event => route(index, { maxVisits: event.target.value ? Number(event.target.value) : null })} /><small>Required on a connection in each loop. At the limit, the path waits for your attention.</small></label><label className="checkbox-label"><input type="checkbox" checked={item.replace} onChange={event => route(index, { replace: event.target.checked })} />End other unfinished Beats in the source run when this path is selected</label><small>Completed actions and independently started work are retained.</small></details>
      {draft.routes.length > 1 && <button type="button" className="text-button" onClick={() => setDraft({ ...draft, routes: draft.routes.filter((_, position) => position !== index) })}>Remove this path</button>}
    </fieldset>)}
    <button className="button" type="button" onClick={() => setDraft({ ...draft, routes: [...draft.routes, { id: newId(), label: `Path ${draft.routes.length + 1}`, when: draft.routes[0].when, outcome: "", delayMinutes: 0, target: null, maxVisits: null, replace: false }] })}>Add a path</button>
    <details><summary>Bring paths back together</summary><label className="checkbox-label"><input type="checkbox" checked={Boolean(draft.join)} onChange={event => setDraft({ ...draft, join: event.target.checked ? { mode: "ALL", target: { mixId: sourceMixId ?? mixes[0]?.id ?? "", stepId: null }, cancelRemaining: false } : null })} />Continue after these paths join</label>{draft.join && <><label className="field"><span>Continue after</span><select value={draft.join.mode} onChange={event => setDraft({ ...draft, join: { ...draft.join!, mode: event.target.value as "ALL" | "ANY" } })}><option value="ALL">All selected paths finish</option><option value="ANY">The first selected path finishes</option></select></label><label className="field"><span>Then continue to</span><select required value={workflowNodeKey(draft.join.target)} onChange={event => { const target = workflowTargetFromValue(event.target.value, mixes); if (target) setDraft({ ...draft, join: { ...draft.join!, target } }); }}><WorkflowTargetOptions mixes={mixes} /></select></label>{draft.join.mode === "ANY" && <label className="checkbox-label"><input type="checkbox" checked={draft.join.cancelRemaining} onChange={event => setDraft({ ...draft, join: { ...draft.join!, cancelRemaining: event.target.checked } })} />Stop unfinished work in the other selected paths</label>}<small>The selected destination Mixes or Beats must finish their own required work and decisions. Their later connections continue independently. Unrelated work is preserved.</small></>}</details>
    <label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />Enable this connection</label>
    <small>New instances use this configuration. Disabling also holds further progression through this connection in existing instances; work already started is retained.</small>
    {onDelete && <ConfirmDialog trigger="Remove connection" triggerClassName="text-button" title="Remove this connection?" description="Existing instances retain their history and stop further progression through this connection." danger><button type="button" className="button danger" disabled={saving} onClick={async event => { event.currentTarget.closest("dialog")?.close(); setSaving(true); try { await onDelete(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove."); } finally { setSaving(false); } }}>Remove connection</button></ConfirmDialog>}
    {error && <p ref={errorRef} tabIndex={-1} className="notice error" role="alert">{error}</p>}
    <div className={styles.actions}><button className="button" type="button" disabled={saving} onClick={onCancel}>Cancel</button><button className="button primary" disabled={saving} type="submit">{saving ? "Saving…" : "Save connection"}</button></div>
  </form>;
}
