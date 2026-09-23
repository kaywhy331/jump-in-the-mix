"use client";

import { useRef, useState } from "react";
import { ReviewDialog } from "@/components/ReviewDialog";
import { TimezonePicker } from "@/components/TimezonePicker";
import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";
import { saveWorkflowChange } from "@/lib/mix-workflow-client";
import type { WorkflowInstanceView } from "@/lib/mix-workflow-view";
import type { WorkflowBusinessUpdate } from "@/lib/mix-workflow-types";
import type { BusinessUpdatePreview } from "@/lib/workflow-business-preview";
import styles from "@/components/WorkflowJourney.module.css";

export function WorkflowBusinessUpdateForm({ instance, displayPreferences, onUpdate }: { instance: WorkflowInstanceView; displayPreferences: DisplayFormatPreferences; onUpdate: () => void }) {
  const runs = instance.updateRuns ?? [];
  const [runId, setRunId] = useState(() => runs.find(run => instance.state.runs.find(item => item.id === run.id)?.status === "ACTIVE")?.id ?? runs[0]?.id ?? "");
  const [choice, setChoice] = useState(""), [time, setTime] = useState(""), [timezone, setTimezone] = useState(displayPreferences.timeZone ?? "UTC");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ preview: BusinessUpdatePreview; input: WorkflowBusinessUpdate } | null>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const selected = runs.find(run => run.id === runId);
  const waiting = choice === "CUSTOMER" || choice === "OWNER";
  const reviewUpdate = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const outcome = selected?.choices.find((_, index) => String(index) === choice);
      if (!waiting && !outcome) throw new Error("Choose what happened or when to check again.");
      const input: WorkflowBusinessUpdate & { localTime?: string } = waiting ? { kind: "WAIT", runId, scope: "SOURCE_MIX_REMAINDER", source: choice as "CUSTOMER" | "OWNER", timezone, localTime: time } : { kind: "OUTCOME", runId, scope: "SOURCE_MIX_REMAINDER", ruleId: outcome!.ruleId, outcome: outcome!.outcome };
      const response = await fetch("/api/mix-workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview-update", instanceId: instance.id, expectedRevision: instance.revision, businessUpdate: input }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "The update could not be reviewed. Try again.");
      setReview({ preview: result, input: result.input });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The update could not be reviewed. Try again."); }
    finally { setBusy(false); }
  };
  const save = async (patch: { businessUpdate: WorkflowBusinessUpdate } | { undoUpdateId: string }) => {
    if (busy) return;
    const fingerprint = JSON.stringify(patch);
    const storageKey = `jitm-update:${instance.id}:${fingerprint}`;
    if (request.current?.fingerprint !== fingerprint) {
      let id = crypto.randomUUID(); try { id = sessionStorage.getItem(storageKey) ?? id; sessionStorage.setItem(storageKey, id); } catch {}
      request.current = { fingerprint, id };
    }
    setBusy(true); setError("");
    try {
      await saveWorkflowChange({ action: "progress", instanceId: instance.id, expectedRevision: instance.revision, requestId: request.current!.id, ...patch });
      try { sessionStorage.removeItem(storageKey); } catch {}
      setReview(null); setNotice("Update saved. Check the progress below for its next step."); onUpdate();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The save could not be confirmed. Retry with the same update."); }
    finally { setBusy(false); }
  };
  if (!runs.length) return null;
  if (instance.state.pendingBusinessUpdate) return <p className="notice" role="status">Your update is saved. An earlier message is already being processed. Further automatic messages from this work are on hold until its result is known; progress will then apply your update.</p>;
  const latest = [...(instance.state.updates ?? [])].reverse().find(record => record.kind !== "UNDO" && !record.reversedAt);
  return <>
    {instance.state.commitments?.filter(item => item.status === "OPEN").map(item => <p key={item.id} className="notice">{item.source === "CUSTOMER" ? "Customer requested a callback" : "You chose to check again"}: <strong>{formatDateTime(item.dueAt, { ...displayPreferences, timeZone: item.timezone })}</strong> ({item.timezone}). Review this work at that time; no customer acceptance has been assumed.</p>)}
    <details><summary>Record an update or choose a callback date</summary>
      <form className={styles.decision} onSubmit={event => { event.preventDefault(); void reviewUpdate(); }}>
        <label className="field"><span>Which work changed?</span><select value={runId} onChange={event => { setRunId(event.target.value); setChoice(""); }} disabled={busy}>{runs.map(run => <option key={run.id} value={run.id}>{run.name} · {formatDateTime(instance.state.runs.find(item => item.id === run.id)!.startedAt, displayPreferences)}</option>)}</select></label>
        <label className="field"><span>What happened?</span><select value={choice} onChange={event => setChoice(event.target.value)} required disabled={busy}><option value="">Choose an update</option>{selected?.choices.map((option, index) => <option key={`${option.ruleId}:${option.outcome}`} value={index}>{option.label}</option>)}<option value="CUSTOMER">Customer asked me to get back to them</option><option value="OWNER">I want to choose when to check again</option></select></label>
        {waiting && <><label className="field"><span>Check-back date and time</span><input type="datetime-local" value={time} onChange={event => setTime(event.target.value)} required disabled={busy} /></label><TimezonePicker name={`callbackTimezone-${instance.id}`} defaultValue={timezone} onChange={setTimezone} /><small>This saves one action for you in Today. The remaining follow-ups in this Mix end; review what to do next at the saved time.</small></>}
        {!selected?.choices.length && <small>This saved Mix has no whole-Mix outcome path. Choose a check-back date to end its remaining reminders and review the next step later, or pause this work below.</small>}
        <button className="button small" disabled={busy || !choice}>{busy ? "Checking…" : "Review this update"}</button>
      </form>
      {latest && <p>Last update: {latest.summary}. {latest.canUndo ? <button className="text-button" type="button" disabled={busy} onClick={() => void save({ undoUpdateId: latest.id })}>Undo last update</button> : "To correct it, record a new update above. Performed work stays in history."}</p>}
    </details>
    {notice && <p role="status">{notice}</p>}
    {error && !review && <p className="notice error" role="alert">{error}</p>}
    <ReviewDialog open={Boolean(review)} onClose={() => { if (!busy) setReview(null); }} title="Save this update?" description={review ? `${review.preview.contactName} · ${review.preview.label} · ${review.preview.mixName}` : "Review the effect on this work."}>
      {review && <div className="form-stack"><p>{review.input.kind === "OUTCOME" ? review.input.outcome : `${review.input.source === "CUSTOMER" ? "Customer requested" : "You chose"}: ${formatDateTime(review.input.dueAt!, { ...displayPreferences, timeZone: review.input.timezone! })} (${review.input.timezone})`}</p>
        <p><strong>{review.preview.ends.length} pending follow-up{review.preview.ends.length === 1 ? " ends" : "s end"}.</strong> Review the reminders below before saving.</p>
        {Boolean(review.preview.ends.length) && <ul>{review.preview.ends.map((name, index) => <li key={index}>{name}</li>)}</ul>}
        <p>{review.preview.keepsCompleted} completed or skipped actions stay in history. {review.preview.independentPending} other pending follow-ups in this work stay as they are. Separate work for this person is unaffected.</p>
        {review.preview.continues.map((line, index) => <p key={index}>{line}</p>)}<p>{review.preview.sending}</p>
        {review.preview.inFlight > 0 && <p className="notice">{review.preview.inFlight} message is already being processed. Your update will be saved, then applied when that result is known.</p>}
        {review.preview.previousMessages > 0 && <p>Previously processed messages keep their delivery records. This update cannot recall a message.</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="button" disabled={busy} onClick={() => setReview(null)}>Keep editing</button><button type="button" className="button primary" disabled={busy} onClick={() => void save({ businessUpdate: review.input })}>{busy ? "Saving…" : "Save update"}</button></div>
      </div>}
    </ReviewDialog>
  </>;
}
