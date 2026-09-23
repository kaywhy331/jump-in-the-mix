"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeviceContactQuickAdd } from "@/components/DeviceContactQuickAdd";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { StarterPreview } from "@/components/StarterPreview";
import { useEffect, useState } from "react";
import { LocalDateInput } from "@/components/LocalDateInput";
import { TimezonePicker } from "@/components/TimezonePicker";
import { BUSINESS_TYPES } from "@/lib/business-taxonomy";
import { completeOnboardingFormAction, skipOnboardingAction } from "@/lib/onboarding-actions";
import { ONBOARDING_USES, onboardingReasons, type OnboardingUse } from "@/lib/onboarding-options";
import { MegaMixSetup } from "@/components/MegaMixSetup";
import { suggestedMegaMix } from "@/lib/mega-mixes";
import type { JourneySetupValues } from "@/lib/journey-preferences";
import { marketingScenario } from "@/lib/marketing-scenarios";

type ContactOption = { id: string; displayName: string };
export function OnboardingForm({ userName, industry, initialUses, timezone, today, scenarioId, contacts, initialSetup, company, smsSignature }: { userName: string; industry: string | null; initialUses: OnboardingUse[]; timezone: string; today: string; scenarioId?: string; contacts: ContactOption[]; initialSetup: JourneySetupValues; company?: string; smsSignature?: string }) {
  const router = useRouter();
  const [setupMode, setSetupMode] = useState<"person" | "journey" | "individual">(initialSetup.preferences.draftSetupMode ?? "journey");
  const [purposes, setPurposes] = useState<OnboardingUse[]>(initialUses);
  const [businessType, setBusinessType] = useState(industry ?? "Home services");
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);
  useEffect(() => { const refresh = () => router.refresh(); window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh); }, [router]);
  const [contactId, setContactId] = useState("");
  const scenario = marketingScenario(scenarioId);
  const business = purposes.includes("business");
  const organization = business || purposes.includes("networking");
  const reasons = onboardingReasons(purposes);
  const [choice, setChoice] = useState(scenario && business ? "suggested" : reasons[0] ?? "");
  const selected = choice === "suggested" && scenario && business || reasons.includes(choice) ? choice : reasons[0] ?? "";
  return <><fieldset className="onboarding-step-card"><legend>Choose your starting point</legend><div className="form-stack"><label className="checkbox-card"><input type="radio" name="setupMode" checked={setupMode === "journey"} onChange={() => setSetupMode("journey")} /><span><strong>A complete mega-mix · Recommended</strong><small>Connected mixes for your whole journey, tailored to how you work.</small></span></label><label className="checkbox-card"><input type="radio" name="setupMode" checked={setupMode === "individual"} onChange={() => setSetupMode("individual")} /><span><strong>Choose individual mixes</strong><small>Build your journey one Mix at a time. Preview and customize each one.</small></span></label><label className="checkbox-card"><input type="radio" name="setupMode" checked={setupMode === "person"} onChange={() => setSetupMode("person")} /><span><strong>Other uses or one follow-up</strong><small>Personal connections, another kind of business, or a simple start with one person.</small></span></label></div></fieldset>
  <div hidden={setupMode === "person"}><MegaMixSetup initialId={initialSetup.preferences.draftBlueprintId || suggestedMegaMix(industry, scenarioId)} initialSetup={initialSetup} onboarding={{ userName, company, smsSignature }} individual={setupMode === "individual"} active={setupMode !== "person"} />{setupMode === "individual" && <button type="button" className="text-button" onClick={() => setSetupMode("person")}>Start with one person and one follow-up instead</button>}</div>
  <div hidden={setupMode !== "person"}><ActionForm action={completeOnboardingFormAction} className="form-stack" protect={setupMode === "person"}>
    <fieldset className="onboarding-step-card">
      <legend><span>1</span> Make this fit your life</legend>
      <div className="form-stack">
        <p id="use-case-help">How will you use Jump in the Mix? Select all that apply.</p>
        {ONBOARDING_USES.map(option => <label className="checkbox-card" key={option.id}><input type="checkbox" name="useCase" value={option.id} checked={purposes.includes(option.id)} aria-describedby="use-case-help" onChange={event => setPurposes(current => event.target.checked ? [...current, option.id] : current.filter(id => id !== option.id))} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}
        {business && <label className="field"><span>Type of business</span><select name="businessType" value={businessType} onChange={event => setBusinessType(event.target.value)}>{[...new Set([...BUSINESS_TYPES, ...(industry ? [industry] : [])])].map(type => <option key={type}>{type}</option>)}</select><small>We’ll suggest mixes that fit your work.</small></label>}
      </div>
    </fieldset>
    <details className="onboarding-step-card">
      <summary>Optional business details and signature</summary>
      <div className="form-grid">
        {organization && <label className="field"><span>{business ? "Business name (optional)" : "Organization (optional)"}</span><input name="businessName" autoComplete="organization" placeholder={business ? "Lee Plumbing" : "Company, community, or group"} maxLength={200}  /></label>}
        <label className={!organization ? "field full" : "field"}><span>How do you sign texts?</span><input name="smsSignature" defaultValue={userName} maxLength={160} required /></label>
      </div>
    </details>
    <fieldset className="onboarding-step-card">
      <legend><span>2</span> Choose a starting point</legend>
      <div className="form-stack">
        <input type="hidden" name="starterChoice" value={selected === "suggested" ? "suggested" : "choose"} />
        <label className="field"><span>What do you want to do?</span><select name="reason" value={selected} onChange={event => setChoice(event.target.value)} required disabled={!purposes.length}>
          {scenario && business && <option value="suggested">{scenario.starterTitle} — from the example you tried</option>}
          {reasons.map(reason => <option key={reason}>{reason}</option>)}
        </select><small>Choose one follow-up to start with. You can add more later.</small></label>
      </div>
    </fieldset>
    <fieldset className="onboarding-step-card">
      <legend><span>3</span> Add your first person</legend>
      <div className="form-stack">
        <div className="form-actions"><Link className="button" href="/contacts/import?onboarding=1" target="_blank" rel="noopener">Import contacts from a file</Link><button className="button" type="button" onClick={() => router.refresh()}>Refresh imported contacts</button></div>
        <small>File import opens in another tab so your setup stays here. Return to this tab after importing; your saved people refresh automatically.</small>
        <DeviceContactQuickAdd onboarding />
        {contacts.length > 0 && <label className="field"><span>Choose a saved person</span><select name="contactId" value={contactId} onChange={event => setContactId(event.target.value)}><option value="">Add someone new</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select></label>}
      </div>
      <div className="form-grid">
        {!contactId && <><div className="field full"><label htmlFor="contactName">Name</label><input id="contactName" name="contactName" autoComplete="name" placeholder="Jordan Lee" required /></div>
        <div className="field"><label htmlFor="contactPhone">Phone <small>recommended</small></label><input id="contactPhone" name="contactPhone" inputMode="tel" autoComplete="tel" placeholder="(555) 555-0123" /></div>
        <div className="field"><label htmlFor="contactEmail">Email <small>recommended</small></label><input id="contactEmail" name="contactEmail" type="email" inputMode="email" autoComplete="email" /></div></>}
        <label className="field full"><span>What should you remember?</span><textarea name="privateContext" maxLength={1000} rows={3} placeholder="What did you discuss, and what timing or promise matters?" /></label>
        <div className="field"><label htmlFor="followUpDate">Follow up on</label><LocalDateInput id="followUpDate" name="followUpDate" initialValue={today} timezone={selectedTimezone} /></div>
        <div className="field full"><label htmlFor="timezone">Your timezone</label><TimezonePicker defaultValue={timezone} onChange={setSelectedTimezone} /></div>
      </div>
    </fieldset>
    <StarterPreview purposes={purposes} reason={selected === "suggested" ? scenario?.reason ?? reasons[0] : selected} businessType={businessType} scenarioId={selected === "suggested" ? scenario?.id : undefined} />
    <p>If you save someone without a phone or email, we save the reminder and ask you to add their contact details before sending.</p>
    <FormSubmitButton label="Prepare my first follow-up" pendingLabel="Preparing your follow-up…" />
    <div className="skip-setup-form"><button className="text-button" type="submit" formAction={skipOnboardingAction} formNoValidate>Skip for now</button></div>
  </ActionForm></div></>;
}
