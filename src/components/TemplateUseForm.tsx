"use client";

import { useAudiencePreview } from "@/components/useAudiencePreview";
import { FormGuard } from "@/components/FormGuard";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { TimezonePicker } from "@/components/TimezonePicker";
import { ReviewDialog } from "@/components/ReviewDialog";
import { useSharedMixTemplateAction } from "@/lib/shared-mix-use-actions";

type GroupOption = { id: string; name: string; color: string | null; contactCount: number };
type TriggerMode = "DATE_TRIGGERED" | "MANUAL_START" | "BROADCAST";

export function TemplateUseForm({
  sharedMixId,
  expectedVersion,
  requestId,
  title,
  description,
  triggerMode,
  dateTypeName,
  stepCount,
  durationDays,
  groups,
  activeContactCount,
  workspaceTimezone
}: {
  sharedMixId: string;
  expectedVersion: number;
  requestId: string;
  title: string;
  description: string;
  triggerMode: TriggerMode;
  dateTypeName: string | null;
  stepCount: number;
  durationDays: number;
  groups: GroupOption[];
  activeContactCount: number;
  workspaceTimezone: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [setupStep, setSetupStep] = useState(0);
  const focusSetup = useRef(false);
  const move = (next: number) => {
    if (next > setupStep) {
      const fields = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-setup-step="${setupStep}"] input, [data-setup-step="${setupStep}"] select`);
      for (const field of fields ?? []) if (!field.reportValidity()) return;
    }
    focusSetup.current = true; setSetupStep(next);
  };
  useEffect(() => { if (focusSetup.current) formRef.current?.querySelector<HTMLElement>(`[data-setup-step="${setupStep}"] h2`)?.focus(); }, [setupStep]);
  const [name, setName] = useState(title);
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">("DRAFT");
  const [assignAll, setAssignAll] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(() => new Set());
  const selected = useMemo(() => groups.filter((group) => selectedGroups.has(group.id)), [groups, selectedGroups]);
  const audience = useAudiencePreview(assignAll, [...selectedGroups]);
  const audienceEstimate = audience.data?.total;
  const projectedFollowUps = audienceEstimate === undefined ? undefined : audienceEstimate * stepCount;
  const hasAudience = assignAll || selectedGroups.size > 0;
  const toggleGroup = (id: string) => setSelectedGroups((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <form ref={formRef} action={useSharedMixTemplateAction} className="mix-editor-form template-setup-form" onSubmit={(event) => {
      if (setupStep < 2) { event.preventDefault(); move(setupStep + 1); return; }
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      if (status === "ACTIVE" && submitter?.getAttribute("data-activation") !== "confirm") {
        event.preventDefault();
        setReviewOpen(true);
      }
    }}>
      <FormGuard />
      <p className="workflow-step-label">Step {setupStep + 1} of 3 · {setupStep === 0 ? "Name" : setupStep === 1 ? "People" : "Review"}</p>
      <input type="hidden" name="sharedMixId" value={sharedMixId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="requestId" value={requestId} />
      <section className="card mix-editor-section" data-setup-step="0" hidden={setupStep !== 0}>
        <div className="card-header"><div><h2 tabIndex={-1}>Name your plan</h2><p>Save a draft first, or choose to start after reviewing it.</p></div><span className="status-pill">{stepCount} {stepCount === 1 ? "beat" : "beats"} · {durationDays === 0 ? "On the cue day" : `${durationDays} ${durationDays === 1 ? "day" : "days"}`}</span></div>
        <div className="form-grid">
          <div className="field full"><label htmlFor="template-mix-name">Mix name</label><input id="template-mix-name" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></div>
          <div className="field"><label htmlFor="template-status">After setup</label><select id="template-status" name="status" value={status} onChange={(event) => setStatus(event.target.value as "DRAFT" | "ACTIVE")}><option value="DRAFT">Keep as a draft</option><option value="ACTIVE">Start the mix</option></select></div>
          <div className="field"><span className="field-label">Starts</span><p>{triggerMode === "DATE_TRIGGERED" ? `When ${dateTypeName || "the chosen date"} is added` : triggerMode === "BROADCAST" ? "On one fixed date" : status === "DRAFT" ? "Day 0 is when you first turn on this draft" : "Day 0 is today"}</p></div>
          {triggerMode === "BROADCAST" && <div className="field full broadcast-fields"><div className="broadcast-field-grid"><label className="field"><span>Start date</span><input name="broadcastDate" type="date" required /></label><label className="field"><span>Start time</span><input name="broadcastTime" type="time" defaultValue="10:00" required /></label><label className="field"><span>Timezone</span><TimezonePicker name="broadcastTimezone" id="templateBroadcastTimezone" label="Timezone" defaultValue={workspaceTimezone} /></label></div></div>}
          {triggerMode !== "BROADCAST" && <input type="hidden" name="broadcastTimezone" value={workspaceTimezone} />}
        </div>
      </section>

      <section className="card mix-editor-section" data-setup-step="1" hidden={setupStep !== 1}>
        <div className="card-header"><div><h2 tabIndex={-1}>Choose people</h2><p>Choose everyone or one or more tags.</p></div></div>
        <label className="checkbox-card"><input type="checkbox" name="assignAllContacts" checked={assignAll} onChange={(event) => setAssignAll(event.target.checked)} /><span><strong>Everyone</strong><small>{activeContactCount.toLocaleString()} active people</small></span></label>
        {!assignAll && groups.length > 0 && <div><h3>Or choose tags</h3><div className="group-choice-grid">{groups.map((group) => <label className="checkbox-card" key={group.id}><input type="checkbox" name="groupIds" value={group.id} checked={selectedGroups.has(group.id)} onChange={() => toggleGroup(group.id)} /><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} /><span><strong>{group.name}</strong><small>{group.contactCount} {group.contactCount === 1 ? "person" : "people"}</small></span></label>)}</div></div>}
        {!hasAudience && <p className="notice info">You can choose people later when you keep this as a draft.</p>}
      </section>

      <section className="card ai-publish-review" data-setup-step="2" hidden={setupStep !== 2}>
        <h2 tabIndex={-1}>Review your plan</h2>
        <p><strong>{name}</strong> · {status === "DRAFT" ? "Save as a draft" : "Start after confirmation"}</p>
        {audience.error && <p className="notice error" role="alert">{audience.error} <button type="button" onClick={audience.retry}>Retry audience check</button></p>}
        <div className="import-summary-grid"><div><strong>{audienceEstimate?.toLocaleString() ?? "Checking…"}</strong><span>people</span></div><div><strong>{stepCount}</strong><span>beats each</span></div><div><strong>{projectedFollowUps?.toLocaleString() ?? "Checking…"}</strong><span>potential follow-ups</span></div><div><strong>{durationDays}</strong><span>days</span></div></div>
        <p>People in multiple tags count once. These are potential follow-ups: saved dates, pauses, contact details and scheduling rules determine what is prepared. A draft schedules nothing until you start it.</p>
        <div className="sticky-form-actions"><button className="button" type="button" onClick={() => move(1)}>Back</button><button className="button primary" type="submit" disabled={status === "ACTIVE" && (!hasAudience || !audience.data)}>{status === "ACTIVE" ? "Review and start" : "Save draft"}</button></div>
      </section>
      {setupStep < 2 && <div className="guided-setup-actions">{setupStep > 0 ? <button className="button" type="button" onClick={() => move(setupStep - 1)}>Back</button> : <Link className="button" href="/templates">Cancel</Link>}<button className="button primary" type="button" onClick={() => move(setupStep + 1)}>Continue</button></div>}
      <ReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} title={`Start ${name || "this mix"}?`} description="Check your audience and sending preferences before starting.">
        <p>{assignAll ? "Everyone" : selected.map(group => group.name).join(", ")} will receive this mix: {stepCount} prepared {stepCount === 1 ? "follow-up" : "follow-ups"} {durationDays === 0 ? "on the cue day" : `over ${durationDays} ${durationDays === 1 ? "day" : "days"}`}.</p>
        <p>{triggerMode === "DATE_TRIGGERED" ? `Follow-ups are scheduled around each person’s ${dateTypeName || "chosen date"}.` : triggerMode === "BROADCAST" ? "The mix starts on the date and time you selected." : "Day 0 is today. The first follow-ups may appear in Today immediately."}</p>
        <p className="notice info">If automatic sending is enabled, eligible messages can send after your review window. Calls and voicemails stay manual.</p>
        <div className="form-actions"><button className="button" type="button" onClick={() => setReviewOpen(false)}>Keep editing</button><button className="button primary" type="submit" data-activation="confirm">Start the mix</button></div>
      </ReviewDialog>
    </form>
  );
}
