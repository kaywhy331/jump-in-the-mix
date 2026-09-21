"use client";

import Link from "next/link";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useEffect, useState } from "react";
import type { WorkflowGraphView, WorkflowInstanceView } from "@/lib/mix-workflow-view";
import styles from "@/components/WorkflowJourney.module.css";

export async function saveWorkflowChange(input: unknown) {
  const response = await fetch("/api/mix-workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "The change could not be saved.");
  window.dispatchEvent(new CustomEvent("jitm:workflow-updated"));
  return data;
}

export function WorkflowInstanceCard({ instance, canEdit, onUpdate }: { instance: WorkflowInstanceView; canEdit: boolean; onUpdate: () => void }) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const update = async (patch: Record<string, unknown>) => { setBusy(true); setError(""); try { await saveWorkflowChange({ action: "progress", instanceId: instance.id, expectedRevision: instance.revision, requestId: crypto.randomUUID(), ...patch }); onUpdate(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save."); } finally { setBusy(false); } };
  const active = instance.beats.filter(beat => ["PENDING", "HELD"].includes(beat.status));
  return <article className={styles.instance}>
    <div className={styles.instanceHeading}><div><Link href={`/contacts/${instance.contactId}`}><strong>{instance.contactName}</strong></Link><p>{instance.label}</p></div><span className="status-pill">{instance.status.toLowerCase()}</span></div>
    {instance.state.issue && <p role="status" className="notice">{instance.state.issue}</p>}
    {Boolean(instance.state.pendingChoices?.length) && <p role="status" className="notice">An outcome is saved. It will continue when this instance and its connection are ready.</p>}
    {active.map(beat => <div key={beat.visitId} className={styles.beatProgress}><span><strong>{beat.name}</strong><small>{beat.mixName} · {beat.status === "HELD" ? instance.state.visits.find(visit => visit.id === beat.visitId)?.reason ?? "Waiting" : beat.scheduledAt ? new Date(beat.scheduledAt).toLocaleString() : "Waiting for its timing anchor"}</small></span>{beat.jumpId && <Link className="button small" href={`/jumps?jump=${beat.jumpId}`}>Review</Link>}</div>)}
    {active.some(beat => beat.status === "HELD" && instance.state.visits.find(visit => visit.id === beat.visitId)?.reason?.includes("appointment")) && <form className={styles.decision} onSubmit={event => { event.preventDefault(); const calendarEntryId = new FormData(event.currentTarget).get("calendarEntryId"); if (calendarEntryId) void update({ calendarEntryId }); }}><label className="field"><span>Link an appointment for this work</span><select name="calendarEntryId" required disabled={!canEdit || busy}><option value="">Choose an appointment</option>{instance.appointments.map(entry => <option key={entry.id} value={entry.id}>{entry.title} · {new Date(entry.startsAt).toLocaleDateString()}</option>)}</select></label><small>These linked Beats wait for manual review before sending. Record the visit outcome in Calendar when it happens.</small>{canEdit && <button className="button small" disabled={busy || !instance.appointments.length}>Link appointment</button>}<Link href="/calendar">Open Calendar</Link></form>}
    {instance.decisions.map(decision => <form key={`${decision.id}:${decision.outcome}`} className={styles.decision} onSubmit={event => { event.preventDefault(); const outcome = new FormData(event.currentTarget).get("outcome"); if (outcome) void update({ evaluationId: decision.id, outcome }); }}><label className="field"><span>{decision.name}</span><select name="outcome" required defaultValue={decision.outcome ?? ""} disabled={!canEdit || busy || instance.status === "STOPPED" || instance.status === "PAUSED"}><option value="">Waiting for a recorded outcome</option>{decision.choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>{canEdit && <button className="button small" disabled={busy || instance.status === "STOPPED" || instance.status === "PAUSED"}>Record outcome</button>}</form>)}
    {instance.state.transitions.filter(path => path.status === "HELD" || path.status === "WAITING").map(path => <p key={path.id} className={styles.wait}>{path.reason ?? `Continues after ${new Date(path.dueAt).toLocaleString()}`}</p>)}
    <details><summary>Progress and previous visits · {instance.beats.length} Beats</summary><ol className={styles.history}>{instance.beats.map(beat => <li key={beat.visitId}><strong>{beat.name}</strong><span>{beat.mixName} · {beat.status.toLowerCase()}</span></li>)}</ol><small>Saved configuration {instance.definitionRevision}. Each return keeps its previous visits.</small></details>
    {canEdit && instance.status !== "FINISHED" && instance.status !== "STOPPED" && <div className={styles.actions}>{instance.status === "PAUSED" ? <ConfirmDialog trigger="Resume this instance" title="Resume this instance?" description={`${active.length} unfinished Beats keep their original timing. Overdue work can become eligible for your configured sending preferences.`}><button type="button" className="button primary" disabled={busy} onClick={event => { event.currentTarget.closest("dialog")?.close(); void update({ status: "ACTIVE" }); }}>Resume</button></ConfirmDialog> : <button type="button" className="button small" disabled={busy} onClick={() => void update({ status: "PAUSED" })}>Pause this instance</button>}<ConfirmDialog trigger="Stop this instance" triggerClassName="text-button" title="Stop this instance?" description="Stop unfinished work in this journey instance. Completed actions and other instances are retained." danger><button type="button" className="button danger" disabled={busy} onClick={event => { event.currentTarget.closest("dialog")?.close(); void update({ status: "STOPPED" }); }}>Stop instance</button></ConfirmDialog></div>}
    {error && <p role="alert" className="notice error">{error}</p>}
  </article>;
}

export function ContactWorkflowProgress({ contactId }: { contactId: string }) {
  const [data, setData] = useState<WorkflowGraphView | null>(null), [error, setError] = useState("");
  const refresh = () => { fetch(`/api/mix-workflow?contactId=${encodeURIComponent(contactId)}`).then(response => { if (!response.ok) throw new Error("Journey progress is temporarily unavailable."); return response.json(); }).then(result => { setData(result); setError(""); }).catch(reason => setError(reason.message)); };
  useEffect(() => { let stopped = false; const poll = () => { if (!stopped && document.visibilityState === "visible" && !document.activeElement?.closest("form")) refresh(); }; poll(); const interval = setInterval(poll, 15000); window.addEventListener("jitm:workflow-updated", poll); return () => { stopped = true; clearInterval(interval); window.removeEventListener("jitm:workflow-updated", poll); }; }, [contactId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data?.instances.length && !error) return null;
  return <section className={styles.contactProgress}><div className={styles.instanceHeading}><h3>Connected Mixes</h3><Link href={`/journey?contactId=${contactId}`}>View journey</Link></div>{error && <p role="status">{error}</p>}{data?.instances.map(instance => <WorkflowInstanceCard key={instance.id} instance={instance} canEdit={data.canEdit} onUpdate={refresh} />)}{data && data.instanceTotal > data.instances.length && <Link href={`/journey?contactId=${contactId}`}>View all {data.instanceTotal} instances</Link>}</section>;
}
