"use client";

import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { SchedulePreview } from "@/components/SchedulePreview";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { useAudiencePreview } from "@/components/useAudiencePreview";
import { FormGuard } from "@/components/FormGuard";
import styles from "@/components/MixEditor.module.css";
import { TimezonePicker } from "@/components/TimezonePicker";
import { planGoalLabel } from "@/lib/business-taxonomy";
import { ReviewDialog } from "@/components/ReviewDialog";
import { saveMixAction } from "@/lib/mix-editor-actions";
import { STEP_ANCHORS, STEP_ANCHOR_LABELS, MAX_STEP_OFFSET_MINUTES, describeStepReadiness, describeStepTiming } from "@/lib/step-timing";
import type { StepAnchor } from "@/generated/prisma/client";
import type { PreparationFamily } from "@/lib/preparation-family";

type TriggerMode = "DATE_TRIGGERED" | "MANUAL_START" | "BROADCAST" | "AFTER_MIX";
type MixStatus = "DRAFT" | "ACTIVE" | "PAUSED";
type Channel = "SMS" | "EMAIL" | "PHONE_CALL" | "VOICEMAIL" | "WHATSAPP";
type DateTypeOption = { id: string; name: string; isSystem: boolean };
type GroupOption = { id: string; name: string; color: string | null; isActive: boolean; contactCount: number };
// Wording for the other channel families of a beat (Slice 3); blank means not offered.
type Variants = { textBody: string; emailSubject: string; emailBody: string; callScript: string };
// An elapsed beat is edited as a positive number of minutes plus before/after; the stored offset keeps its sign.
type SequenceItem = { key: string; id?: string; name: string; channel: Channel; subject: string; body: string; script: string; dayOffset: number; sendTimeMinutes: number | null; plannedAt: string; anchor: StepAnchor; offsetMinutes: string; before: boolean; variants: Variants };
type StoredVariant = { family: PreparationFamily; subject: string | null; body: string | null; script: string | null };
type MixValue = { id?: string; name?: string; description?: string | null; framework?: string | null; category?: string | null; industry?: string | null; triggerMode?: TriggerMode; dateTypeId?: string | null; status?: MixStatus; groupIds?: string[]; assignAllContacts?: boolean; broadcastDate?: string | null; broadcastTime?: string | null; broadcastTimezone?: string | null; steps?: Array<{ id: string; stepTemplateId: string; templateActive: boolean; name: string; channel: Channel; subject: string | null; body: string | null; script: string | null; dayOffset: number; sendTimeMinutes: number | null; plannedAt?: string | null; anchor?: StepAnchor; offsetMinutes?: number | null; variants?: StoredVariant[] }> };
type LegacyMessageOption = { id: string; name: string; channel: Channel; subject: string | null; body: string | null; script: string | null };

const MAX_STEP_OFFSET_DAYS = 365;
const CHANNELS: Array<{ value: Channel; label: string }> = [
  { value: "SMS", label: "Text" },
  { value: "PHONE_CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "VOICEMAIL", label: "Voicemail" },
  { value: "WHATSAPP", label: "WhatsApp" }
];

const NO_VARIANTS: Variants = { textBody: "", emailSubject: "", emailBody: "", callScript: "" };

function variantsOf(stored: StoredVariant[] | undefined): Variants {
  const find = (family: PreparationFamily) => stored?.find((item) => item.family === family);
  return { textBody: find("TEXT")?.body ?? "", emailSubject: find("EMAIL")?.subject ?? "", emailBody: find("EMAIL")?.body ?? "", callScript: find("CALL")?.script ?? "" };
}

/** The family a channel's wording belongs to; a beat never offers an alternative for its own family. */
function familyOf(channel: Channel): PreparationFamily {
  return channel === "EMAIL" ? "EMAIL" : channel === "PHONE_CALL" || channel === "VOICEMAIL" ? "CALL" : "TEXT";
}

function newStep(index: number, previousOffset = -1): SequenceItem {
  return { key: `new-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`, name: `Beat ${index + 1}`, channel: index === 0 ? "SMS" : "PHONE_CALL", subject: "", body: "", script: "", dayOffset: Math.min(previousOffset + 1, MAX_STEP_OFFSET_DAYS), sendTimeMinutes: null, plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "", before: false, variants: NO_VARIANTS };
}

function timeValue(minutes: number | null): string {
  return minutes === null ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function minutesValue(value: string): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

/** The signed minutes the save action stores: negative means before; a completion beat is after-only, zero included. */
function signedMinutes(item: SequenceItem): string {
  if (item.anchor === "CALENDAR_DAY" || !item.offsetMinutes.trim()) return "";
  const magnitude = Math.abs(Number(item.offsetMinutes));
  return String(item.before && item.anchor !== "VISIT_COMPLETED" ? -magnitude : magnitude);
}

export function MixEditor({
  mix,
  dateTypes,
  groups,
  categories,
  industries,
  workspaceTimezone,
  reviewBeforeActivation = true,
  workflowSources = [],
  completionSourceId = "",
  workflowRevision = 0,
  activeContactCount,
  missingEmailCount,
  missingPhoneCount
}: {
  mix?: MixValue;
  jumps: LegacyMessageOption[];
  dateTypes: DateTypeOption[];
  groups: GroupOption[];
  categories: string[];
  industries: string[];
  workspaceTimezone: string;
  reviewBeforeActivation?: boolean;
  workflowSources?: Array<{ id: string; name: string }>;
  completionSourceId?: string;
  workflowRevision?: number;
  activeContactCount: number;
  missingEmailCount: number;
  missingPhoneCount: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const activationInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(mix?.name ?? "");
  const [status, setStatus] = useState<MixStatus>(mix?.status ?? "DRAFT");
  const [triggerMode, setTriggerMode] = useState<TriggerMode>(completionSourceId ? "AFTER_MIX" : mix?.triggerMode ?? "DATE_TRIGGERED");
  const [sourceMixId, setSourceMixId] = useState(completionSourceId);
  const [assignAllContacts, setAssignAllContacts] = useState(mix?.assignAllContacts ?? false);
  const [selectedGroupIds, setSelectedGroupIds] = useState(() => new Set(mix?.groupIds ?? []));
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sequence, setSequence] = useState<SequenceItem[]>(() => {
    const existing = mix?.steps?.map((step) => ({ key: step.id, id: step.id, name: step.name, channel: step.channel, subject: step.subject ?? "", body: step.body ?? "", script: step.script ?? "", dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes, plannedAt: step.plannedAt ?? "", anchor: step.anchor ?? "CALENDAR_DAY", offsetMinutes: step.offsetMinutes == null ? "" : String(Math.abs(step.offsetMinutes)), before: (step.offsetMinutes ?? 0) < 0, variants: variantsOf(step.variants) })) ?? [];
    return existing.length ? existing : [newStep(0)];
  });
  const selectedGroups = useMemo(() => groups.filter((group) => selectedGroupIds.has(group.id)), [groups, selectedGroupIds]);
  const audience = useAudiencePreview(assignAllContacts, [...selectedGroupIds]);
  const audienceEstimate = audience.data?.total ?? 0;
  const audienceChosen = assignAllContacts || selectedGroupIds.size > 0;
  // Beats timed from an appointment have nothing to count from for the people enrolled here; they
  // run only for a visit the owner lines the mix up with, so only calendar-day beats are projected.
  const calendarBeats = sequence.filter((item) => item.anchor === "CALENDAR_DAY").length;
  const visitBeats = sequence.length - calendarBeats;
  const projectedFollowUps = audienceEstimate * calendarBeats;
  // A mix that starts when the owner chooses can be on with no one enrolled: it is started from a
  // person's page or attached to a visit the owner picks on the calendar.
  const canStart = triggerMode === "AFTER_MIX" ? Boolean(sourceMixId) : Boolean(audience.data) && (audienceChosen || triggerMode === "MANUAL_START");
  const channels = [...new Set(sequence.map((item) => item.channel))];

  const updateStep = (index: number, patch: Partial<SequenceItem>) => setSequence((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const addStep = () => setSequence((current) => [...current, newStep(current.length, current.at(-1)?.dayOffset ?? -1)]);
  const [removedStep, setRemovedStep] = useState<{ index: number; item: SequenceItem } | null>(null);
  const removeStep = (index: number) => { setRemovedStep({ index, item: sequence[index] }); setSequence(current => current.filter((_, itemIndex) => itemIndex !== index)); };
  const moveStep = (from: number, direction: -1 | 1) => setSequence((current) => {
    const to = from + direction;
    if (to < 0 || to >= current.length) return current;
    const next = [...current];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
  const toggleGroup = (groupId: string) => setSelectedGroupIds((current) => {
    const next = new Set(current);
    if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
    return next;
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (status !== "ACTIVE" || !reviewBeforeActivation || activationInputRef.current?.value === "1") return;
    event.preventDefault();
    setReviewOpen(true);
  };
  const confirmActivation = () => {
    if (activationInputRef.current) activationInputRef.current.value = "1";
    setReviewOpen(false);
    formRef.current?.requestSubmit();
  };

  return <form ref={formRef} action={saveMixAction} className="mix-editor-form simple-plan-editor" onSubmit={submit} onInvalid={event => { let parent = event.target instanceof HTMLElement ? event.target.parentElement : null; while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; } }}>
    <FormGuard guardOtherForms />
    {mix?.id && <input type="hidden" name="mixId" value={mix.id} />}
    <input ref={activationInputRef} type="hidden" name="activationConfirmed" defaultValue="0" />
    <input type="hidden" name="workflowRevision" value={workflowRevision} />

    <details className="card mix-editor-section mix-start-settings" open={!mix?.id}>
      <summary><strong>Name and start</strong><span>{name || "Set up this mix"}</span></summary>
      <div className="form-grid">
        <label className="field full"><span>Mix name</span><input name="name" maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="Estimate follow-up" required autoFocus={!mix?.id} /></label>
        <label className="field"><span>When should it start?</span><select name="triggerMode" value={triggerMode} onChange={(event) => setTriggerMode(event.target.value as TriggerMode)}><option value="DATE_TRIGGERED">When I add a date</option><option value="MANUAL_START">When I start it for someone</option><option value="BROADCAST">On one fixed date</option><option value="AFTER_MIX">After another Mix finishes</option></select></label>
        {triggerMode === "AFTER_MIX" && <label className="field"><span>Which Mix?</span><select name="completionSourceId" value={sourceMixId} required onChange={event => setSourceMixId(event.target.value)}><option value="">Choose a Mix</option>{workflowSources.filter(item => item.id !== mix?.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>The same person continues automatically. Existing start conditions stay available. <Link href="/journey">Manage additional triggers and paths in Journey</Link>.</small></label>}
        {triggerMode === "DATE_TRIGGERED" && <label className="field"><span>Which date?</span><select name="dateTypeId" defaultValue={mix?.dateTypeId ?? dateTypes[0]?.id ?? ""} required>{dateTypes.map((dateType) => <option key={dateType.id} value={dateType.id}>{dateType.name}</option>)}</select><small><Link href="/settings/jump-date-types">Manage date types</Link></small></label>}
        {triggerMode === "BROADCAST" && <div className="field full broadcast-fields"><div className="broadcast-field-grid"><label className="field"><span>Date</span><input name="broadcastDate" type="date" defaultValue={mix?.broadcastDate ?? ""} required /></label><label className="field"><span>Time</span><input name="broadcastTime" type="time" defaultValue={mix?.broadcastTime ?? "10:00"} required /></label><label className="field"><span>Timezone</span><TimezonePicker name="broadcastTimezone" id="broadcastTimezone" label="Timezone" defaultValue={mix?.broadcastTimezone ?? workspaceTimezone} /></label></div></div>}
        {triggerMode !== "BROADCAST" && <input type="hidden" name="broadcastTimezone" value={workspaceTimezone} />}
        <label className="field"><span>After saving</span><select name="status" value={status} onChange={(event) => setStatus(event.target.value as MixStatus)}><option value="DRAFT">Keep as a draft</option><option value="ACTIVE">Start the mix</option>{mix?.id && <option value="PAUSED">Keep paused</option>}</select></label>
      </div>

      {triggerMode === "AFTER_MIX" && <p className="muted-copy">For the person who finishes {workflowSources.find(item => item.id === sourceMixId)?.name ?? "the selected Mix"}. This connection starts future runs; it does not enroll everyone or replay previous completions.</p>}
      <div className="audience-options" hidden={triggerMode === "AFTER_MIX" && !mix?.id}>
        <h3>Who is this mix for?</h3>
        <label className="checkbox-card"><input type="checkbox" name="assignAllContacts" checked={assignAllContacts} onChange={(event) => setAssignAllContacts(event.target.checked)} /><span><strong>Everyone</strong><small>{activeContactCount.toLocaleString()} active people</small></span></label>
        {groups.length > 0 && <div className="group-choice-grid">{groups.map((group) => {
          const selected = selectedGroupIds.has(group.id);
          return <label className={`checkbox-card ${group.isActive ? "" : "inactive"}`} key={group.id}><input type="checkbox" name={group.isActive ? "groupIds" : undefined} value={group.id} checked={selected} onChange={() => toggleGroup(group.id)} disabled={!group.isActive} /><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} /><span><strong>{group.name}</strong><small>{group.contactCount} {group.contactCount === 1 ? "person" : "people"}</small></span></label>;
        })}</div>}
        <small>{triggerMode === "MANUAL_START" ? "You can also start it from one person’s page, or line it up with a visit from the calendar. No one needs to be enrolled here first." : "You can also start a mix from one person’s page."}</small>
      </div>

      <details className="plan-advanced-settings"><summary>Advanced mix settings</summary><div className="form-grid">
        <label className="field full"><span>Description</span><textarea name="description" maxLength={1200} defaultValue={mix?.description ?? ""} placeholder="What this mix helps you remember" /></label>
        <label className="field"><span>Goal</span><select name="category" defaultValue={planGoalLabel(mix?.category ?? "")}><option value="">None</option>{[...new Set([...categories.map(planGoalLabel), ...(mix?.category ? [planGoalLabel(mix.category)] : [])])].map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="field"><span>Business type</span><select name="industry" defaultValue={mix?.industry ?? ""}><option value="">Any</option>{industries.map((industry) => <option key={industry}>{industry}</option>)}</select></label>
        <label className="field full"><span>Internal approach</span><input name="framework" maxLength={160} defaultValue={mix?.framework ?? ""} placeholder="Optional" /></label>
      </div></details>
    </details>
    <ol className="mix-beat-timeline" aria-label="Mix beat timing">{sequence.map((item, index) => <li key={item.key}><a href={`#mix-beat-${item.key}`}><span>{item.anchor === "CALENDAR_DAY" ? `Day ${item.dayOffset}` : describeStepTiming({ anchor: item.anchor, offsetMinutes: Number(signedMinutes(item)) || 0 })}</span><i aria-hidden="true" /><strong>Beat {index + 1}</strong></a></li>)}</ol>
    <section className="card mix-editor-section mix-beats-section" aria-label="Beats">
      <p className="mix-beats-help">Day 0 is the start date. Each beat prepares one follow-up.</p>
      {removedStep && <p role="status">Beat removed. <button type="button" className="text-button" onClick={() => { setSequence(current => { const next = [...current]; next.splice(Math.min(removedStep.index, next.length), 0, removedStep.item); return next; }); setRemovedStep(null); }}>Undo beat removal</button></p>}
      <div className={styles.sequenceList}>{sequence.map((item, index) => {
        const written = ["SMS", "EMAIL", "WHATSAPP"].includes(item.channel);
        const signedOffset = item.dayOffset;
        const fieldId = (field: string) => `plan-step-${index}-${field}`;
        return <fieldset id={`mix-beat-${item.key}`} className={`mix-editor-jump ${styles.sequenceCard}`} key={item.key}>
          <legend className="sr-only">Beat {index + 1}</legend>
          <input type="hidden" name="mixStepId" value={item.id ?? ""} />
          <input type="hidden" name="dayOffset" value={signedOffset} />
          <input type="hidden" name="sendTimeMinutes" value={item.sendTimeMinutes ?? ""} />
          <input type="hidden" name="plannedAt" value={item.plannedAt} />
          <input type="hidden" name="anchor" value={item.anchor} />
          <input type="hidden" name="offsetMinutes" value={signedMinutes(item)} />

          <div className="mix-beat-heading">
            <span className="mix-beat-number" aria-hidden="true">{index + 1}</span>
            <label className="field mix-beat-name"><span className="sr-only">Beat name</span><input name={`inlineName-${index}`} value={item.name} maxLength={160} onChange={event => updateStep(index, { name: event.target.value })} required /></label>
            <label className="field mix-beat-channel"><span className="sr-only">Channel</span><select id={fieldId("channel")} name={`inlineChannel-${index}`} value={item.channel} onChange={(event) => updateStep(index, { channel: event.target.value as Channel })}>{CHANNELS.map((channel) => <option value={channel.value} key={channel.value}>{channel.label}</option>)}</select></label>
            {item.anchor === "CALENDAR_DAY"
              ? <label className="field mix-beat-day"><span>{signedOffset < 0 ? "Before" : "Day"}</span><input aria-label={signedOffset < 0 ? "Days before start" : "Days after start"} id={fieldId("day")} type="number" min={0} max={MAX_STEP_OFFSET_DAYS} value={Math.abs(signedOffset)} onChange={(event) => updateStep(index, { dayOffset: (signedOffset < 0 ? -1 : 1) * Number(event.target.value) })} required /></label>
              : <label className="field mix-beat-minutes"><span>{item.anchor === "VISIT_COMPLETED" ? "Minutes after completion" : "Minutes"}</span><input id={fieldId("minutes")} type="number" step={1} min={0} max={MAX_STEP_OFFSET_MINUTES} value={item.offsetMinutes} onChange={(event) => updateStep(index, { offsetMinutes: event.target.value })} required /></label>}
            {item.anchor !== "CALENDAR_DAY" && item.anchor !== "VISIT_COMPLETED" && <label className="field"><span>Before or after</span><select id={fieldId("direction")} value={item.before ? "before" : "after"} onChange={(event) => updateStep(index, { before: event.target.value === "before" })}><option value="before">{item.anchor === "APPOINTMENT_END" ? "Before it ends" : "Before it starts"}</option><option value="after">{item.anchor === "APPOINTMENT_END" ? "After it ends" : "After it starts"}</option></select></label>}

          </div>
          <div className="form-grid mix-beat-message">
            {item.channel === "EMAIL" && <label className="field full"><span>Subject</span><input name={`inlineSubject-${index}`} value={item.subject} onChange={(event) => updateStep(index, { subject: event.target.value })} maxLength={300} required /></label>}
            {written ? <label className="field full"><span className="sr-only">Message</span><textarea name={`inlineBody-${index}`} value={item.body} onChange={(event) => updateStep(index, { body: event.target.value })} rows={3} placeholder="Hi {{First Name}}, ... {{SMS Signature}}" required /></label> : <label className="field full"><span className="sr-only">{item.channel === "VOICEMAIL" ? "Voicemail" : "Call notes"}</span><textarea name={`inlineScript-${index}`} value={item.script} onChange={(event) => updateStep(index, { script: event.target.value })} rows={3} placeholder="What should you remember to ask?" required /></label>}
          </div>
          <details className="mix-beat-options"><summary aria-label={`Options for beat ${index + 1}`} title={`Options for beat ${index + 1}`}><AppIcon name="more" /><span className="sr-only">Beat options</span></summary>
          <div className="mix-beat-options-body">
            <details className="field"><summary>Appointment timing (optional)</summary><label className="field"><span>Count from</span><select id={fieldId("timing")} value={item.anchor} onChange={(event) => { const anchor = event.target.value as StepAnchor; updateStep(index, { anchor, offsetMinutes: anchor === "CALENDAR_DAY" ? "" : item.offsetMinutes || "0", before: anchor === "VISIT_COMPLETED" ? false : item.before }); }}>{STEP_ANCHORS.map((anchor) => <option value={anchor} key={anchor}>{STEP_ANCHOR_LABELS[anchor]}</option>)}</select>{item.anchor !== "CALENDAR_DAY" && <small>{signedMinutes(item) && Number.isInteger(Number(signedMinutes(item))) ? `Becomes due ${describeStepTiming({ anchor: item.anchor, offsetMinutes: Number(signedMinutes(item)) })}. ${describeStepReadiness({ anchor: item.anchor, offsetMinutes: Number(signedMinutes(item)) })}` : "Enter a whole number of minutes."} Elapsed minutes, not calendar days: it runs only for a visit you line this mix up with from the calendar, and a clock change does not move it.</small>}</label></details>
          {(() => {
            const primary = familyOf(item.channel);
            const setVariant = (patch: Partial<Variants>) => updateStep(index, { variants: { ...item.variants, ...patch } });
            const offered = [primary !== "TEXT" && item.variants.textBody.trim(), primary !== "EMAIL" && item.variants.emailBody.trim(), primary !== "CALL" && item.variants.callScript.trim()].filter(Boolean).length;
            return <details className="step-advanced-settings" data-beat-alternatives={index}><summary>Also offer as…{offered ? ` (${offered})` : ""}</summary><div className="form-grid">
              <input type="hidden" name={`variantTextBody-${index}`} value={primary === "TEXT" ? "" : item.variants.textBody} />
              <input type="hidden" name={`variantEmailSubject-${index}`} value={primary === "EMAIL" ? "" : item.variants.emailSubject} />
              <input type="hidden" name={`variantEmailBody-${index}`} value={primary === "EMAIL" ? "" : item.variants.emailBody} />
              <input type="hidden" name={`variantCallScript-${index}`} value={primary === "CALL" ? "" : item.variants.callScript} />
              <p className="muted-copy field full">Write this beat for another way of reaching out. On Today you choose which one to use; each version keeps its own wording, and choosing never sends anything or adds another follow-up. Leave a version blank to not offer it.</p>
              {primary !== "TEXT" && <label className="field full"><span>Text version</span><textarea value={item.variants.textBody} onChange={(event) => setVariant({ textBody: event.target.value })} rows={3} placeholder="Hi {{First Name}}, ... {{SMS Signature}}" /></label>}
              {primary !== "EMAIL" && <><label className="field full"><span>Email version subject</span><input value={item.variants.emailSubject} onChange={(event) => setVariant({ emailSubject: event.target.value })} maxLength={300} /></label><label className="field full"><span>Email version</span><textarea value={item.variants.emailBody} onChange={(event) => setVariant({ emailBody: event.target.value })} rows={4} placeholder="Hi {{First Name}}, ... {{Email Signature}}" /></label></>}
              {primary !== "CALL" && <label className="field full"><span>Call version · notes for you</span><textarea value={item.variants.callScript} onChange={(event) => setVariant({ callScript: event.target.value })} rows={3} placeholder="What should you remember to ask? Private notes may go here." /></label>}
            </div></details>;
          })()}
          {item.anchor === "CALENDAR_DAY" && <details className="step-advanced-settings"><summary>More timing options</summary><div className="form-grid"><label className="field"><span>Position</span><select value={signedOffset < 0 ? "before" : "after"} onChange={(event) => updateStep(index, { dayOffset: event.target.value === "before" ? -Math.abs(item.dayOffset) : Math.abs(item.dayOffset) })} disabled={triggerMode === "MANUAL_START"}><option value="after">On or after the start</option><option value="before">Before the date</option></select></label><label className="field"><span>Specific time</span><input type="time" value={timeValue(item.sendTimeMinutes)} onChange={(event) => updateStep(index, { sendTimeMinutes: minutesValue(event.target.value) })} /></label><label className="field full"><span>Planned date (optional)</span><input type="datetime-local" value={item.plannedAt} onChange={(event) => updateStep(index, { plannedAt: event.target.value })} /><small>Becomes due at this date and time, in your timezone, for every contact who has reached this beat.</small></label></div></details>}
          <div className="mix-beat-reorder"><button className="button small" type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} aria-label={`Move beat ${index + 1} up`}><AppIcon name="arrowUp" />Move up</button><button className="button small" type="button" onClick={() => moveStep(index, 1)} disabled={index === sequence.length - 1} aria-label={`Move beat ${index + 1} down`}><AppIcon name="arrowDown" />Move down</button><button className="button small danger" type="button" onClick={() => removeStep(index)} disabled={sequence.length === 1}><AppIcon name="trash" />Remove</button></div>
          </div></details>
        </fieldset>;
      })}</div>
      <button className="text-button mix-add-beat" type="button" onClick={addStep}><AppIcon name="plus" />Add a beat</button>
    </section>

    <SchedulePreview timezone={workspaceTimezone} steps={sequence.map(item => ({ anchor: item.anchor, offsetMinutes: signedMinutes(item), dayOffset: item.dayOffset, sendTimeMinutes: item.sendTimeMinutes, plannedAt: item.plannedAt }))} />
    <ReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="Start this mix?" description="Check the audience and schedule before starting."><div className={styles.reviewGrid}><div><strong>{audience.data ? audienceEstimate.toLocaleString() : "Checking…"}</strong><span>people</span></div><div><strong>{sequence.length}</strong><span>beats each</span></div><div><strong>{audience.data ? projectedFollowUps.toLocaleString() : "Checking…"}</strong><span>potential follow-ups</span></div>{visitBeats > 0 && <div><strong>{visitBeats}</strong><span>{visitBeats === 1 ? "beat waits for a visit" : "beats wait for a visit"}</span></div>}</div><div className={styles.reviewWarnings}>{audience.error && <p className="notice error" role="alert">{audience.error} <button type="button" onClick={audience.retry}>Retry audience check</button></p>}<p>People in multiple tags count once. Dates, pauses and scheduling rules determine the actual prepared follow-ups.</p>{!audienceChosen && (triggerMode === "MANUAL_START" ? <p>No one is enrolled yet. Line this mix up with a visit from the calendar, or start it from one person’s page.</p> : <p className="notice error">Choose who gets this mix.</p>)}{visitBeats > 0 && audienceEstimate > 0 && <p>{visitBeats === sequence.length ? "Every beat is timed from an appointment, so these people get nothing until you line this mix up with one of their visits from the calendar." : `The ${visitBeats} ${visitBeats === 1 ? "beat" : "beats"} timed from an appointment ${visitBeats === 1 ? "runs" : "run"} only for a visit you line up from the calendar; these people get the ${calendarBeats} calendar-day ${calendarBeats === 1 ? "beat" : "beats"}.`}</p>}{channels.includes("EMAIL") && (audience.data?.missingEmail ?? 0) > 0 && <p>{audience.data?.missingEmail} selected people have no email.</p>}{channels.some((channel) => channel !== "EMAIL") && (audience.data?.missingPhone ?? 0) > 0 && <p>{audience.data?.missingPhone} selected people have no phone.</p>}</div><div className="form-actions"><button className="button" type="button" onClick={() => setReviewOpen(false)}>Keep editing</button><button className="button primary" type="button" disabled={!canStart} onClick={confirmActivation}>Start the mix</button></div></ReviewDialog>

    {status === "ACTIVE" && <p className="mix-activation-preference">{reviewBeforeActivation ? "You’ll review who gets this mix before activating." : "Saving activates this mix using your audience and sending settings."} <Link href="/account/preferences">Change preference</Link></p>}
    <div className="sticky-form-actions">{status === "ACTIVE" && !reviewBeforeActivation && <button className="button" type="button" onClick={() => { if (formRef.current?.reportValidity()) setReviewOpen(true); }}>Review first</button>}<Link className="button" href="/mixes"><AppIcon name="close" />Cancel</Link><button className="button primary" type="submit"><AppIcon name="check" />{status === "ACTIVE" ? (reviewBeforeActivation ? "Review and start" : "Save and activate") : mix?.id ? "Save mix" : "Create a mix"}</button></div>
  </form>;
}
