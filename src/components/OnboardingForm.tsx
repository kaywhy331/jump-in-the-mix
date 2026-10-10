"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeviceContactQuickAdd } from "@/components/DeviceContactQuickAdd";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { RequiredFieldsNote } from "@/components/RequiredFieldsNote";
import { StarterPreview } from "@/components/StarterPreview";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { FormResult } from "@/lib/form-errors";
import { LocalDateInput } from "@/components/LocalDateInput";
import { TimezonePicker } from "@/components/TimezonePicker";
import { BUSINESS_TYPES } from "@/lib/business-taxonomy";
import { completeOnboardingFormAction, skipOnboardingAction } from "@/lib/onboarding-actions";
import { onboardingReasons } from "@/lib/onboarding-options";
import { MegaMixSetup } from "@/components/MegaMixSetup";
import { suggestedMegaMix } from "@/lib/mega-mixes";
import type { JourneySetupValues } from "@/lib/journey-preferences";
import { marketingScenario } from "@/lib/marketing-scenarios";
import { splitContactName } from "@/lib/quick-add-capture";

type ContactOption = { id: string; displayName: string; firstName: string | null; lastName: string | null };

/** Enter in a field moves to the next one: only Start starts the follow-up (JITM-09 §2.11). Enter that confirms IME text
 * is left alone; Safari sends it after composition ends, with keyCode 229. */
function nextFieldOnEnter(event: KeyboardEvent<HTMLElement>) {
  const field = event.target;
  if (event.key !== "Enter" || event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !(field instanceof HTMLInputElement) || ["checkbox", "radio", "button", "submit", "reset", "file"].includes(field.type)) return;
  event.preventDefault();
  const fields = [...event.currentTarget.querySelectorAll<HTMLElement>("input:not([type=hidden]), select, textarea, button")].filter(element => !element.matches(":disabled") && element.getClientRects().length);
  fields[fields.indexOf(field) + 1]?.focus();
}

export function OnboardingForm({ userName, industry, timezone, today, locale, scenarioId, contacts, initialSetup, company, smsSignature, notices }: { userName: string; industry: string | null; timezone: string; today: string; locale: string; scenarioId?: string; contacts: ContactOption[]; initialSetup: JourneySetupValues; company?: string; smsSignature?: string; notices?: ReactNode }) {
  const router = useRouter();
  // One person and one follow-up is the start, on about two phone screens: the person first, then the follow-up and
  // its preview (JITM-09 §2.20, D73). A complete Mega-Mix or individual Mixes are a link away.
  const requestId = useRef("");
  const prepareFirstFollowUp = async (previous: FormResult, data: FormData): Promise<FormResult> => {
    requestId.current ||= globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    data.set("requestId", requestId.current);
    return completeOnboardingFormAction(previous, data);
  };
  const [setupMode, setSetupMode] = useState<"person" | "journey" | "individual">(initialSetup.preferences.draftSetupMode ?? "person");
  // Each view has its own heading. Switching views brings it into view and focuses it (JITM-10 §2.12); choosing between
  // the pipeline's two options doesn't.
  const heading = useRef<HTMLHeadingElement>(null), switched = useRef(false);
  const switchTo = (mode: "person" | "journey") => { switched.current = true; setSetupMode(mode); };
  useEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    heading.current?.scrollIntoView({ block: "start" }); heading.current?.focus({ preventScroll: true });
  }, [setupMode]);
  const [businessType, setBusinessType] = useState(industry ?? "Home services");
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);
  useEffect(() => { const refresh = () => router.refresh(); window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh); }, [router]);
  // An installed app opens a new tab in the browser, which keeps its own sign-in (iOS), so import in place there.
  const [standalone, setStandalone] = useState(false);
  useEffect(() => { setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true); }, []);
  const [contactId, setContactId] = useState("");
  const [personName, setPersonName] = useState("");
  const [businessName, setBusinessName] = useState(company ?? "");
  const [signature, setSignature] = useState(smsSignature ?? userName);
  const [followUpDate, setFollowUpDate] = useState(today);
  const [previewReady, setPreviewReady] = useState(false);
  const onPreviewAvailable = useCallback((available: boolean) => setPreviewReady(available), []);
  const scenario = marketingScenario(scenarioId);
  // A business type with its own journey, such as Real estate, offers that journey's first follow-ups.
  const reasons = onboardingReasons(["business"], businessType, scenario ? scenario.id : null);
  const [choice, setChoice] = useState(scenario ? "suggested" : reasons[0] ?? "");
  const selected = choice === "suggested" && scenario || reasons.includes(choice) ? choice : reasons[0] ?? "";
  // A saved person is previewed with their stored names, as the renderer reads them; a typed name splits as it's saved.
  const saved = contactId ? contacts.find(contact => contact.id === contactId) : undefined;
  const { firstName, lastName } = saved ? { firstName: saved.firstName ?? "", lastName: saved.lastName ?? "" } : splitContactName(personName);
  const choices = [...(scenario ? [{ value: "suggested", label: `${scenario.starterTitle}, from the example you tried` }] : []), ...reasons.map(reason => ({ value: reason, label: reason }))];
  const [noting, setNoting] = useState(false);
  const [signing, setSigning] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null), signatureRef = useRef<HTMLInputElement>(null);
  const oneView = setupMode === "person";
  useEffect(() => { if (noting) noteRef.current?.focus(); }, [noting]);
  useEffect(() => { if (signing) signatureRef.current?.focus(); }, [signing]);
  // The signature shows where it's used, in the preview, and opens for editing there. Its value is sent from one hidden
  // field outside the preview, so a preview that's updating or unavailable never drops it.
  const signatureControl = signing
    ? <label className="field onboarding-signature"><span>Sign texts as <small>optional</small></span><input ref={signatureRef} maxLength={160} enterKeyHint="next" value={signature} onChange={event => setSignature(event.target.value)} /></label>
    : <p className="onboarding-signature">Texts are signed “{signature.trim() || userName}”. <button type="button" className="text-button" onClick={() => setSigning(true)} aria-label="Change how you sign texts">Change</button></p>;
  return <>
    <h1 ref={heading} tabIndex={-1}>{oneView ? "Set up your first follow-up" : "Set up a whole pipeline"}</h1>
    {oneView && <p className="onboarding-intro">Add one person and see their first follow-up before anything is sent.</p>}
    {notices}
    <div hidden={oneView} className="onboarding-pipeline">
      <button type="button" className="text-button onboarding-way-back" onClick={() => switchTo("person")}>Start with one person and one follow-up instead</button>
      <fieldset className="onboarding-step-card"><legend className="sr-only">Set up a whole pipeline</legend><div className="form-stack"><label className="checkbox-card"><input type="radio" name="setupMode" checked={setupMode === "journey"} onChange={() => setSetupMode("journey")} /><span><strong>A complete Mega-Mix</strong><small>Your whole pipeline on day one: every follow-up from first inquiry to repeat work, written and connected. Just tweak the wording to sound like you.</small></span></label><label className="checkbox-card"><input type="radio" name="setupMode" checked={setupMode === "individual"} onChange={() => setSetupMode("individual")} /><span><strong>Choose individual Mixes</strong><small>Build your journey one Mix at a time. Preview and customize each one.</small></span></label></div></fieldset>
      <MegaMixSetup initialId={initialSetup.preferences.draftBlueprintId || suggestedMegaMix(industry, scenarioId)} initialSetup={initialSetup} onboarding={{ userName, company, smsSignature }} individual={setupMode === "individual"} active={!oneView} />
    </div>
    <div hidden={!oneView} onKeyDown={nextFieldOnEnter}><ActionForm action={prepareFirstFollowUp} className="form-stack onboarding-one-person" protect={oneView}>
      {/* The first submit button is the form's default for Enter. This hidden one cancels its own click, so Enter never
          starts the follow-up from a field, even one the handler above doesn't move from. */}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} onClick={event => event.preventDefault()} />
      <RequiredFieldsNote />
      <input type="hidden" name="useCase" value="business" />
      <input type="hidden" name="smsSignature" value={signature} />
      <fieldset className="onboarding-step-card">
        <legend>Who to follow up with</legend>
        {contacts.length > 0 && <label className="field"><span>Choose a saved person</span><select name="contactId" value={contactId} onChange={event => setContactId(event.target.value)}><option value="">Add someone new</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select></label>}
        {!contactId && <div className="form-grid onboarding-pair">
          <div className="field full"><label htmlFor="contactName">Name</label><input id="contactName" name="contactName" autoComplete="name" placeholder="Jordan Lee" required enterKeyHint="next" value={personName} onChange={event => setPersonName(event.target.value)} /></div>
          <div className="field"><label htmlFor="contactPhone">Mobile phone <small>optional</small></label><input id="contactPhone" name="contactPhone" inputMode="tel" autoComplete="tel" placeholder="(555) 555-0123" enterKeyHint="next" aria-describedby="contact-methods-help" /></div>
          <div className="field"><label htmlFor="contactEmail">Email <small>optional</small></label><input id="contactEmail" name="contactEmail" type="email" inputMode="email" autoComplete="email" enterKeyHint="next" aria-describedby="contact-methods-help" /></div>
          <small id="contact-methods-help">A text needs a mobile number. You can add it later.</small>
        </div>}
        <details className="onboarding-import">
          <summary>Have a list? Import a file</summary>
          <div className="form-stack">
            <div className="form-actions"><Link className="button" href="/contacts/import?onboarding=1" target={standalone ? undefined : "_blank"} rel={standalone ? undefined : "noopener"}>Import contacts from a file</Link><button className="button" type="button" onClick={() => router.refresh()}>Refresh imported contacts</button></div>
            <small>{standalone ? "File import opens on this screen. Choose Open setup there to come back; answers you haven’t saved here are not kept." : "File import opens in another tab so your setup stays here. Return to this tab after importing; your saved people refresh automatically."}</small>
            <DeviceContactQuickAdd onboarding />
          </div>
        </details>
      </fieldset>
      <fieldset className="onboarding-step-card">
        <legend>Your business</legend>
        <div className="form-grid onboarding-pair">
          <label className="field"><span>Type of business</span><select name="businessType" value={businessType} onChange={event => setBusinessType(event.target.value)}>{[...new Set([...BUSINESS_TYPES, ...(industry ? [industry] : [])])].map(type => <option key={type}>{type}</option>)}</select></label>
          <label className="field"><span>Business name <small>optional</small></span><input name="businessName" autoComplete="organization" placeholder="Lee Plumbing" maxLength={200} enterKeyHint="next" value={businessName} onChange={event => setBusinessName(event.target.value)} /></label>
        </div>
      </fieldset>
      <fieldset className="onboarding-step-card">
        <legend>The follow-up</legend>
        <input type="hidden" name="starterChoice" value={selected === "suggested" ? "suggested" : "choose"} />
        <label className="field"><span>What’s it about?</span><select name="reason" value={selected} onChange={event => setChoice(event.target.value)} required>{choices.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {/* The note's field is always in the form, so opening it doesn't count as a change (JITM-08 §2.30). */}
        <label className="field" hidden={!noting}><span>What should you remember? <small>optional</small></span><textarea ref={noteRef} name="privateContext" maxLength={1000} rows={2} placeholder="What did you discuss, and what timing or promise matters?" /></label>
        {!noting && <button type="button" className="text-button onboarding-note-toggle" onClick={() => setNoting(true)}>Add a private note</button>}
        <div className="form-grid onboarding-pair">
          <div className="field"><label htmlFor="followUpDate">Follow up on</label><LocalDateInput id="followUpDate" name="followUpDate" initialValue={today} timezone={selectedTimezone} onValueChange={setFollowUpDate} /></div>
          <div className="field onboarding-timezone"><TimezonePicker defaultValue={timezone} onChange={setSelectedTimezone} confirmDetection={timezone === "UTC"} label="Your timezone" /></div>
        </div>
      </fieldset>
      <StarterPreview reason={selected === "suggested" ? scenario?.reason ?? reasons[0] : selected} businessType={businessType} scenarioId={selected === "suggested" ? scenario?.id : undefined} details={{ firstName, lastName, company: businessName, smsSignature: signature, ownerName: userName }} firstDate={followUpDate} timezone={selectedTimezone} locale={locale} onAvailable={onPreviewAvailable}>{signatureControl}</StarterPreview>
      <FormSubmitButton label={firstName ? `Start ${firstName}’s follow-up` : "Start the follow-up"} pendingLabel="Starting the follow-up…" disabled={!previewReady} describedBy={previewReady ? undefined : "starter-preview-status"} />
      <div className="skip-setup-form onboarding-alternatives"><button className="text-button" type="submit" formAction={skipOnboardingAction} formNoValidate>Skip for now</button><button type="button" className="text-button" onClick={() => switchTo("journey")}>Set up a whole pipeline instead</button></div>
    </ActionForm></div>
  </>;
}
