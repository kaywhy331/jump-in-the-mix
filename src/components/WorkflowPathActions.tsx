"use client";

import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { WorkflowSaveError } from "@/lib/mix-workflow-client";
import type { WorkflowPathRemoval } from "@/lib/mix-workflow-rule-save";
import type { WorkflowRule, WorkflowTarget } from "@/lib/mix-workflow-types";
import type { WorkflowGraphView } from "@/lib/mix-workflow-view";
import styles from "@/components/WorkflowJourney.module.css";

export type WorkflowPathSelection = { id: string; rule: WorkflowRule; removal: WorkflowPathRemoval };

export function WorkflowPathActions({ selection, mixes, beatNumbers = {}, mixNumbers = {}, canEdit, gatedStepIds, onEdit, onRemove, onReview, onClose }: {
  selection: WorkflowPathSelection; mixes: WorkflowGraphView["mixes"]; beatNumbers?: Record<string, string>; mixNumbers?: Record<string, string>; canEdit: boolean; gatedStepIds: string[];
  onEdit: () => void; onRemove: () => Promise<void>; onReview: (rule: WorkflowRule) => void; onClose: () => void;
}) {
  const [removing, setRemoving] = useState(false), [error, setError] = useState("");
  const [conflict, setConflict] = useState<WorkflowRule | null>(null);
  const actions = useRef<HTMLDivElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { const button = actions.current?.querySelector<HTMLButtonElement>("button"); button?.focus({ preventScroll: true }); actions.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const { rule, removal } = selection;
  const route = removal.kind === "route" ? rule.routes.find(item => item.id === removal.routeId) : null;
  const target = removal.kind === "join" ? rule.join?.target : route?.target;
  const name = (point: WorkflowTarget) => { const mix = mixes.find(item => item.id === point.mixId); return point.stepId ? `${beatNumbers[point.stepId] ? `${beatNumbers[point.stepId]} · ` : ""}${mix?.steps.find(step => step.id === point.stepId)?.name ?? "Unavailable Beat"} · ${mix?.name ?? "Unavailable Mix"}` : `${mixNumbers[point.mixId] ? `${mixNumbers[point.mixId]} · ` : ""}${mix?.name ?? "Unavailable Mix"}`; };
  const wholeConnection = removal.kind === "rule" || removal.kind === "route" && rule.routes.length === 1;
  const label = removal.kind === "join" ? "Shared join" : route?.label ?? rule.name;
  const consequence = wholeConnection ? "Future handoffs through this connection stop. Existing Beats and history stay." : removal.kind === "join" ? "Removes the shared join for every branch. Existing work keeps its saved paths." : "Other branches stay connected. Existing work keeps its saved paths.";
  return <div ref={actions} className={styles.pathActions} role="region" aria-label="Selected path" onKeyDown={event => { if (event.key === "Escape" && !removing && !(event.target as HTMLElement).closest("dialog")) { event.preventDefault(); onClose(); } }}>
    <div className={styles.pathSummary}><strong>{label}</strong><span>{removal.kind === "join" ? "Selected branches" : name(rule.source)} → {target ? name(target) : "Finish this path"}</span></div>
    <fieldset disabled={removing} className={styles.pathButtons}>
      {canEdit && <><button type="button" className="button small" aria-label="Edit path" onClick={onEdit}><AppIcon name="edit" />Edit</button>
        <ConfirmDialog trigger={<><AppIcon name="trash" />Delete</>} triggerAriaLabel="Delete path" title={removal.kind === "join" ? "Delete this shared join?" : "Delete this path?"} description={`${label}. ${consequence}`} danger>
          {target?.stepId && gatedStepIds.includes(target.stepId) && <p className="muted-copy">The destination Beat will still wait for a connection. You can restore its scheduled start in the Mix details.</p>}
          {error && <p ref={errorRef} tabIndex={-1} className="notice error" role="alert">{error}</p>}
          {conflict ? <button className="button" type="button" onClick={event => { event.currentTarget.closest("dialog")?.close(); onReview(conflict); setConflict(null); setError(""); }}>Review updated path</button> : <button className="button danger" type="button" disabled={removing} onClick={async () => {
            setRemoving(true); setError("");
            try { await onRemove(); }
            catch (reason) { if (reason instanceof WorkflowSaveError && reason.code === "CONNECTION_CHANGED") setConflict(reason.currentRule ?? null); setError(reason instanceof Error ? reason.message : "Could not delete this path. Try again."); }
            finally { setRemoving(false); }
          }}>{removing ? "Deleting…" : "Delete path"}</button>}
        </ConfirmDialog></>}
      <button type="button" className="button small" onClick={onClose} aria-label="Deselect path"><AppIcon name="close" /></button>
    </fieldset>
  </div>;
}
