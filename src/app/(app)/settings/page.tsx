import type { Metadata } from "next";
import { Notice } from "@/components/Notice";
import { updateWorkspaceSettingsAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const [{ saved }, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const profile = workspace.profile;
  return (
    <div className="page">
      {saved && <Notice type="success">Settings saved.</Notice>}
      <header className="page-header"><div><h1>Settings</h1><p>Start with the essentials. Connect external systems only when they make your workflow easier.</p></div></header>
      <div className="dashboard-grid">
        <section>
          <div className="card">
            <div className="card-header"><div><h2>My business</h2><p>Used by approved message placeholders and the Mix Wizard.</p></div></div>
            <form action={updateWorkspaceSettingsAction} className="form-grid">
              <div className="field"><label htmlFor="company">Company</label><input id="company" name="company" defaultValue={profile?.company ?? workspace.name} /></div>
              <div className="field"><label htmlFor="industry">Industry</label><input id="industry" name="industry" defaultValue={profile?.industry ?? ""} /></div>
              <div className="field"><label htmlFor="product1">Primary product or service</label><input id="product1" name="product1" defaultValue={profile?.product1 ?? ""} /></div>
              <div className="field"><label htmlFor="timezone">Timezone</label><select id="timezone" name="timezone" defaultValue={profile?.timezone ?? "America/New_York"}><option value="America/New_York">Eastern</option><option value="America/Chicago">Central</option><option value="America/Denver">Mountain</option><option value="America/Los_Angeles">Pacific</option><option value="America/Phoenix">Arizona</option><option value="Pacific/Honolulu">Hawaii</option><option value="UTC">UTC</option></select></div>
              <div className="field"><label htmlFor="smsSignature">SMS signature</label><input id="smsSignature" name="smsSignature" defaultValue={profile?.smsSignature ?? ""} /></div>
              <div className="field"><label htmlFor="emailSignature">Email signature</label><textarea id="emailSignature" name="emailSignature" defaultValue={profile?.emailSignature ?? ""} /></div>
              <div className="form-actions field full"><button className="button primary" type="submit">Save settings</button></div>
            </form>
          </div>
        </section>
        <aside>
          <div className="card"><div className="card-header"><div><h2>Plan</h2><p>Billing integrations are optional during local testing.</p></div></div><span className="plan-pill">{workspace.planTier} · {workspace.subscriptionStatus}</span><p style={{ color: "var(--muted)" }}>Stripe Checkout and Customer Portal values can be added to <code>.env</code> when you are ready to test payments.</p></div>
          <div className="card"><div className="card-header"><div><h2>Connections</h2><p>Add these after the core workflow feels right.</p></div></div><div className="checklist"><div className="check-row"><span>○</span><span>Google Contacts</span></div><div className="check-row"><span>○</span><span>Microsoft Outlook</span></div><div className="check-row"><span>○</span><span>WhatsApp Assistant</span></div><div className="check-row"><span>○</span><span>Website inquiry webhook</span></div></div><p style={{ color: "var(--muted)" }}>Provider setup instructions are in <code>docs/INTEGRATIONS.md</code>.</p></div>
        </aside>
      </div>
    </div>
  );
}
