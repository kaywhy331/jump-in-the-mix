"use client";

import { useActionState, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/Notice";
import { saveJourneyRuleFormAction } from "@/lib/journey-actions";
import { JOURNEY_EVENTS, journeyRuleRevision, journeyRuleWhen, type JourneyRuleDetails, type JourneyRuleFormState } from "@/lib/journey-types";

type Stage = { id: string; name: string; planName: string | null };
type Draft = { toStageId: string; afterDays: string };
export function JourneyRuleForm({ fromStageId, stages, rules, initialEventType, automatic }: {
  fromStageId: string; stages: Stage[]; rules: JourneyRuleDetails[]; initialEventType?: string; automatic: boolean;
}) {
  const descriptionId = useId();
  const router = useRouter();
  const [eventType, setEventType] = useState(initialEventType ?? "CONVERSATION_STARTED");
  const [savedRules, setSavedRules] = useState(rules);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reviewedConflict, setReviewedConflict] = useState<JourneyRuleFormState | null>(null);
  const [state, action, pending] = useActionState<JourneyRuleFormState, FormData>(async (previous, data) => {
    let result: JourneyRuleFormState;
    try { result = await saveJourneyRuleFormAction(previous, data); }
    catch { return { error: "We couldn’t confirm this save. Your entries are kept. Try again; we’ll check for a newer saved rule first." }; }
    if (result.saved) router.push(`/settings/journey?saved=1&stage=${encodeURIComponent(fromStageId)}#stage-${encodeURIComponent(fromStageId)}`);
    return result;
  }, { error: "" });
  const existing = savedRules.find(rule => rule.eventType === eventType);
  const draft = drafts[eventType] ?? { toStageId: existing?.toStageId ?? "", afterDays: String(existing?.afterDays ?? 30) };
  const from = stages.find(stage => stage.id === fromStageId);
  const target = stages.find(stage => stage.id === draft.toStageId);
  const conflict = state.conflict && reviewedConflict !== state ? state.conflict : null;
  const change = (values: Partial<Draft>) => setDrafts(current => ({ ...current, [eventType]: { ...draft, ...values } }));
  const reviewLatest = () => {
    if (!conflict) return;
    setSavedRules(current => [...current.filter(rule => rule.eventType !== conflict.eventType), ...(conflict.rule ? [conflict.rule] : [])]);
    setEventType(conflict.eventType);
    setDrafts(current => ({ ...current, [conflict.eventType]: { toStageId: conflict.rule?.toStageId ?? "", afterDays: String(conflict.rule?.afterDays ?? 30) } }));
    setReviewedConflict(state);
  };
  return <form action={action} onReset={event => event.preventDefault()} className="form-grid journey-rule-form" aria-label={initialEventType ? `Edit ${journeyRuleWhen(eventType, existing?.afterDays ?? null)} rule` : `Add or change a rule for ${from?.name}`}>
    <input type="hidden" name="fromStageId" value={fromStageId} />
    <input type="hidden" name="expectedRule" value={journeyRuleRevision(existing)} />
    {state.error && reviewedConflict !== state && <div className="field full"><Notice type="error">{state.error}</Notice>
      {conflict && <div className="journey-rule-conflict"><p>{conflict.rule?.enabled
        ? `Latest saved rule: ${journeyRuleWhen(conflict.eventType, conflict.rule.afterDays)} → ${stages.find(stage => stage.id === conflict.rule?.toStageId)?.name ?? "a stage that is no longer available"}.`
        : "This trigger has no active saved rule."}</p><button className="button" type="button" onClick={reviewLatest}>Load latest rule</button><small>Replaces your current entries with the latest saved values.</small></div>}
    </div>}
    <label className="field"><span>When</span><select name="eventType" value={eventType} onChange={event => setEventType(event.target.value)} disabled={pending} aria-describedby={descriptionId}>
      {JOURNEY_EVENTS.map(event => <option value={event.value} key={event.value}>{event.label}</option>)}
    </select></label>
    {eventType === "TIME_IN_STAGE" && <label className="field"><span>Days in this stage</span><input name="afterDays" type="number" min={1} max={3650} value={draft.afterDays} onChange={event => change({ afterDays: event.target.value })} disabled={pending} required /></label>}
    <label className="field"><span>Move to</span><select name="toStageId" value={draft.toStageId} onChange={event => change({ toStageId: event.target.value })} disabled={pending} required><option value="">Choose a stage</option>{stages.filter(stage => stage.id !== fromStageId).map(stage => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label>
    <div className="field full journey-rule-preview" id={descriptionId} role="status" aria-live="polite" aria-atomic="true">
      {target ? <><strong>{journeyRuleWhen(eventType, eventType === "TIME_IN_STAGE" && draft.afterDays ? Number(draft.afterDays) : null)} → {target.name}</strong><p>Applies to people in {from?.name} whose automatic transitions are on.{target.planName ? ` Entering ${target.name} can start “${target.planName}”, following their contact and sending preferences.` : " No automatic mix starts on entry."}</p></> : <p>Choose where people in {from?.name} should move when this happens.</p>}
      <p>{existing?.enabled ? "This updates the saved rule for this trigger." : "This adds a rule for this trigger."} Saving keeps everyone in their current stage.{!automatic && " Automatic transitions are paused for this business."}</p>
      {eventType === "TIME_IN_STAGE" && <p>Time is counted from when each person entered this stage. People already past this time can move on the next automatic check.</p>}
      {eventType === "PLAN_COMPLETED" && <p>Uses the mix assigned by this stage. Separately added mixes do not trigger this rule. If the stage’s mix is already completed, the person can move on the next automatic check.</p>}
    </div>
    <div className="field full form-actions"><button className="button primary" type="submit" disabled={pending || Boolean(conflict) || !target}>{pending ? "Saving…" : existing?.enabled ? "Save rule changes" : "Save rule"}</button></div>
  </form>;
}
