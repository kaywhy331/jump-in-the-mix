"use client";
import { useId, useRef, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { MegaMixPreview } from "@/components/MegaMixPreview";
import { JourneyPreferenceFields, JourneyPreferenceSummary } from "@/components/JourneyPreferenceFields";
import { MEGA_MIXES, megaMixById } from "@/lib/mega-mixes";
import { tailorMegaMix, validateJourneySetup, type JourneySetupValues } from "@/lib/journey-preferences";
import { MAX_CONTACT_STAGES, newStageLabels } from "@/lib/mix-stage-labels";
import { installMegaMixAction, saveIndividualMixSetupAction, saveSetupForLaterAction } from "@/lib/mega-mix-actions";
import styles from "./JourneySetup.module.css";

/** The business's Contact stages, by name (retired ones included), and whether it has turned them on. */
export type ContactStagesState = { names: string[]; on: boolean; paused?: boolean };

export function MegaMixSetup({ initialId, initialSetup, onboarding, active = true, individual = false, onSetupChange, contactStages }: { initialId: string; initialSetup: JourneySetupValues; active?: boolean; individual?: boolean; onSetupChange?: (value: JourneySetupValues) => void; onboarding?: { userName: string; company?: string; smsSignature?: string }; contactStages?: ContactStagesState }) {
  const id = useId();
  const [selected, setSelected] = useState(initialId);
  const [setup, setSetup] = useState(initialSetup);
  const [review, setReview] = useState(Boolean(initialSetup.preferences.reviewedAt));
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const blueprint = tailorMegaMix(megaMixById(selected) ?? MEGA_MIXES[0], setup);
  const showReview = () => { const issue = validateJourneySetup(setup); setError(issue ?? ""); if (!issue) setReview(true); requestAnimationFrame(() => heading.current?.focus()); };
  return <ActionForm action={(previous, data) => data.get("finishLater") === "1" ? saveSetupForLaterAction(previous, data) : individual ? saveIndividualMixSetupAction(previous, data) : installMegaMixAction(previous, data)} protect={active}>
    {/* The first submit button is the form's default for Enter. Browsers skip disabled ones, so this enabled, hidden
        default cancels its own click: Enter can never fall through to "finish later". */}
    <button type="submit" hidden aria-hidden="true" tabIndex={-1} onClick={event => event.preventDefault()} />
    {onboarding && <div className="skip-setup-form"><span><button className="text-button" name="finishLater" value="1" formNoValidate>Save answers and finish later</button>{" "}<small>Your answers are kept. No Mix is installed and no person is enrolled.</small></span></div>}
    <input type="hidden" name="individual" value={individual ? "1" : "0"} />
    <input type="hidden" name="blueprintId" value={blueprint.id} /><input type="hidden" name="version" value={blueprint.version} /><input type="hidden" name="tailored" value="1" />
    {onboarding && <input type="hidden" name="onboarding" value="1" />}
    {onboarding && !individual && <><label className="field"><span>Your Mega-Mix</span><select aria-label="Your Mega-Mix" value={selected} onChange={event => setSelected(event.target.value)}>{MEGA_MIXES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p>{blueprint.description} Includes {blueprint.nodes.length} connected Mixes.</p></>}
    <p className={styles.progress}>{review ? "Review your setup" : "A few preferences, then review"}</p>
    <h2 ref={heading} tabIndex={-1}>{review ? "Ready when you are" : "Make this fit your day"}</h2>
    {error && <p role="alert" className="notice error">{error}</p>}
    <div hidden={review} className="form-stack" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(event.target.type)) { event.preventDefault(); showReview(); } }}>
      <JourneyPreferenceFields id={id} value={setup} detectTimezone={Boolean(onboarding) && initialSetup.timezone === "UTC"} onChange={value => { setSetup(value); onSetupChange?.(value); }} />
      {onboarding && <details className="onboarding-step-card"><summary>Business name and message signature</summary><div className="form-grid"><label className="field"><span>Business name (optional)</span><input name="company" defaultValue={onboarding.company} autoComplete="organization" maxLength={200} /></label><label className="field"><span>How do you sign texts?</span><input name="smsSignature" defaultValue={onboarding.smsSignature || onboarding.userName} maxLength={160} /></label></div></details>}
      <button className="button primary" type="button" onClick={showReview}>Review my setup</button>
    </div>
    {review && <>
      <div className={styles.review}><h3>{initialSetup.preferences.reviewedAt ? "Your saved preferences" : "Your preferences"}</h3><JourneyPreferenceSummary value={setup} /><button type="button" className="button" onClick={() => { setReview(false); requestAnimationFrame(() => heading.current?.focus()); }}>Edit preferences</button></div>
      {individual ? <><p>Next, choose individual Mixes from the library. You can preview and edit each one before adding it. These communication and spacing choices apply to new Mega-Mixes; individual Mixes keep the wording and delays you choose.</p><input type="hidden" name="reviewed" value="on" data-form-guard-ignore /><FormSubmitButton label="Choose individual Mixes" pendingLabel="Saving your preferences…" /></> : <>
        <details className="onboarding-step-card"><summary>Preview the {blueprint.name} journey</summary><MegaMixPreview blueprint={blueprint} showStages={!onboarding} /></details>
        <p>Your {blueprint.nodes.length} connected Mixes arrive with every message already written. Next, add your first customer. This step sends nothing.</p>
        {contactStages && !onboarding && <StageLabelsChoice key={blueprint.id} labels={blueprint.stages.map(stage => stage.name)} contactStages={contactStages} />}
        <label className="checkbox-card"><input key={`${blueprint.id}-${JSON.stringify(setup)}`} type="checkbox" name="reviewed" required /><span>I’ve reviewed my journey and preferences.</span></label>
        <FormSubmitButton label={`Add ${blueprint.name} Mega-Mix`} pendingLabel="Connecting your Mixes…" />
      </>}
      <small>You can change preferences in Account, and edit or pause any Mix afterward.</small>
    </>}
  </ActionForm>;
}

/**
 * Adding a Mega-Mix offers its stage labels, on by default (JITM-09 §2.79, P8). Labels the business already has are
 * reused; when the new ones don't fit under the stage limit the choice is off and says why. The choice appears only on
 * the review step, so its default is not a change the owner made (TRU-11).
 */
function StageLabelsChoice({ labels, contactStages }: { labels: string[]; contactStages: ContactStagesState }) {
  const added = newStageLabels(contactStages.names, labels);
  const room = MAX_CONTACT_STAGES - contactStages.names.length;
  const fits = added.length <= room;
  return <label className={`checkbox-card ${styles.stageLabels}`}><input type="checkbox" name="addStages" defaultChecked={fits} disabled={!fits} data-form-guard-ignore /><span>
    <strong>Add its stage labels</strong>
    <small>{labels.join(", ")}. Starting one of these Mixes moves the person to its stage.{contactStages.on ? " Labels you already have are reused, and a retired one comes back; nothing is renamed or removed." : " This turns on Contact stages."}{contactStages.paused ? " Automatic transitions are paused, so no one moves until you turn them back on." : ""}</small>
    {!fits && <small>Contact stages has room for {Math.max(0, room)} more {room === 1 ? "label" : "labels"}, and this Mega-Mix adds {added.length}.</small>}
  </span></label>;
}
