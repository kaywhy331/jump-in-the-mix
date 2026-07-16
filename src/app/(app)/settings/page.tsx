import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateWorkspaceProfileAction } from "@/lib/workspace-profile-actions";

export const metadata: Metadata = { title: "Settings" };

type SearchParams = { saved?: string; error?: string };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const [profile, contributorProfile] = await Promise.all([
    Promise.resolve(workspace.profile),
    prisma.sharedMixContributorProfile.findUnique({ where: { workspaceId: workspace.id } })
  ]);
  return (
    <div className="page">
      {params.saved && <Notice type="success">My Info and Community Public Profile saved.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header"><div><h1>Settings</h1><p>Manage reusable Jumps, Mixes, templates, trigger classifications, and personalization.</p></div></header>

      <div className="settings-hub-grid">
        <Link className="settings-hub-card" href="/settings/jumps"><span className="settings-hub-icon">↗</span><span><strong>Jumps</strong><small>Reusable messages, call scripts, and voicemail content.</small></span></Link>
        <Link className="settings-hub-card" href="/mixes"><span className="settings-hub-icon">⎇</span><span><strong>Mixes</strong><small>Ordered Jump sequences, triggers, audiences, and timing.</small></span></Link>
        <Link className="settings-hub-card" href="/templates"><span className="settings-hub-icon">◇</span><span><strong>Mix Templates</strong><small>Preview official and Community sequences, then import an editable Draft.</small></span></Link>
        <Link className="settings-hub-card" href="/settings/jump-date-types"><span className="settings-hub-icon">◫</span><span><strong>Jump Date Types</strong><small>Manage custom trigger classifications and active plan limits.</small></span></Link>
        <a className="settings-hub-card" href="#my-info"><span className="settings-hub-icon">✎</span><span><strong>My Info</strong><small>Your business context, timezone, signatures, and public contributor profile.</small></span></a>
      </div>

      <form action={updateWorkspaceProfileAction} className="settings-profile-layout">
        <section className="card" id="my-info">
          <div className="card-header"><div><h2>My Info</h2><p>Optional business details used by approved dynamic placeholders and the AI Mix Wizard.</p></div></div>
          <div className="form-grid">
            <div className="field"><label htmlFor="company">Company</label><input id="company" name="company" defaultValue={profile?.company ?? workspace.name} /></div>
            <div className="field"><label htmlFor="industry">Industry</label><input id="industry" name="industry" defaultValue={profile?.industry ?? ""} /></div>
            <div className="field"><label htmlFor="website">Website</label><input id="website" name="website" type="url" inputMode="url" defaultValue={profile?.website ?? ""} placeholder="https://example.com" /></div>
            <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" inputMode="tel" defaultValue={profile?.phone ?? ""} /></div>
            <div className="field full"><label htmlFor="street">Street address</label><input id="street" name="street" defaultValue={profile?.street ?? ""} /></div>
            <div className="field"><label htmlFor="city">City</label><input id="city" name="city" defaultValue={profile?.city ?? ""} /></div>
            <div className="field"><label htmlFor="state">State or region</label><input id="state" name="state" defaultValue={profile?.state ?? ""} /></div>
            <div className="field"><label htmlFor="postalCode">Postal code</label><input id="postalCode" name="postalCode" defaultValue={profile?.postalCode ?? ""} /></div>
            <div className="field"><label htmlFor="timezone">Timezone</label><select id="timezone" name="timezone" defaultValue={profile?.timezone ?? "America/New_York"}><option value="America/New_York">Eastern</option><option value="America/Chicago">Central</option><option value="America/Denver">Mountain</option><option value="America/Los_Angeles">Pacific</option><option value="America/Phoenix">Arizona</option><option value="Pacific/Honolulu">Hawaii</option><option value="UTC">UTC</option></select></div>
            <div className="field full"><label htmlFor="mailingAddress">Mailing address</label><textarea id="mailingAddress" name="mailingAddress" defaultValue={profile?.mailingAddress ?? ""} /></div>
            {[1, 2, 3, 4, 5].map((number) => {
              const key = `product${number}` as const;
              return <div className="field" key={key}><label htmlFor={key}>Product or service {number}</label><input id={key} name={key} defaultValue={profile?.[key] ?? ""} /></div>;
            })}
            {[1, 2, 3].map((number) => {
              const key = `myCustom${number}` as const;
              return <div className="field" key={key}><label htmlFor={key}>My custom field {number}</label><input id={key} name={key} defaultValue={profile?.[key] ?? ""} /></div>;
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-header"><div><h2>Signatures</h2><p>Reusable endings available through My Info placeholders.</p></div></div>
          <div className="form-grid">
            <div className="field full"><label htmlFor="smsSignature">SMS signature</label><input id="smsSignature" name="smsSignature" defaultValue={profile?.smsSignature ?? ""} /></div>
            <div className="field full"><label htmlFor="emailSignature">Email signature</label><textarea id="emailSignature" name="emailSignature" defaultValue={profile?.emailSignature ?? ""} /></div>
          </div>
        </section>

        <section className="card" id="community-profile">
          <div className="card-header"><div><h2>Community Public Profile</h2><p>Shown beside approved Mixes you contribute. Profile edits update every shared template automatically.</p></div></div>
          <div className="form-grid">
            <label className="checkbox-card field full"><input type="checkbox" name="communityProfileEnabled" defaultChecked={contributorProfile?.enabled ?? false} /><span><strong>Make this profile available for Community contributions</strong><small>Your private account email and workspace data are never exposed.</small></span></label>
            <div className="field"><label htmlFor="communityDisplayName">Display name</label><input id="communityDisplayName" name="communityDisplayName" defaultValue={contributorProfile?.displayName ?? ""} maxLength={120} /></div>
            <div className="field"><label htmlFor="communityTitle">Display title</label><input id="communityTitle" name="communityTitle" defaultValue={contributorProfile?.title ?? ""} maxLength={160} placeholder="Example: Client Retention Strategist" /></div>
            <div className="field full"><label htmlFor="communityBio">Short bio</label><textarea id="communityBio" name="communityBio" defaultValue={contributorProfile?.bio ?? ""} maxLength={500} placeholder="Share the experience behind your Mixes without including private client information." /></div>
            <div className="field"><label htmlFor="communityAvatarUrl">Profile image URL</label><input id="communityAvatarUrl" name="communityAvatarUrl" type="url" inputMode="url" defaultValue={contributorProfile?.avatarUrl ?? ""} placeholder="https://…" /></div>
            <div className="field"><label htmlFor="communityWebsite">Public website</label><input id="communityWebsite" name="communityWebsite" type="url" inputMode="url" defaultValue={contributorProfile?.website ?? ""} placeholder="https://…" /></div>
          </div>
        </section>

        <div className="form-actions sticky-form-actions"><button className="button primary" type="submit">Save My Info</button></div>
      </form>

      <div className="dashboard-grid settings-account-summary">
        <section className="card"><div className="card-header"><div><h2>Plan</h2><p>Entitlements are enforced by server actions and background jobs.</p></div></div><span className="plan-pill">{workspace.planTier} · {workspace.subscriptionStatus}</span><p className="muted-copy">Community sharing limits are Free 0, Plus 3, and Pro 10 approved or pending Mixes.</p><Link className="button" href="/account">Manage account</Link></section>
        <section className="card"><div className="card-header"><div><h2>Connections</h2><p>Account-level integrations are managed separately from application settings.</p></div></div><div className="checklist"><div className="check-row"><span>✓</span><span>Google Contacts · Plus/Pro</span></div><div className="check-row"><span>○</span><span>Microsoft Outlook · later</span></div><div className="check-row"><span>○</span><span>WhatsApp Assistant · later</span></div><div className="check-row"><span>○</span><span>Website inquiry webhook · later</span></div></div><Link className="button" href="/account#google-contacts">Manage connections</Link></section>
      </div>
    </div>
  );
}
