"use client";

import { useState } from "react";
import { LocalDateInput } from "@/components/LocalDateInput";
import { TimezonePicker } from "@/components/TimezonePicker";
import { BUSINESS_TYPES } from "@/lib/business-taxonomy";
import { completeOnboardingAction, skipOnboardingAction } from "@/lib/onboarding-actions";
import { ONBOARDING_USES, onboardingUse, type OnboardingUse } from "@/lib/onboarding-options";
import { marketingScenario } from "@/lib/marketing-scenarios";

export function OnboardingForm({ userName, industry, initialUse, timezone, today, scenarioId }: { userName: string; industry: string | null; initialUse: OnboardingUse; timezone: string; today: string; scenarioId?: string }) {
  const [purpose, setPurpose] = useState<OnboardingUse>(initialUse);
  const [starterChoice, setStarterChoice] = useState<"suggested" | "choose">(scenarioId ? "suggested" : "choose");
  const use = onboardingUse(purpose)!;
  const scenario = marketingScenario(scenarioId);
  return <form action={completeOnboardingAction} className="form-stack">
    <fieldset className="onboarding-step-card">
      <legend><span>1</span> Make this fit your life</legend>
      <div className="form-stack">
        <label className="field"><span>How will you use Jump in the Mix?</span><select name="useCase" value={purpose} onChange={event => setPurpose(event.target.value as OnboardingUse)}>{ONBOARDING_USES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><small>{use.description} You can use it for more than one.</small></label>
        {purpose === "business" && <label className="field"><span>Type of business</span><select name="businessType" defaultValue={industry ?? "Home services"}>{[...new Set([...BUSINESS_TYPES, ...(industry ? [industry] : [])])].map(type => <option key={type}>{type}</option>)}</select><small>We’ll suggest mixes that fit your work.</small></label>}
      </div>
    </fieldset>
    <fieldset className="onboarding-step-card">
      <legend><span>2</span> Make it sound like you</legend>
      <div className="form-grid">
        {purpose !== "personal" && <label className="field"><span>{purpose === "business" ? "Business name" : "Organization (optional)"}</span><input name="businessName" autoComplete="organization" placeholder={purpose === "business" ? "Lee Plumbing" : "Company, community, or group"} maxLength={200} required={purpose === "business"} /></label>}
        <label className={purpose === "personal" ? "field full" : "field"}><span>How do you sign texts?</span><input name="smsSignature" defaultValue={userName} maxLength={160} required /></label>
      </div>
    </fieldset>
    <fieldset className="onboarding-step-card">
      <legend><span>3</span> Choose a starting point</legend>
      <div className="form-stack">
        {scenario && purpose === "business" && <label className="checkbox-card"><input type="radio" name="starterChoice" value="suggested" checked={starterChoice === "suggested"} onChange={() => setStarterChoice("suggested")} /><span><strong>Use “{scenario.starterTitle}”</strong><small> Based on the fictional example you tried. You’ll review it before sending.</small></span></label>}
        <label className="checkbox-card"><input type="radio" name="starterChoice" value="choose" checked={starterChoice === "choose"} onChange={() => setStarterChoice("choose")} /><span>Choose a different follow-up</span></label>
        {(starterChoice === "choose" || !scenario || purpose !== "business") && <label className="field"><span>What do you want to do?</span><select key={purpose} name="reason" defaultValue={use.reasons[0]}>{use.reasons.map(reason => <option key={reason}>{reason}</option>)}</select></label>}
      </div>
    </fieldset>
    <fieldset className="onboarding-step-card">
      <legend><span>4</span> Add your first person</legend>
      <div className="form-grid">
        <div className="field full"><label htmlFor="contactName">Name</label><input id="contactName" name="contactName" autoComplete="name" placeholder="Jordan Lee" required /></div>
        <div className="field"><label htmlFor="contactPhone">Phone <small>recommended</small></label><input id="contactPhone" name="contactPhone" inputMode="tel" autoComplete="tel" placeholder="(555) 555-0123" /></div>
        <div className="field"><label htmlFor="contactEmail">Email <small>optional</small></label><input id="contactEmail" name="contactEmail" type="email" inputMode="email" autoComplete="email" /></div>
        <label className="field full"><span>What should you remember?</span><textarea name="privateContext" maxLength={1000} rows={3} placeholder="What did you discuss, and what timing or promise matters?" /></label>
        <div className="field"><label htmlFor="followUpDate">Follow up on</label><LocalDateInput id="followUpDate" name="followUpDate" initialValue={today} /></div>
        <div className="field full"><label htmlFor="timezone">Your timezone</label><TimezonePicker defaultValue={timezone} confirmDetection /></div>
      </div>
    </fieldset>
    <div className="onboarding-preview speech-bubble speech-bubble--soft"><strong>What happens next</strong><span>We prepare your first mix: a follow-up campaign starting on the date you picked. Your first beat appears in Today for you to review before sending.</span></div>
    <button className="button primary" type="submit">Prepare my first follow-up</button>
    <div className="skip-setup-form"><button className="text-button" type="submit" formAction={skipOnboardingAction} formNoValidate>Skip for now</button></div>
  </form>;
}
