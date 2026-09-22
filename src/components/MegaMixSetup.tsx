"use client";
import { useId, useRef, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { MegaMixPreview } from "@/components/MegaMixPreview";
import { JourneyPreferenceFields, JourneyPreferenceSummary } from "@/components/JourneyPreferenceFields";
import { MEGA_MIXES, megaMixById } from "@/lib/mega-mixes";
import { tailorMegaMix, validateJourneySetup, type JourneySetupValues } from "@/lib/journey-preferences";
import { installMegaMixAction, saveIndividualMixSetupAction } from "@/lib/mega-mix-actions";
import styles from "./JourneySetup.module.css";

export function MegaMixSetup({ initialId, initialSetup, onboarding, active = true, individual = false, onSetupChange }: { initialId: string; initialSetup: JourneySetupValues; active?: boolean; individual?: boolean; onSetupChange?: (value: JourneySetupValues) => void; onboarding?: { userName: string; company?: string; smsSignature?: string } }) {
  const id = useId();
  const [selected, setSelected] = useState(initialId);
  const [setup, setSetup] = useState(initialSetup);
  const [review, setReview] = useState(Boolean(initialSetup.preferences.reviewedAt));
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const blueprint = tailorMegaMix(megaMixById(selected) ?? MEGA_MIXES[0], setup);
  const showReview = () => { const issue = validateJourneySetup(setup); setError(issue ?? ""); if (!issue) setReview(true); requestAnimationFrame(() => heading.current?.focus()); };
  return <ActionForm action={individual ? saveIndividualMixSetupAction : installMegaMixAction} protect={active}>
    <input type="hidden" name="blueprintId" value={blueprint.id} /><input type="hidden" name="version" value={blueprint.version} /><input type="hidden" name="tailored" value="1" />
    {onboarding && <input type="hidden" name="onboarding" value="1" />}
    {onboarding && !individual && <><label className="field"><span>Your mega-mix</span><select aria-label="Your mega-mix" value={selected} onChange={event => setSelected(event.target.value)}>{MEGA_MIXES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p>{blueprint.description} Includes {blueprint.nodes.length} connected mixes.</p></>}
    <p className={styles.progress}>{review ? "Review your setup" : "A few preferences, then review"}</p>
    <h2 ref={heading} tabIndex={-1}>{review ? "Ready when you are" : "Make this fit your day"}</h2>
    {error && <p role="alert" className="notice error">{error}</p>}
    <div hidden={review} className="form-stack">
      <JourneyPreferenceFields id={id} value={setup} onChange={value => { setSetup(value); onSetupChange?.(value); }} />
      {onboarding && <details className="onboarding-step-card"><summary>Business name and message signature</summary><div className="form-grid"><label className="field"><span>Business name (optional)</span><input name="company" defaultValue={onboarding.company} autoComplete="organization" maxLength={200} /></label><label className="field"><span>How do you sign texts?</span><input name="smsSignature" defaultValue={onboarding.smsSignature || onboarding.userName} maxLength={160} /></label></div></details>}
      <button className="button primary" type="button" onClick={showReview}>Review my setup</button>
    </div>
    {review && <>
      <div className={styles.review}><h3>{initialSetup.preferences.reviewedAt ? "Your saved preferences" : "Your preferences"}</h3><JourneyPreferenceSummary value={setup} /><button type="button" className="button" onClick={() => { setReview(false); requestAnimationFrame(() => heading.current?.focus()); }}>Edit preferences</button></div>
      {individual ? <><p>Next, choose individual mixes from the library. You can preview and edit each one before adding it. These communication and spacing choices apply to new mega-mixes; individual mixes keep the wording and delays you choose.</p><input type="hidden" name="reviewed" value="on" /><FormSubmitButton label="Choose individual mixes" pendingLabel="Saving your preferences…" /></> : <>
        <details className="onboarding-step-card"><summary>Preview the {blueprint.name} journey</summary><MegaMixPreview blueprint={blueprint} /></details>
        <p>Your {blueprint.nodes.length} connected mixes will be ready to use. Add people when you’re ready; this step sends nothing.</p>
        <label className="checkbox-card"><input key={`${blueprint.id}-${JSON.stringify(setup)}`} type="checkbox" name="reviewed" required /><span>I’ve reviewed my journey and preferences.</span></label>
        <FormSubmitButton label={`Add ${blueprint.name} mega-mix`} pendingLabel="Connecting your mixes…" />
      </>}
      <small>You can change preferences in Account, and edit or pause any Mix afterward.</small>
    </>}
  </ActionForm>;
}
