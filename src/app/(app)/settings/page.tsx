import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { updateWorkspaceSettingsAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const [{ saved }, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const profile = workspace.profile;
  return (
    <div className="page">
      {saved && <Notice type="success">My Info saved.</Notice>}
      <header className="page-header"><div><h1>Settings</h1><p>Manage reusable Jumps, Mixes, trigger classifications, and personalization.</p></div></header>

      <div className="settings-hub-grid">
        <Link className="settings-hub-card" href="/settings/jumps"><span className="settings-hub-icon">↗</span><span><strong>Jumps</strong><small>Reusable messages, call scripts, and voicemail content.</small></span></Link>
        <Link className="settings-hub-card" href="/mixes"><span className="settings-hub-icon">⎇</span><span><strong>Mixes</strong><small>Ordered Jump sequences, triggers, audiences, and timing.</small></span></Link>
        <Link className="settings-hub-card" href="/settings/jump-date-types"><span className="settings-hub-icon">◫</span><span><strong>Jump Date Types</strong><small>Manage custom trigger classifications and active plan limits.</small></span></Link>
        <a className="settings-hub-card" href="#my-info"><span className="settings-hub-icon">✎</span><span><strong>My Info</strong><small>Your business context, timezone, and signatures.</small></span></a>
      </div>

      <div className="dashboard-grid" id="my-info">
        <section>
          <div className="card">
            <div className="card-header"><div><h2>My Info</h2><p>Used by approved dynamic placeholders and the AI Mix Wizard.</p></div></div>
            <form action={updateWorkspaceSettingsAction} className="form-grid">
              <div className="field"><label htmlFor="company">Company</label><input id="company" name="company" defaultValue={profile?.company ?? workspace.name} /></div>
              <div className="field"><label htmlFor="industry">Industry</label><input id="industry" name="industry" defaultValue={profile?.industry ?? ""} /></div>
              <div className="field"><label htmlFor="product1">Primary product or service</label><input id="product1" name="product1" defaultValue={profile?.product1 ?? ""} /></div>
              <div className="field"><label htmlFor="timezone">Timezone</label><select id="timezone" name="timezone" defaultValue={profile?.timezone ?? "America/New_York"}><option value="America/New_York">Eastern</option><option value="America/Chicago">Central</option><option value="America/Denver">Mountain</option><option value="America/Los_Angeles">Pacific</option><option value="America/Phoenix">Arizona</option><option value="Pacific/Honolulu">Hawaii</option><option value="UTC">UTC</option></select></div>
              <div className="field"><label htmlFor="smsSignature">SMS signature</label><input id="smsSignature" name="smsSignature" defaultValue={profile?.smsSignature ?? ""} /></div>
              <div className="field"><label htmlFor="emailSignature">Email signature</label><textarea id="emailSignature" name="emailSignature" defaultValue={profile?.emailSignature ?? ""} /></div>
              <div className="form-actions field full"><button className="button primary" type="submit">Save My Info</button></div>
            </form>
          </div>
        </section>
        <aside>
          <div className="card"><div className="card-header"><div><h2>Plan</h2><p>Entitlements are enforced by server actions and background jobs.</p></div></div><span className="plan-pill">{workspace.planTier} · {workspace.subscriptionStatus}</span><p className="muted-copy">Stripe Checkout and Customer Portal remain a later implementation package.</p></div>
          <div className="card"><div className="card-header"><div><h2>Connections</h2><p>Account-level integrations are managed separately from application settings.</p></div></div><div className="checklist"><div className="check-row"><span>✓</span><span>Google Contacts · Plus/Pro</span></div><div className="check-row"><span>○</span><span>Microsoft Outlook · later</span></div><div className="check-row"><span>○</span><span>WhatsApp Assistant · later</span></div><div className="check-row"><span>○</span><span>Website inquiry webhook · later</span></div></div><Link className="button" href="/account#google-contacts">Manage connections</Link></div>
        </aside>
      </div>
    </div>
  );
}
