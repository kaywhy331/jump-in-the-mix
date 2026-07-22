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
  workspaceTimezone,
  activationAvailable
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
  activationAvailable: boolean;
}) {
  const [name, setName] = useState(title);
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">("DRAFT");
  const [assignAll, setAssignAll] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(() => new Set());
  const selected = useMemo(() => groups.filter((group) => selectedGroups.has(group.id)), [groups, selectedGroups]);
  const audienceEstimate = assignAll ? activeContactCount : selected.reduce((total, group) => total + group.contactCount, 0);
  const projectedJumps = audienceEstimate * stepCount;
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
        <div className="card-header"><div><h2>Use this template</h2><p>{description}</p></div><span className="status-pill">{stepCount} actions · {durationDays} days</span></div>
        <div className="form-grid">
          <div className="field full"><label htmlFor="template-mix-name">Plan name</label><input id="template-mix-name" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required autoFocus /></div>
          <div className="field"><label htmlFor="template-status">After setup</label><select id="template-status" name="status" value={status} onChange={(event) => setStatus(event.target.value as "DRAFT" | "ACTIVE")}><option value="DRAFT">Save as Mix Draft</option><option value="ACTIVE" disabled={!activationAvailable}>Activate after review</option></select></div>
          <div className="field"><span className="field-label">Trigger</span><p>{triggerMode === "DATE_TRIGGERED" ? `Important Date · ${dateTypeName || "Template date"}` : triggerMode === "BROADCAST" ? "One fixed broadcast date" : "Starts when assigned"}</p></div>
          {triggerMode === "BROADCAST" && <div className="field full broadcast-fields"><div className="broadcast-field-grid"><label className="field"><span>Broadcast date</span><input name="broadcastDate" type="date" required /></label><label className="field"><span>Broadcast time</span><input name="broadcastTime" type="time" defaultValue="10:00" required /></label><label className="field"><span>Timezone</span><TimezonePicker name="broadcastTimezone" id="templateBroadcastTimezone" label="Broadcast timezone" defaultValue={workspaceTimezone} /></label></div></div>}
          {triggerMode !== "BROADCAST" && <input type="hidden" name="broadcastTimezone" value={workspaceTimezone} />}
        </div>
      </section>

      <section className="card mix-editor-section">
        <div className="card-header"><div><h2>Choose the audience</h2><p>No audience is selected automatically. Make the scope explicit before creating the Mix.</p></div></div>
        <label className="checkbox-card"><input type="checkbox" name="assignAllContacts" checked={assignAll} onChange={(event) => setAssignAll(event.target.checked)} /><span><strong>All active Contacts</strong><small>{activeContactCount.toLocaleString()} currently active</small></span></label>
        {!assignAll && groups.length > 0 && <div><h3>Or choose Contact Groups</h3><div className="group-choice-grid">{groups.map((group) => <label className="checkbox-card" key={group.id}><input type="checkbox" name="groupIds" value={group.id} checked={selectedGroups.has(group.id)} onChange={() => toggleGroup(group.id)} /><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} /><span><strong>{group.name}</strong><small>{group.contactCount} Contact{group.contactCount === 1 ? "" : "s"}</small></span></label>)}</div></div>}
        {!hasAudience && <p className="notice info">Choose All active Contacts or at least one Contact Group.</p>}
      </section>

      <section className="card ai-publish-review">
        <h2>Setup review</h2>
        <div className="import-summary-grid"><div><strong>{audienceEstimate.toLocaleString()}</strong><span>estimated Contacts</span></div><div><strong>{stepCount}</strong><span>actions each</span></div><div><strong>{projectedJumps.toLocaleString()}</strong><span>projected Jumps</span></div><div><strong>{durationDays}</strong><span>day span</span></div></div>
        {status === "ACTIVE" && !activationAvailable && <p className="notice error">Your active Mix allowance is full. Save as a Draft or pause another Mix first.</p>}
        <p>The generated actions remain user-confirmed native email, text, phone, voicemail-script, or WhatsApp tasks. Nothing sends silently.</p>
        <div className="sticky-form-actions"><Link className="button" href="/templates">Back to templates</Link><button className="button primary" type="submit" disabled={!hasAudience || (status === "ACTIVE" && !activationAvailable)}>{status === "ACTIVE" ? `Activate ${name || "Mix"}` : "Create Mix Draft"}</button></div>
      </section>
    </form>
  );
}
