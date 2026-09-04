import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { LocalDateInput } from "@/components/LocalDateInput";
import { Notice } from "@/components/Notice";
import { TimezonePicker } from "@/components/TimezonePicker";
import { requireWorkspace } from "@/lib/auth";
import { completeOnboardingAction, skipOnboardingAction } from "@/lib/onboarding-actions";

export const metadata: Metadata = { title: "Create your first follow-up" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [params, { workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="onboarding-shell">
      <div className="onboarding-top"><Logo /><span className="setup-step">Set up your business · about 3 minutes</span></div>
      <section className="onboarding-card first-win-onboarding">
        <span className="eyebrow">Start with one customer</span>
        <h1>Never let a good customer go quiet</h1>
        <p className="onboarding-intro">Tell us what you do, then add one person. We’ll prepare the first follow-up for you.</p>
        {params.error && <Notice type="error">{params.error}</Notice>}
        <form action={completeOnboardingAction} className="form-stack">
          <fieldset className="onboarding-step-card">
            <legend><span>1</span> What do you do?</legend>
            <div className="onboarding-business-types">
              <label className="checkbox-card"><input type="radio" name="businessType" value="Home services" defaultChecked /><span><strong>Home services</strong><small>Plumbing, HVAC, electrical, and other trades</small></span></label>
              <label className="checkbox-card"><input type="radio" name="businessType" value="Real estate" /><span><strong>Real estate</strong><small>Agents, brokers, and property professionals</small></span></label>
              <label className="checkbox-card"><input type="radio" name="businessType" value="Insurance & finance" /><span><strong>Insurance &amp; finance</strong><small>Advisors, agents, and local firms</small></span></label>
              <label className="checkbox-card"><input type="radio" name="businessType" value="Other" /><span><strong>Something else</strong><small>Use the flexible starter plan</small></span></label>
            </div>
          </fieldset>
          <fieldset className="onboarding-step-card">
            <legend><span>2</span> Make messages yours</legend>
            <div className="form-grid">
              <div className="field"><label htmlFor="businessName">Business name</label><input id="businessName" name="businessName" autoComplete="organization" placeholder="Lee Plumbing" required autoFocus /></div>
              <div className="field"><label htmlFor="smsSignature">How do you sign texts?</label><input id="smsSignature" name="smsSignature" defaultValue={user.name} maxLength={160} required /></div>
            </div>
          </fieldset>
          <fieldset className="onboarding-step-card">
            <legend><span>3</span> Add your first person</legend>
            <div className="form-grid">
              <div className="field full"><label htmlFor="contactName">Name</label><input id="contactName" name="contactName" autoComplete="name" placeholder="Jordan Lee" required /></div>
              <div className="field"><label htmlFor="contactPhone">Phone <small>recommended</small></label><input id="contactPhone" name="contactPhone" inputMode="tel" autoComplete="tel" placeholder="(555) 555-0123" /></div>
              <div className="field"><label htmlFor="contactEmail">Email <small>optional</small></label><input id="contactEmail" name="contactEmail" type="email" inputMode="email" autoComplete="email" /></div>
              <div className="field"><label htmlFor="reason">What should you remember?</label><select id="reason" name="reason" defaultValue="Follow up about an estimate"><option>Follow up about an estimate</option><option>Check in after the job</option><option>Ask for a review</option><option>Reconnect</option><option>General follow-up</option></select></div>
              <div className="field"><label htmlFor="followUpDate">Follow up on</label><LocalDateInput id="followUpDate" name="followUpDate" initialValue={today} /></div>
              <div className="field full"><label htmlFor="timezone">Your timezone</label><TimezonePicker defaultValue={workspace.profile?.timezone ?? "UTC"} confirmDetection /></div>
            </div>
          </fieldset>
          <div className="onboarding-preview"><strong>What happens next</strong><span>We create a warm three-step plan, prepare the first message, and take you to Today.</span></div>
          <button className="button primary" type="submit">Prepare my first follow-up</button>
          <div className="skip-setup-form"><button className="text-button" type="submit" formAction={skipOnboardingAction} formNoValidate>Skip for now</button></div>
        </form>
      </section>
    </main>
  );
}
