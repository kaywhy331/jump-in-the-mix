import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { completeOnboardingAction, skipOnboardingAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";

export const metadata: Metadata = { title: "Quick setup" };

export default async function OnboardingPage() {
  const { workspace, user } = await requireWorkspace();
  const profile = workspace.profile;

  return (
    <main className="onboarding-shell">
      <div className="onboarding-top">
        <Logo />
        <span className="setup-step">Quick setup · one screen</span>
      </div>
      <section className="onboarding-card">
        <span className="eyebrow">Three-minute setup</span>
        <h1>Let&apos;s make the app useful before showing you everything.</h1>
        <p className="onboarding-intro">
          These details help Jump in the Mix recommend sensible language and follow-up plans. Only your business name and primary goal are needed.
        </p>
        <form action={completeOnboardingAction} className="form-grid">
          <div className="field full">
            <label htmlFor="primaryGoal">What would you most like help remembering?</label>
            <select id="primaryGoal" name="primaryGoal" defaultValue={profile?.primaryGoal ?? "Follow up with leads"} required>
              <option>Follow up with leads</option>
              <option>Stay connected with clients</option>
              <option>Manage referrals</option>
              <option>Remember renewals and important dates</option>
              <option>Onboard new clients</option>
              <option>Reconnect with past customers</option>
              <option>Personal relationships</option>
            </select>
          </div>
          <div className="field"><label htmlFor="company">Business or workspace name</label><input id="company" name="company" defaultValue={profile?.company ?? workspace.name} required /></div>
          <div className="field"><label htmlFor="industry">Industry</label><input id="industry" name="industry" placeholder="Consulting, real estate, photography…" defaultValue={profile?.industry ?? ""} /></div>
          <div className="field"><label htmlFor="product1">Primary product or service</label><input id="product1" name="product1" placeholder="Business consulting" defaultValue={profile?.product1 ?? ""} /></div>
          <div className="field"><label htmlFor="timezone">Timezone</label><select id="timezone" name="timezone" defaultValue={profile?.timezone ?? "America/New_York"}><option value="America/New_York">Eastern</option><option value="America/Chicago">Central</option><option value="America/Denver">Mountain</option><option value="America/Los_Angeles">Pacific</option><option value="America/Phoenix">Arizona</option><option value="Pacific/Honolulu">Hawaii</option><option value="UTC">UTC</option></select></div>
          <div className="field"><label htmlFor="smsSignature">SMS signature</label><input id="smsSignature" name="smsSignature" placeholder={`— ${user.name}`} defaultValue={profile?.smsSignature ?? ""} /></div>
          <div className="field"><label htmlFor="emailSignature">Email signature</label><textarea id="emailSignature" name="emailSignature" placeholder={`${user.name}\n${workspace.name}`} defaultValue={profile?.emailSignature ?? ""} /></div>
          <label className="checkbox-card field full onboarding-default"><input type="checkbox" name="createStarterMix" defaultChecked /><span><strong>Set up a simple follow-up plan for me</strong><small>You can review or change it later. This removes one setup step.</small></span></label>
          <div className="form-actions field full"><button className="button primary" type="submit">Finish setup and see my dashboard</button></div>
        </form>
        <form action={skipOnboardingAction} className="skip-setup-form">
          <button className="text-button" type="submit">Skip for now and explore with sensible defaults</button>
        </form>
      </section>
    </main>
  );
}
