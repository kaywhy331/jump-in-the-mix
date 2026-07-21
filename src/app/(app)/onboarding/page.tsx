import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { TimezonePicker } from "@/components/TimezonePicker";
import { requireWorkspace } from "@/lib/auth";
import { completeOnboardingAction, skipOnboardingAction } from "@/lib/onboarding-actions";

export const metadata: Metadata = { title: "Create your first follow-up" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [params, { workspace }, store] = await Promise.all([searchParams, requireWorkspace(), cookies()]);
  const planIntent = store.get("jitm_plan_intent")?.value ?? "";
  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="onboarding-shell">
      <div className="onboarding-top"><Logo /><span className="setup-step">Your first follow-up · about 2 minutes</span></div>
      <section className="onboarding-card first-win-onboarding">
        <span className="eyebrow">Start with one relationship</span>
        <h1>Who would you like to remember?</h1>
        <p className="onboarding-intro">Add one person and one Important Date. We will create a simple follow-up plan and show you the first prepared action before you explore anything else.</p>
        {params.error && <Notice type="error">{params.error}</Notice>}
        <form action={completeOnboardingAction} className="form-stack">
          <input type="hidden" name="planIntent" value={planIntent} />
          <fieldset className="onboarding-step-card">
            <legend><span>1</span> Add one person</legend>
            <div className="form-grid">
              <div className="field full"><label htmlFor="contactName">Name</label><input id="contactName" name="contactName" autoComplete="name" placeholder="Jordan Lee" required autoFocus /></div>
              <div className="field"><label htmlFor="contactEmail">Email <small>optional</small></label><input id="contactEmail" name="contactEmail" type="email" inputMode="email" autoComplete="email" /></div>
              <div className="field"><label htmlFor="contactPhone">Phone <small>optional</small></label><input id="contactPhone" name="contactPhone" inputMode="tel" autoComplete="tel" /></div>
            </div>
          </fieldset>
          <fieldset className="onboarding-step-card">
            <legend><span>2</span> Say why and when</legend>
            <div className="form-grid">
              <div className="field"><label htmlFor="reason">What do you want to remember?</label><select id="reason" name="reason" defaultValue="Follow up"><option>Follow up</option><option>Check in after a meeting</option><option>Ask about a referral</option><option>Discuss a renewal</option><option>Reconnect</option></select></div>
              <div className="field"><label htmlFor="followUpDate">Important Date</label><input id="followUpDate" name="followUpDate" type="date" min={today} defaultValue={today} required /></div>
              <div className="field full"><label htmlFor="timezone">Timezone</label><TimezonePicker defaultValue={workspace.profile?.timezone ?? "UTC"} confirmDetection/></div>
            </div>
          </fieldset>
          <div className="onboarding-preview"><strong>What happens next</strong><span>We create a warm three-step Mix (follow-up plan), schedule the first Jump, and take you directly to Today.</span></div>
          <button className="button primary" type="submit">Create my first Jump</button>
          <div className="skip-setup-form"><button className="text-button" type="submit" formAction={skipOnboardingAction} formNoValidate>Skip and explore with a starter Mix</button></div>
        </form>
      </section>
    </main>
  );
}
