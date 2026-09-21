"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { validateWorkflow } from "@/lib/mix-workflow-validation";
import { WorkflowSaveError } from "@/lib/mix-workflow-client";
import { FormGuard } from "@/components/FormGuard";
import type { WorkflowGraphMix } from "@/lib/mix-workflow-view";
import { workflowNodeKey, type WorkflowConfiguration, type WorkflowRule, type WorkflowTarget } from "@/lib/mix-workflow-types";
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

export function WorkflowRuleEditor({ initial, isNew = !initial, mixes, configuration, sourceMixId, onSave, onDelete, onCancel }: { initial?: WorkflowRule; isNew?: boolean; mixes: WorkflowGraphMix[]; configuration?: WorkflowConfiguration; sourceMixId?: string; onSave: (rule: WorkflowRule, expectedRule: WorkflowRule | null) => Promise<void>; onDelete?: () => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<WorkflowRule>(() => initial ? structuredClone(initial) : ({ id: newId(), name: "Next connection", source: { mixId: sourceMixId ?? mixes.find(mix => mix.status !== "ARCHIVED" && mix.source !== "ONE_TIME")?.id ?? "", stepId: null }, mode: "PARALLEL", enabled: false, routes: [{ id: newId(), label: "After completion", when: "FINISHED", outcome: "", delayMinutes: 0, target: null, maxVisits: null, replace: false }], join: null }));
  const [base, setBase] = useState<WorkflowRule | null>(() => isNew || !initial ? null : structuredClone(initial));
  const [conflict, setConflict] = useState<{ current: WorkflowRule | null } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); headingRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, []);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) { errorRef.current?.focus({ preventScroll: true }); errorRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); } }, [error]);
  const route = (index: number, patch: Partial<WorkflowRule["routes"][number]>) => setDraft(current => ({ ...current, routes: current.routes.map((item, position) => position === index ? { ...item, ...patch } : item) }));
  const repeatLimitNeeded = useMemo(() => {
    if (!draft.enabled || !configuration) return false;
    const gates = new Set(configuration.gatedStepIds);
    for (const path of draft.routes) if (path.target?.stepId) gates.add(path.target.stepId);
    if (draft.join?.target.stepId) gates.add(draft.join.target.stepId);
    return validateWorkflow({ ...configuration, rules: [...configuration.rules.filter(rule => rule.id !== draft.id), draft], gatedStepIds: [...gates] }, { mixes }).some(issue => issue.includes("repeat limit"));
  }, [draft, configuration, mixes]);
  const save = async (expected = base) => {
    if (repeatLimitNeeded && !conflict) { setError("This return path needs a repeat limit. Set it in Repeat and replace."); return; }
    setError(""); setConflict(null); setBase(expected); setSaving(true);
    try { await onSave(draft, expected); }
    catch (reason) {
      if (reason instanceof WorkflowSaveError && reason.code === "CONNECTION_CHANGED") setConflict({ current: reason.currentRule ?? null });
      setError(reason instanceof Error ? reason.message : "Could not save this connection. Your draft is still here.");
    } finally { setSaving(false); }
  };
  const targetName = (target: WorkflowTarget) => {
    const mix = mixes.find(item => item.id === target.mixId);
    return target.stepId ? `${mix?.steps.find(step => step.id === target.stepId)?.name ?? "Unavailable Beat"} · ${mix?.name ?? "Unavailable Mix"}` : mix?.name ?? "Unavailable Mix";
  };
  return <form className={styles.editor} aria-busy={saving} onInvalid={event => { let panel = (event.target as HTMLElement).closest("details"); while (panel) { panel.open = true; panel = panel.parentElement?.closest("details") ?? null; } }} onSubmit={event => { event.preventDefault(); if (!saving && !conflict) void save(); }}>
    <FormGuard forceDirty={!base || JSON.stringify(draft) !== JSON.stringify(base)} />
    <h2 ref={headingRef} tabIndex={-1}>{!base ? "Connect what happens next" : "Edit connection"}</h2>
    <p className="muted-copy">Continues for the same person and work.</p>
    <fieldset className={styles.editorFields} disabled={saving}>
    <label className="field"><span>Connection name</span><input required maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <label className="field"><span>After which Mix or Beat?</span><select aria-label="After which Mix or Beat?" required value={workflowNodeKey(draft.source)} onChange={event => { const source = workflowTargetFromValue(event.target.value, mixes); if (source) setDraft({ ...draft, source }); }}><WorkflowTargetOptions mixes={mixes} /></select></label>
    {(draft.routes.length > 1 || draft.mode === "CHOICE") && <label className="field"><span>How should the paths work?</span><select aria-label="How should the paths work?" value={draft.mode} onChange={event => setDraft({ ...draft, mode: event.target.value as WorkflowRule["mode"] })}><option value="PARALLEL">Run matching paths together</option><option value="CHOICE">Choose one path by outcome</option></select></label>}
    {repeatLimitNeeded && <p className="notice" role="status">This connection returns to an earlier Mix or Beat. Choose a repeat limit below before enabling it.</p>}
    {draft.routes.map((item, index) => <fieldset key={item.id} className={styles.routeForm}>
      <legend>Path {index + 1}</legend>
      <label className="field"><span>Continue when</span><select aria-label="Continue when" value={item.when} onChange={event => route(index, { when: event.target.value as typeof item.when })}><option value="FINISHED">After completion</option><option value="OUTCOME">After a recorded outcome</option><option value="TIMEOUT">If no outcome is recorded</option></select></label>
      {item.when === "OUTCOME" && <label className="field"><span>Recorded outcome</span><input required maxLength={160} value={item.outcome} onChange={event => route(index, { outcome: event.target.value })} placeholder="Name the outcome you want to track" /><small>Record this outcome when it happens; sending alone does not select it.</small></label>}
      {item.when === "TIMEOUT" && <label className="field"><span>Wait for an outcome (minutes)</span><input type="number" min={1} max={525600} required value={item.delayMinutes} onChange={event => route(index, { delayMinutes: Number(event.target.value) })} /></label>}

      <label className="field"><span>Continue to</span><select aria-label="Continue to" required value={item.target ? workflowNodeKey(item.target) : "end"} onChange={event => route(index, { target: workflowTargetFromValue(event.target.value, mixes) })}><WorkflowTargetOptions mixes={mixes} end /></select>{item.target?.stepId && <small>Starts only this Beat. New work waits for this connection instead of its original schedule.</small>}</label>
      <details open={item.delayMinutes > 0 && item.when !== "TIMEOUT" || undefined}><summary>Timing and label</summary><label className="field"><span>Path label</span><input required maxLength={160} value={item.label} onChange={event => route(index, { label: event.target.value })} /></label>{item.when !== "TIMEOUT" && <label className="field"><span>Wait before continuing (minutes)</span><input type="number" min={0} max={525600} required value={item.delayMinutes} onChange={event => route(index, { delayMinutes: Number(event.target.value) })} /></label>}</details>
      <details open={repeatLimitNeeded || error.includes("repeat limit") || item.maxVisits !== null || undefined}><summary>Repeat and replace</summary><label className="field"><span>Repeat limit</span><input type="number" min={1} max={100} value={item.maxVisits ?? ""} onChange={event => route(index, { maxVisits: event.target.value ? Number(event.target.value) : null })} /><small>Maximum times through this connection per piece of work. At the limit, it waits for your attention.</small></label><label className="checkbox-label"><input type="checkbox" checked={item.replace} onChange={event => route(index, { replace: event.target.checked })} />End other unfinished Beats in the source run when this path is selected</label><small>Completed actions and independently started work are retained.</small></details>
      {draft.routes.length > 1 && <button type="button" className="text-button" onClick={() => setDraft({ ...draft, routes: draft.routes.filter((_, position) => position !== index) })}>Remove this path</button>}
    </fieldset>)}
    <button className="button" type="button" onClick={() => setDraft({ ...draft, routes: [...draft.routes, { id: newId(), label: `Path ${draft.routes.length + 1}`, when: draft.routes[0].when, outcome: "", delayMinutes: 0, target: null, maxVisits: null, replace: false }] })}>Add a path</button>
    {(draft.routes.length > 1 || draft.join) && <details><summary>Bring paths back together</summary><label className="checkbox-label"><input type="checkbox" checked={Boolean(draft.join)} onChange={event => setDraft({ ...draft, join: event.target.checked ? { mode: "ALL", target: { mixId: draft.source.mixId || sourceMixId || mixes[0]?.id || "", stepId: null }, cancelRemaining: false } : null })} />Continue after these paths join</label>{draft.join && <><label className="field"><span>Continue after</span><select aria-label="Continue after" value={draft.join.mode} onChange={event => setDraft({ ...draft, join: { ...draft.join!, mode: event.target.value as "ALL" | "ANY" } })}><option value="ALL">All selected paths finish</option><option value="ANY">The first selected path finishes</option></select></label><label className="field"><span>Then continue to</span><select aria-label="Then continue to" required value={workflowNodeKey(draft.join.target)} onChange={event => { const target = workflowTargetFromValue(event.target.value, mixes); if (target) setDraft({ ...draft, join: { ...draft.join!, target } }); }}><WorkflowTargetOptions mixes={mixes} /></select></label>{draft.join.mode === "ANY" && <label className="checkbox-label"><input type="checkbox" checked={draft.join.cancelRemaining} onChange={event => setDraft({ ...draft, join: { ...draft.join!, cancelRemaining: event.target.checked } })} />Stop unfinished work in the other selected paths</label>}<small>The selected destination Mixes or Beats must finish their own required work and decisions. Their later connections continue independently. Unrelated work is preserved.</small></>}</details>}
    <label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />Enable this connection</label>
    <small>Changes apply to new work. Turning this off also pauses future handoffs in existing work.</small>
    {onDelete && <ConfirmDialog trigger="Remove connection" triggerClassName="text-button" title="Remove this connection?" description="Existing instances retain their history and stop further progression through this connection." danger><button type="button" className="button danger" disabled={saving} onClick={async event => { event.currentTarget.closest("dialog")?.close(); setSaving(true); try { await onDelete(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove."); } finally { setSaving(false); } }}>Remove connection</button></ConfirmDialog>}
    {error && <p ref={errorRef} tabIndex={-1} className="notice error" role="alert">{error}</p>}
    {conflict && <div className={styles.saveConflict}>
      {conflict.current && <details open><summary>Latest saved version</summary>
        <p><strong>{conflict.current.name}</strong> · {conflict.current.enabled ? "Enabled" : "Off"}</p>
        <p>After {targetName(conflict.current.source)} · {conflict.current.mode === "CHOICE" ? "Choose one path" : "Run matching paths together"}</p>
        <ul>{conflict.current.routes.map(item => <li key={item.id}>{item.label} → {item.target ? targetName(item.target) : "Finish this path"}. {item.when === "OUTCOME" ? `Outcome: ${item.outcome}.` : item.when === "TIMEOUT" ? "After waiting for an outcome." : "After completion."} {item.delayMinutes > 0 && `Wait ${item.delayMinutes} minutes.`} {item.maxVisits && `Up to ${item.maxVisits} traversals.`} {item.replace && "Ends other unfinished Beats in the source run."}</li>)}</ul>
        {conflict.current.join && <p>Join after {conflict.current.join.mode === "ALL" ? "all selected paths" : "the first path"} finishes → {targetName(conflict.current.join.target)}. {conflict.current.join.cancelRemaining && "Stops unfinished work in the other selected paths."}</p>}
      </details>}
      <div className={styles.actions}>
        {conflict.current && <button type="button" className="button" onClick={() => { setDraft(structuredClone(conflict.current!)); setBase(structuredClone(conflict.current!)); setConflict(null); setError(""); headingRef.current?.focus(); }}>Use saved version</button>}
        <button type="button" className="button primary" onClick={() => void save(conflict.current)}>{conflict.current ? "Save my version" : "Restore my connection"}</button>
      </div>
    </div>}
    <div className={styles.actions}><button className="button" type="button" disabled={saving} onClick={onCancel}>Cancel</button><button className="button primary" disabled={saving || Boolean(conflict)} type="submit">{saving ? "Saving…" : "Save connection"}</button></div>
    </fieldset>
  </form>;
}
