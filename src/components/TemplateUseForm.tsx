"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  const [name, setName] = useState(title);
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">("DRAFT");
  const [assignAll, setAssignAll] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(() => new Set());
  const selected = useMemo(() => groups.filter((group) => selectedGroups.has(group.id)), [groups, selectedGroups]);
  const audienceEstimate = assignAll ? activeContactCount : selected.reduce((total, group) => total + group.contactCount, 0);
  const projectedFollowUps = audienceEstimate * stepCount;
  const hasAudience = assignAll || selectedGroups.size > 0;
  const toggleGroup = (id: string) => setSelectedGroups((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <form action={useSharedMixTemplateAction} className="mix-editor-form template-setup-form" onSubmit={(event) => {
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      if (status === "ACTIVE" && submitter?.getAttribute("data-activation") !== "confirm") {
        event.preventDefault();
        setReviewOpen(true);
      }
    }}>
      <input type="hidden" name="sharedMixId" value={sharedMixId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="requestId" value={requestId} />
      <section className="card mix-editor-section">
        <div className="card-header"><div><h2>Remix it</h2><p>Make your own copy, then fine-tune the beats and tempo. Start with a draft to make every message sound like you.</p></div><span className="status-pill">{stepCount} beats · {durationDays} days</span></div>
        <div className="form-grid">
          <div className="field full"><label htmlFor="template-mix-name">Mix name</label><input id="template-mix-name" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></div>
          <div className="field"><label htmlFor="template-status">After setup</label><select id="template-status" name="status" value={status} onChange={(event) => setStatus(event.target.value as "DRAFT" | "ACTIVE")}><option value="DRAFT">Keep as a draft</option><option value="ACTIVE">Start the mix</option></select></div>
          <div className="field"><span className="field-label">Starts</span><p>{triggerMode === "DATE_TRIGGERED" ? `When ${dateTypeName || "the chosen date"} is added` : triggerMode === "BROADCAST" ? "On one fixed date" : status === "DRAFT" ? "Day 0 is when you first turn on this draft" : "Day 0 is today"}</p></div>
          {triggerMode === "BROADCAST" && <div className="field full broadcast-fields"><div className="broadcast-field-grid"><label className="field"><span>Start date</span><input name="broadcastDate" type="date" required /></label><label className="field"><span>Start time</span><input name="broadcastTime" type="time" defaultValue="10:00" required /></label><label className="field"><span>Timezone</span><TimezonePicker name="broadcastTimezone" id="templateBroadcastTimezone" label="Timezone" defaultValue={workspaceTimezone} /></label></div></div>}
          {triggerMode !== "BROADCAST" && <input type="hidden" name="broadcastTimezone" value={workspaceTimezone} />}
        </div>
      </section>

      <section className="card mix-editor-section">
        <div className="card-header"><div><h2>Who is this mix for?</h2><p>Choose everyone or one or more tags.</p></div></div>
        <label className="checkbox-card"><input type="checkbox" name="assignAllContacts" checked={assignAll} onChange={(event) => setAssignAll(event.target.checked)} /><span><strong>Everyone</strong><small>{activeContactCount.toLocaleString()} active people</small></span></label>
        {!assignAll && groups.length > 0 && <div><h3>Or choose tags</h3><div className="group-choice-grid">{groups.map((group) => <label className="checkbox-card" key={group.id}><input type="checkbox" name="groupIds" value={group.id} checked={selectedGroups.has(group.id)} onChange={() => toggleGroup(group.id)} /><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} /><span><strong>{group.name}</strong><small>{group.contactCount} {group.contactCount === 1 ? "person" : "people"}</small></span></label>)}</div></div>}
        {!hasAudience && <p className="notice info">Choose who gets this mix.</p>}
      </section>

      <section className="card ai-publish-review">
        <h2>Quick check</h2>
        <div className="import-summary-grid"><div><strong>{audienceEstimate.toLocaleString()}</strong><span>people</span></div><div><strong>{stepCount}</strong><span>beats each</span></div><div><strong>{projectedFollowUps.toLocaleString()}</strong><span>scheduled follow-ups</span></div><div><strong>{durationDays}</strong><span>days</span></div></div>
        <p>Create a draft to review the messages first. Active mixes follow your automatic-sending settings, if enabled.</p>
        <div className="sticky-form-actions"><Link className="button" href="/templates">Back to ready-made mixes</Link><button className="button primary" type="submit" disabled={!hasAudience}>{status === "ACTIVE" ? "Review and start" : "Create my remix"}</button></div>
      </section>
      <ReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} title={`Start ${name || "this mix"}?`} description="Check your audience and sending preferences before starting.">
        <p>{assignAll ? "Everyone" : selected.map(group => group.name).join(", ")} will receive this mix: {stepCount} prepared follow-ups over {durationDays} days.</p>
        <p>{triggerMode === "DATE_TRIGGERED" ? `Follow-ups are scheduled around each person’s ${dateTypeName || "chosen date"}.` : triggerMode === "BROADCAST" ? "The mix starts on the date and time you selected." : "Day 0 is today. The first follow-ups may appear in Today immediately."}</p>
        <p className="notice info">If automatic sending is enabled, eligible messages can send after your review window. Calls and voicemails stay manual.</p>
        <div className="form-actions"><button className="button" type="button" onClick={() => setReviewOpen(false)}>Keep editing</button><button className="button primary" type="submit" data-activation="confirm">Start the mix</button></div>
      </ReviewDialog>
    </form>
  );
}
