"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";
import { ClosesOnSubmit } from "@/components/ClosesOnSubmit";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Sheet } from "@/components/Sheet";
import { WorkflowInstanceCard } from "@/components/WorkflowProgress";
import type { ContactMixRowStatus } from "@/lib/contact-mix-row-labels";
import { removeMixAssignmentAction } from "@/lib/contact-mix-actions";
import type { DisplayFormatPreferences } from "@/lib/format";
import { resumeMixForContactAction, stopMixForContactAction } from "@/lib/mix-stop-actions";
import type { WorkflowGraphView, WorkflowInstanceView } from "@/lib/mix-workflow-view";

export type ContactMixesRow = {
  mixId: string; name: string; status: ContactMixRowStatus; route: string | null;
  /** The sheet's one-line summary of where the Mix stands for the person. */
  summary: string;
  /** `everyoneStart`: their own start is their place in a Mix for Everyone, so Remove stops the Mix for them (D64). */
  assignmentId: string | null; everyoneStart: boolean; hasTags: boolean; stopped: boolean; workIds: string[];
};

/** What a row of Journey work still needs from the owner, so it shows without opening the menu. */
function attention(instances: WorkflowInstanceView[]): string | null {
  if (instances.some(instance => instance.preparationFailed)) return "Follow-up preparation needs another try";
  // Only a decision still waiting, in work that isn't paused, can take an outcome now.
  if (instances.some(instance => instance.status !== "PAUSED" && instance.decisions.some(decision => decision.status === "WAITING" && !decision.outcome))) return "Waiting for you to record an outcome";
  if (instances.some(instance => instance.beats.some(beat => beat.status === "HELD" && instance.state.visits.find(visit => visit.id === beat.visitId)?.reason?.includes("appointment")))) return "Waiting for you to link an appointment";
  return instances.find(instance => instance.state.issue)?.state.issue ?? null;
}

/**
 * The profile's one Mixes section (D77, JITM-09 §2.32): a row per Mix with its status, and a menu per row that
 * holds everything done to that Mix for this person. Review stays on the Next card. Journey work for the person
 * is read from the Journey's own API, once, and only when a row has some.
 */
export function ContactMixes({ contactId, contactName, rows, displayPreferences, viewOnly, addControl }: {
  contactId: string; contactName: string; rows: ContactMixesRow[]; displayPreferences: DisplayFormatPreferences; viewOnly: boolean; addControl: ReactNode;
}) {
  const router = useRouter();
  const hasWork = rows.some(row => row.workIds.length > 0);
  const [work, setWork] = useState<WorkflowGraphView | null>(null), [workError, setWorkError] = useState("");
  const refresh = useCallback(() => {
    fetch(`/api/mix-workflow?contactId=${encodeURIComponent(contactId)}`)
      .then(response => { if (!response.ok) throw new Error("Journey work is unavailable right now. Try again in a moment."); return response.json(); })
      .then((result: WorkflowGraphView) => { setWork(result); setWorkError(""); })
      .catch((reason: Error) => setWorkError(reason.message));
  }, [contactId]);
  useEffect(() => {
    if (!hasWork) return;
    refresh();
    window.addEventListener("jitm:workflow-updated", refresh);
    return () => window.removeEventListener("jitm:workflow-updated", refresh);
  }, [hasWork, refresh]);
  // A saved change re-reads the work through `jitm:workflow-updated` (src/lib/mix-workflow-client.ts). It can also
  // change the rows themselves (paused, the next Beat), which the server reads.
  const updated = () => router.refresh();
  const returnTo = `/contacts/${contactId}`;
  return <section className="contact-mixes" aria-labelledby="contact-mixes-heading">
    <div className="contact-section-heading"><h2 id="contact-mixes-heading">Mixes</h2></div>
    {rows.length ? <ul className="contact-mix-list">{rows.map(row => {
      const instances = work?.instances.filter(instance => row.workIds.includes(instance.id)) ?? [];
      const needs = attention(instances);
      return <li className="contact-mix-row" key={row.mixId} data-mix-row={row.mixId}>
        <div className="contact-mix-row-text">
          <strong>{row.name}</strong>
          <span className={`contact-mix-row-status${row.status.tone === "late" ? " overdue-text" : ""}`} data-tone={row.status.tone}>{row.status.label}</span>
          {row.route && <small>{row.route}</small>}
          {needs && <span className="contact-mix-row-attention">{needs}</span>}
        </div>
        <Sheet trigger={<button type="button" className="icon-button contact-mix-row-menu" aria-label={`Options for ${row.name}: ${row.status.label}`}><AppIcon name="more" /></button>} title={row.name} description={row.summary}>
          <ClosesOnSubmit><div className="contact-tools-links contact-menu-list">
            <Link href={`/mixes/${row.mixId}/edit`}><AppIcon name="mixes" />Open the Mix</Link>
            {row.workIds.length > 0 && <Link href={`/journey?${new URLSearchParams({ contactId, work: row.workIds[0] })}`}><AppIcon name="journey" />Open in Journey</Link>}
            {row.stopped
              ? <form action={resumeMixForContactAction} data-closes-menu><input type="hidden" name="mixId" value={row.mixId} /><input type="hidden" name="contactId" value={contactId} /><input type="hidden" name="returnTo" value={returnTo} /><FormSubmitButton label={`Resume for ${contactName}`} pendingLabel="Resuming…" className="" icon={<AppIcon name="play" />} disabled={viewOnly} /></form>
              : <ConfirmDialog trigger={<><AppIcon name="pause" />Stop for {contactName}…</>} triggerClassName="" title={`Stop ${row.name} for ${contactName}?`} description={`Their follow-ups still to come from ${row.name} are removed, and the Mix won’t prepare more for them, through a tag or a new start, until you resume it here. Completed history stays.`}><form action={stopMixForContactAction} data-closes-menu><input type="hidden" name="mixId" value={row.mixId} /><input type="hidden" name="contactId" value={contactId} /><input type="hidden" name="returnTo" value={returnTo} /><FormSubmitButton label="Stop the Mix" pendingLabel="Stopping…" className="button danger" disabled={viewOnly} /></form></ConfirmDialog>}
            {row.assignmentId && <ConfirmDialog trigger={<><AppIcon name="close" />Remove from this Mix…</>} triggerClassName="is-danger" title={`Remove ${contactName} from ${row.name}?`} description={row.everyoneStart ? `This Mix is for Everyone, so removing stops it for ${contactName}: its follow-ups still to come are removed, and saving or starting the Mix again won’t add them back, but you can resume it here. Completed history stays.` : `This ends your start of ${row.name} for them: its follow-ups still to come are removed, and you can start the Mix for them again later.${row.hasTags ? " A tag of theirs also runs this Mix, so its follow-ups from the tag continue." : ""} Completed history stays.`} danger><form action={removeMixAssignmentAction} data-closes-menu><input type="hidden" name="assignmentId" value={row.assignmentId} /><input type="hidden" name="contactId" value={contactId} /><FormSubmitButton label="Remove" pendingLabel="Removing…" className="button danger" disabled={viewOnly} /></form></ConfirmDialog>}
          </div></ClosesOnSubmit>
          {row.workIds.length > 0 && <div className="contact-mix-work">
            <h3>Journey work</h3>
            {workError && <p role="status" className="notice error">{workError} <button type="button" className="text-button" onClick={refresh}>Try again</button></p>}
            {!work && !workError && <p role="status" className="muted-copy">Loading…</p>}
            {instances.map(instance => <WorkflowInstanceCard key={instance.id} instance={instance} displayPreferences={displayPreferences} canEdit={Boolean(work?.canEdit) && !viewOnly} onUpdate={updated} inProfile />)}
          </div>}
        </Sheet>
      </li>;
    })}</ul> : <p className="contact-empty-copy">Not in a Mix yet.</p>}
    {addControl}
  </section>;
}
