"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeviceContactQuickAdd } from "@/components/DeviceContactQuickAdd";
import { useState } from "react";
import { LocalDateInput } from "@/components/LocalDateInput";
import { TimezonePicker } from "@/components/TimezonePicker";
import { BUSINESS_TYPES } from "@/lib/business-taxonomy";
import { completeOnboardingAction, skipOnboardingAction } from "@/lib/onboarding-actions";
import { ONBOARDING_USES, onboardingReasons, type OnboardingUse } from "@/lib/onboarding-options";
import { marketingScenario } from "@/lib/marketing-scenarios";

type ContactOption = { id: string; displayName: string };
export function OnboardingForm({ userName, industry, initialUses, timezone, today, scenarioId, contacts }: { userName: string; industry: string | null; initialUses: OnboardingUse[]; timezone: string; today: string; scenarioId?: string; contacts: ContactOption[] }) {
  const router = useRouter();
  const [purposes, setPurposes] = useState<OnboardingUse[]>(initialUses);
  const [contactId, setContactId] = useState("");
  const scenario = marketingScenario(scenarioId);
  const business = purposes.includes("business");
  const organization = business || purposes.includes("networking");
  const reasons = onboardingReasons(purposes);
  const [choice, setChoice] = useState(scenario && business ? "suggested" : reasons[0] ?? "");
  const selected = choice === "suggested" && scenario && business || reasons.includes(choice) ? choice : reasons[0] ?? "";
  return <form action={completeOnboardingAction} className="form-stack">
    <fieldset className="onboarding-step-card">
      <legend><span>1</span> Make this fit your life</legend>
      <div className="form-stack">
        <p id="use-case-help">How will you use Jump in the Mix? Select all that apply.</p>
        {ONBOARDING_USES.map(option => <label className="checkbox-card" key={option.id}><input type="checkbox" name="useCase" value={option.id} checked={purposes.includes(option.id)} aria-describedby="use-case-help" onChange={event => setPurposes(current => event.target.checked ? [...current, option.id] : current.filter(id => id !== option.id))} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}
        {business && <label className="field"><span>Type of business</span><select name="businessType" defaultValue={industry ?? "Home services"}>{[...new Set([...BUSINESS_TYPES, ...(industry ? [industry] : [])])].map(type => <option key={type}>{type}</option>)}</select><small>We’ll suggest mixes that fit your work.</small></label>}
      </div>
    </fieldset>
    <fieldset className="onboarding-step-card">
      <legend><span>2</span> Make it sound like you</legend>
      <div className="form-grid">
        {organization && <label className="field"><span>{business ? "Business name" : "Organization (optional)"}</span><input name="businessName" autoComplete="organization" placeholder={business ? "Lee Plumbing" : "Company, community, or group"} maxLength={200} required={business} /></label>}
        <label className={!organization ? "field full" : "field"}><span>How do you sign texts?</span><input name="smsSignature" defaultValue={userName} maxLength={160} required /></label>
      </div>
    </fieldset>
    <fieldset className="onboarding-step-card">
      <legend><span>3</span> Choose a starting point</legend>
      <div className="form-stack">
        <input type="hidden" name="starterChoice" value={selected === "suggested" ? "suggested" : "choose"} />
        <label className="field"><span>What do you want to do?</span><select name="reason" value={selected} onChange={event => setChoice(event.target.value)} required disabled={!purposes.length}>
          {scenario && business && <option value="suggested">{scenario.starterTitle} — from the example you tried</option>}
          {reasons.map(reason => <option key={reason}>{reason}</option>)}
        </select><small>Choose one follow-up to start with. You can add more later.</small></label>
      </div>
    </fieldset>
    <fieldset className="onboarding-step-card">
      <legend><span>4</span> Add your first person</legend>
      <div className="form-stack">
        <div className="form-actions"><Link className="button" href="/contacts/import?onboarding=1" target="_blank" rel="noopener">Import contacts from a file</Link><button className="button" type="button" onClick={() => router.refresh()}>Refresh imported contacts</button></div>
        <small>File import opens in another tab so your setup stays here. After importing, refresh and choose a saved person below.</small>
        <DeviceContactQuickAdd onboarding />
        {contacts.length > 0 && <label className="field"><span>Choose a saved person</span><select name="contactId" value={contactId} onChange={event => setContactId(event.target.value)}><option value="">Add someone new</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select></label>}
      </div>
      <div className="form-grid">
        {!contactId && <><div className="field full"><label htmlFor="contactName">Name</label><input id="contactName" name="contactName" autoComplete="name" placeholder="Jordan Lee" required /></div>
        <div className="field"><label htmlFor="contactPhone">Phone <small>recommended</small></label><input id="contactPhone" name="contactPhone" inputMode="tel" autoComplete="tel" placeholder="(555) 555-0123" /></div>
        <div className="field"><label htmlFor="contactEmail">Email <small>recommended</small></label><input id="contactEmail" name="contactEmail" type="email" inputMode="email" autoComplete="email" /></div></>}
        <label className="field full"><span>What should you remember?</span><textarea name="privateContext" maxLength={1000} rows={3} placeholder="What did you discuss, and what timing or promise matters?" /></label>
        <div className="field"><label htmlFor="followUpDate">Follow up on</label><LocalDateInput id="followUpDate" name="followUpDate" initialValue={today} /></div>
        <div className="field full"><label htmlFor="timezone">Your timezone</label><TimezonePicker defaultValue={timezone} confirmDetection /></div>
      </div>
    </fieldset>
    <div className="onboarding-preview speech-bubble speech-bubble--soft"><strong>What happens next</strong><span>We prepare your first mix: a follow-up campaign starting on the date you picked. Your first beat appears in Today for you to review before sending.</span></div>
    <button className="button primary" type="submit" disabled={!purposes.length}>Prepare my first follow-up</button>
    <div className="skip-setup-form"><button className="text-button" type="submit" formAction={skipOnboardingAction} formNoValidate>Skip for now</button></div>
  </form>;
}
