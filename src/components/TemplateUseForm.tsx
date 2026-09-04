"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TimezonePicker } from "@/components/TimezonePicker";
import { useSharedMixTemplateAction } from "@/lib/shared-mix-use-actions";

type GroupOption = { id: string; name: string; color: string | null; contactCount: number };
type TriggerMode = "DATE_TRIGGERED" | "MANUAL_START" | "BROADCAST";

export function TemplateUseForm({
  sharedMixId,
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
    <form action={useSharedMixTemplateAction} className="mix-editor-form">
      <input type="hidden" name="sharedMixId" value={sharedMixId} />
      <input type="hidden" name="requestId" value={requestId} />
      <section className="card mix-editor-section">
        <div className="card-header"><div><h2>Use this plan</h2><p>{description}</p></div><span className="status-pill">{stepCount} follow-ups · {durationDays} days</span></div>
        <div className="form-grid">
          <div className="field full"><label htmlFor="template-mix-name">Plan name</label><input id="template-mix-name" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required autoFocus /></div>
          <div className="field"><label htmlFor="template-status">After setup</label><select id="template-status" name="status" value={status} onChange={(event) => setStatus(event.target.value as "DRAFT" | "ACTIVE")}><option value="DRAFT">Keep as a draft</option><option value="ACTIVE">Turn this plan on</option></select></div>
          <div className="field"><span className="field-label">Starts</span><p>{triggerMode === "DATE_TRIGGERED" ? `When ${dateTypeName || "the chosen date"} is added` : triggerMode === "BROADCAST" ? "On one fixed date" : "When you choose a person"}</p></div>
          {triggerMode === "BROADCAST" && <div className="field full broadcast-fields"><div className="broadcast-field-grid"><label className="field"><span>Broadcast date</span><input name="broadcastDate" type="date" required /></label><label className="field"><span>Broadcast time</span><input name="broadcastTime" type="time" defaultValue="10:00" required /></label><label className="field"><span>Timezone</span><TimezonePicker name="broadcastTimezone" id="templateBroadcastTimezone" label="Broadcast timezone" defaultValue={workspaceTimezone} /></label></div></div>}
          {triggerMode !== "BROADCAST" && <input type="hidden" name="broadcastTimezone" value={workspaceTimezone} />}
        </div>
      </section>

      <section className="card mix-editor-section">
        <div className="card-header"><div><h2>Who gets this plan?</h2><p>Choose everyone or one or more tags.</p></div></div>
        <label className="checkbox-card"><input type="checkbox" name="assignAllContacts" checked={assignAll} onChange={(event) => setAssignAll(event.target.checked)} /><span><strong>Everyone</strong><small>{activeContactCount.toLocaleString()} active people</small></span></label>
        {!assignAll && groups.length > 0 && <div><h3>Or choose tags</h3><div className="group-choice-grid">{groups.map((group) => <label className="checkbox-card" key={group.id}><input type="checkbox" name="groupIds" value={group.id} checked={selectedGroups.has(group.id)} onChange={() => toggleGroup(group.id)} /><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} /><span><strong>{group.name}</strong><small>{group.contactCount} {group.contactCount === 1 ? "person" : "people"}</small></span></label>)}</div></div>}
        {!hasAudience && <p className="notice info">Choose who gets this plan.</p>}
      </section>

      <section className="card ai-publish-review">
        <h2>Quick check</h2>
        <div className="import-summary-grid"><div><strong>{audienceEstimate.toLocaleString()}</strong><span>people</span></div><div><strong>{stepCount}</strong><span>follow-ups each</span></div><div><strong>{projectedFollowUps.toLocaleString()}</strong><span>scheduled follow-ups</span></div><div><strong>{durationDays}</strong><span>days</span></div></div>
        <p>You review every message before anything is sent.</p>
        <div className="sticky-form-actions"><Link className="button" href="/templates">Back to ready-made plans</Link><button className="button primary" type="submit" disabled={!hasAudience}>{status === "ACTIVE" ? `Turn on ${name || "plan"}` : "Create plan"}</button></div>
      </section>
    </form>
  );
}
