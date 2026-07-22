"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { saveMixAction } from "@/lib/mix-editor-actions";

type TriggerMode = "DATE_TRIGGERED" | "MANUAL_START" | "BROADCAST";
type MixStatus = "DRAFT" | "ACTIVE" | "PAUSED";
type JumpOption = { id: string; name: string; channel: string };
type DateTypeOption = { id: string; name: string; isSystem: boolean };
type GroupOption = { id: string; name: string; color: string | null; isActive: boolean };
type SequenceItem = { key: string; id?: string; stepTemplateId: string; dayOffset: number; sendTimeMinutes: number | null };

type MixValue = {
  id?: string;
  name?: string;
  description?: string | null;
  framework?: string | null;
  category?: string | null;
  industry?: string | null;
  triggerMode?: TriggerMode;
  dateTypeId?: string | null;
  status?: MixStatus;
  groupIds?: string[];
  assignAllContacts?: boolean;
  broadcastDate?: string | null;
  broadcastTime?: string | null;
  broadcastTimezone?: string | null;
  steps?: { id: string; stepTemplateId: string; dayOffset: number; sendTimeMinutes: number | null }[];
};

const TIMEZONES = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Phoenix", "Arizona"],
  ["Pacific/Honolulu", "Hawaii"],
  ["UTC", "UTC"]
] as const;
const MAX_STEP_OFFSET_DAYS = 365;

function timeValue(minutes: number | null): string {
  if (minutes === null) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function minutesValue(value: string): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function MixEditor({
  mix,
  jumps,
  dateTypes,
  groups,
  categories,
  industries,
  workspaceTimezone
}: {
  mix?: MixValue;
  jumps: JumpOption[];
  dateTypes: DateTypeOption[];
  groups: GroupOption[];
  categories: string[];
  industries: string[];
  workspaceTimezone: string;
}) {
  const defaultDateType = mix?.dateTypeId ?? dateTypes[0]?.id ?? "";
  const [triggerMode, setTriggerMode] = useState<TriggerMode>(mix?.triggerMode ?? "DATE_TRIGGERED");
  const [sequence, setSequence] = useState<SequenceItem[]>(() => {
    const existing = mix?.steps?.map((step) => ({ ...step, key: step.id })) ?? [];
    return existing.length ? existing : [{ key: "new-0", stepTemplateId: jumps[0]?.id ?? "", dayOffset: 0, sendTimeMinutes: null }];
  });
  const jumpById = useMemo(() => new Map(jumps.map((jump) => [jump.id, jump])), [jumps]);
  const selectedGroupIds = useMemo(() => new Set(mix?.groupIds ?? []), [mix?.groupIds]);

  const addSequenceItem = () => setSequence((current) => [...current, { key: `new-${Date.now()}-${current.length}`, stepTemplateId: jumps[0]?.id ?? "", dayOffset: Math.min(current.length ? current[current.length - 1].dayOffset + 1 : 0, MAX_STEP_OFFSET_DAYS), sendTimeMinutes: null }]);
  const removeSequenceItem = (index: number) => setSequence((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const moveSequenceItem = (index: number, direction: -1 | 1) => setSequence((current) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) return current;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  });

  return (
    <form action={saveMixAction} className="mix-editor-form">
      {mix?.id && <input type="hidden" name="mixId" value={mix.id} />}
      <section className="card mix-editor-section">
        <div className="card-header"><div><h2>Mix details</h2><p>Name the strategy and choose its lifecycle state.</p></div></div>
        <div className="form-grid">
          <div className="field full"><label htmlFor="mix-name">Mix name</label><input id="mix-name" name="name" maxLength={160} defaultValue={mix?.name ?? ""} placeholder="Client renewal follow-up" required autoFocus /></div>
          <div className="field full"><label htmlFor="mix-description">Description</label><textarea id="mix-description" name="description" maxLength={1200} defaultValue={mix?.description ?? ""} placeholder="What this Mix is designed to accomplish." /></div>
          <div className="field"><label htmlFor="mix-status">Status</label><select id="mix-status" name="status" defaultValue={mix?.status ?? "DRAFT"}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option></select></div>
          <div className="field"><label htmlFor="mix-framework">Strategy / framework</label><input id="mix-framework" name="framework" maxLength={160} defaultValue={mix?.framework ?? ""} placeholder="Question-led consultative" /></div>
          <div className="field"><label htmlFor="mix-category">Category</label><select id="mix-category" name="category" defaultValue={mix?.category ?? ""}><option value="">Not classified</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></div>
          <div className="field"><label htmlFor="mix-industry">Industry</label><select id="mix-industry" name="industry" defaultValue={mix?.industry ?? ""}><option value="">Not classified</option>{industries.map((industry) => <option key={industry}>{industry}</option>)}</select></div>
        </div>
      </section>

      <section className="card mix-editor-section">
        <div className="card-header"><div><h2>Trigger and audience</h2><p>Choose what starts the Mix and deliberately select which Contacts should be eligible.</p></div></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="mix-trigger">How should this plan start?</label><select id="mix-trigger" name="triggerMode" value={triggerMode} onChange={(event) => setTriggerMode(event.target.value as TriggerMode)}><option value="DATE_TRIGGERED">From an Important Date</option><option value="MANUAL_START">Start manually</option><option value="BROADCAST">On one fixed date</option></select></div>
          {triggerMode === "DATE_TRIGGERED" && <div className="field"><label htmlFor="mix-date-type">Important Date Type</label><select id="mix-date-type" name="dateTypeId" defaultValue={defaultDateType} required>{dateTypes.map((dateType) => <option key={dateType.id} value={dateType.id}>{dateType.isSystem ? `System · ${dateType.name}` : dateType.name}</option>)}</select><div className="mix-date-type-tools"><Link href="/settings/jump-date-types">Add or manage types</Link></div></div>}
          {triggerMode === "MANUAL_START" && <div className="field full"><p className="inline-help">Each Contact or Group starts when it is first assigned. Editing the Mix does not restart existing assignments.</p></div>}
          {triggerMode === "BROADCAST" && <div className="field full broadcast-fields">
            <div className="broadcast-field-grid">
              <label className="field"><span>Broadcast date</span><input name="broadcastDate" type="date" defaultValue={mix?.broadcastDate ?? ""} required /></label>
              <label className="field"><span>Broadcast time</span><input name="broadcastTime" type="time" defaultValue={mix?.broadcastTime ?? "10:00"} required /></label>
              <label className="field"><span>Timezone</span><select name="broadcastTimezone" defaultValue={mix?.broadcastTimezone ?? workspaceTimezone}>{TIMEZONES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            </div>
            <p className="inline-help">The date and time are the fixed trigger for Jump #1. Day offsets schedule later or earlier Jumps. The app prepares user-confirmed actions; it does not send automatically.</p>
          </div>}
        </div>
        <div className="audience-options">
          <label className="checkbox-card"><input type="checkbox" name="assignAllContacts" defaultChecked={mix?.assignAllContacts ?? false} /><span><strong>All active Contacts</strong><small>{triggerMode === "BROADCAST" ? "Use a snapshot of everyone active when the Mix is saved." : "Include everyone currently active."}</small></span></label>
          {groups.length > 0 && <div><h3>Contact Groups</h3><div className="group-choice-grid">{groups.map((group) => {
            const selected = selectedGroupIds.has(group.id);
            return (
              <div key={group.id}>
                {!group.isActive && selected && <input type="hidden" name="groupIds" value={group.id} />}
                <label className={`checkbox-card ${group.isActive ? "" : "inactive"}`}>
                  <input
                    type="checkbox"
                    name={group.isActive ? "groupIds" : undefined}
                    value={group.id}
                    defaultChecked={selected}
                    disabled={!group.isActive}
                  />
                  <span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />
                  <span><strong>{group.name}</strong>{!group.isActive && <small>{selected ? "Inactive · audience preserved" : "Inactive under current plan"}</small>}</span>
                </label>
              </div>
            );
          })}</div></div>}
          <small className="muted-copy">An active Mix must explicitly choose All active Contacts or at least one active Contact Group. Direct Contact assignments are preserved separately.</small>
        </div>
      </section>

      <section className="card mix-editor-section">
        <div className="card-header"><div><p className="eyebrow">Step 2</p><h2>Action sequence</h2><p>Arrange reusable actions and set their timing relative to the start.</p></div><div className="page-actions"><Link className="button" href="/settings/jumps">Action Templates</Link><button className="button primary" type="button" onClick={addSequenceItem} disabled={!jumps.length}>+ Add action</button></div></div>
        {!jumps.length ? <div className="notice info">Create an Action Template before building a Mix. <Link href="/settings/jumps"><strong>Open Action Templates</strong></Link></div> : <div className="mix-editor-sequence">{sequence.map((item, index) => {
          const selected = jumpById.get(item.stepTemplateId);
          return (
            <fieldset className="mix-editor-jump" key={item.key}>
              <legend>Jump #{index + 1}</legend>
              <input type="hidden" name="mixStepId" value={item.id ?? ""} />
              <div className="form-grid">
                <div className="field full"><label>Action Template</label><select name="stepTemplateId" value={item.stepTemplateId} onChange={(event) => setSequence((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, stepTemplateId: event.target.value } : row))} required>{jumps.map((jump) => <option value={jump.id} key={jump.id}>{jump.channel.replaceAll("_", " ")} · {jump.name}</option>)}</select>{selected && <small>{selected.channel.replaceAll("_", " ").toLowerCase()}</small>}</div>
                <div className="field"><label>Day offset</label><input name="dayOffset" type="number" min={-MAX_STEP_OFFSET_DAYS} max={MAX_STEP_OFFSET_DAYS} value={item.dayOffset} onChange={(event) => setSequence((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, dayOffset: Number(event.target.value) } : row))} required /><small>Negative is before; positive is after. Maximum ±{MAX_STEP_OFFSET_DAYS} days.</small></div>
                <div className="field"><label>Optional local time override</label><input type="time" value={timeValue(item.sendTimeMinutes)} onChange={(event) => setSequence((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, sendTimeMinutes: minutesValue(event.target.value) } : row))} /><input type="hidden" name="sendTimeMinutes" value={item.sendTimeMinutes ?? ""} /><small>Leave blank to use the Important Date or broadcast time.</small></div>
              </div>
              <div className="sequence-controls"><button className="button small" type="button" onClick={() => moveSequenceItem(index, -1)} disabled={index === 0}>Move up</button><button className="button small" type="button" onClick={() => moveSequenceItem(index, 1)} disabled={index === sequence.length - 1}>Move down</button><button className="button small danger" type="button" onClick={() => removeSequenceItem(index)} disabled={sequence.length === 1}>Remove</button></div>
            </fieldset>
          );
        })}</div>}
      </section>

      <div className="sticky-form-actions"><Link className="button" href="/mixes">Cancel</Link><button className="button primary" type="submit" disabled={!jumps.length || !sequence.length}>{mix?.id ? "Update Mix" : "Create Mix"}</button></div>
    </form>
  );
}
