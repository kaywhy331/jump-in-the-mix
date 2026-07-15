import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { createWizardMixAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/plans";

export const metadata: Metadata = { title: "AI Mix Wizard" };

export default async function MixWizardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const allowed = PLAN_LIMITS[workspace.planTier].aiWizard;

  if (!allowed) {
    return <div className="page"><header className="page-header"><div><h1>AI Mix Wizard</h1><p>A guided preflight form that turns your goal into a complete follow-up sequence.</p></div></header><Notice type="info">The AI Mix Wizard is included with Plus and Pro. You can still create a simple starter Mix from the Mixes page.</Notice><Link href="/mixes" className="button primary">Return to Mixes</Link></div>;
  }

  return (
    <div className="page">
      <header className="page-header"><div><h1>AI Mix Wizard</h1><p>Answer the preflight questions once. The wizard will structure the cadence and messages without a long AI conversation.</p></div></header>
      {error && <Notice type="error">{error}</Notice>}
      <section className="card">
        <form action={createWizardMixAction} className="form-grid">
          <div className="field full"><label htmlFor="objective">What should this Mix accomplish?</label><select id="objective" name="objective"><option>Book Discovery Calls</option><option>Follow Up With New Leads</option><option>Client Onboarding</option><option>Renewal and Retention</option><option>Re-engage Past Contacts</option><option>Referral Outreach</option><option>Event Follow-Up</option><option>General Check-In</option></select></div>
          <div className="field"><label htmlFor="tone">Tone</label><select id="tone" name="tone"><option>Warm</option><option>Professional</option><option>Conversational</option><option>Direct</option></select></div>
          <div className="field"><label htmlFor="productPlaceholder">Product or service</label><select id="productPlaceholder" name="productPlaceholder"><option>{"{{My Product 1}}"}</option><option>{"{{My Product 2}}"}</option><option>{"{{My Product 3}}"}</option><option value="">Do not reference a product</option></select></div>
          <div className="field"><label htmlFor="durationDays">Duration</label><select id="durationDays" name="durationDays" defaultValue="14"><option value="7">7 days</option><option value="14">14 days</option><option value="21">21 days</option><option value="30">30 days</option></select></div>
          <div className="field"><label htmlFor="touches">Intensity</label><select id="touches" name="touches" defaultValue="5"><option value="3">Light · 3 touches</option><option value="5">Balanced · 5 touches</option><option value="7">Persistent · 7 touches</option></select></div>
          <div className="field full"><span className="field-label">Channels</span><div className="checkbox-row"><label className="checkbox-card"><input type="checkbox" name="channels" value="EMAIL" defaultChecked />Email</label><label className="checkbox-card"><input type="checkbox" name="channels" value="SMS" defaultChecked />SMS</label><label className="checkbox-card"><input type="checkbox" name="channels" value="PHONE_CALL" defaultChecked />Phone call</label><label className="checkbox-card"><input type="checkbox" name="channels" value="WHATSAPP" />WhatsApp</label></div></div>
          <div className="field full"><Notice type="info">The first version will be saved as a draft. It uses only approved placeholders and never inserts unstructured contact notes.</Notice></div>
          <div className="form-actions field full"><Link href="/mixes" className="button">Cancel</Link><button type="submit" className="button primary">Generate Mix draft</button></div>
        </form>
      </section>
    </div>
  );
}
