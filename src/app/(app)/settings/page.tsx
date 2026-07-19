import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateWorkspaceProfileAction } from "@/lib/workspace-profile-actions";
import { RepeatableProfileRecords } from "@/components/RepeatableProfileRecords";
import { TimezonePicker } from "@/components/TimezonePicker";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Settings" };

type SearchParams = { saved?: string; error?: string; section?: string };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const section = ["profile", "messaging", "community"].includes(params.section ?? "") ? params.section : "";
  const [profile, contributorProfile] = await Promise.all([
    Promise.resolve(workspace.profile),
    prisma.sharedMixContributorProfile.findUnique({ where: { workspaceId: workspace.id } })
  ]);
  const asRecords = (raw: Prisma.JsonValue | null | undefined, legacy: (string | null | undefined)[], label: string) => Array.isArray(raw) ? raw.flatMap((item) => item && typeof item === "object" && !Array.isArray(item) ? [{ name: String((item as Record<string, unknown>).name ?? ""), value: String((item as Record<string, unknown>).value ?? "") }] : []) : legacy.flatMap((item, index) => item ? [{ name: `${label} ${index + 1}`, value: item }] : []);
  const products = asRecords(profile?.products, [profile?.product1, profile?.product2, profile?.product3, profile?.product4, profile?.product5], "Product or service");
  const senderDetails = asRecords(profile?.senderDetails, [profile?.myCustom1, profile?.myCustom2, profile?.myCustom3], "Sender detail");
  return (
    <div className="page">
      {params.saved && <Notice type="success">My Info and Community Public Profile saved.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header"><div><h1>Settings</h1><p>Manage your workspace profile, action templates, Important Date types, and Community profile.</p></div></header>

      <div className="settings-hub-grid">
        <Link className="settings-hub-card" href="/settings?section=profile"><span className="settings-hub-icon">✎</span><span><strong>Profile</strong><small>Business context, products, sender details, and timezone.</small></span></Link>
        <Link className="settings-hub-card" href="/settings?section=messaging"><span className="settings-hub-icon">↗</span><span><strong>Messaging</strong><small>Signatures and reusable action content.</small></span></Link>
        <Link className="settings-hub-card" href="/settings/jumps"><span className="settings-hub-icon">↗</span><span><strong>Action Templates</strong><small>Reusable messages, call scripts, and voicemail content for your follow-up plans.</small></span></Link>
        <Link className="settings-hub-card" href="/settings/jump-date-types"><span className="settings-hub-icon">◫</span><span><strong>Important Date Types</strong><small>Manage the moments that can start a follow-up plan.</small></span></Link>
        <Link className="settings-hub-card" href="/settings?section=community"><span className="settings-hub-icon">◇</span><span><strong>Community</strong><small>Control the public identity shown with Mixes you share.</small></span></Link>
        <Link className="settings-hub-card" href="/account?section=connections"><span className="settings-hub-icon">↔</span><span><strong>Integrations</strong><small>Manage connected providers and sync.</small></span></Link>
        <Link className="settings-hub-card" href="/account?section=billing"><span className="settings-hub-icon">$</span><span><strong>Billing</strong><small>Plan, usage, payment methods, and invoices.</small></span></Link>
        <Link className="settings-hub-card" href="/account?section=security"><span className="settings-hub-icon">◇</span><span><strong>Security</strong><small>Password and active sessions.</small></span></Link>
        <Link className="settings-hub-card" href="/account?section=privacy"><span className="settings-hub-icon">□</span><span><strong>Data &amp; Privacy</strong><small>Data controls and account deletion.</small></span></Link>
      </div>

      {section && <form action={updateWorkspaceProfileAction} className="settings-profile-layout"><input type="hidden" name="settingsSection" value={section}/>
        {section === "profile" && <section className="card" id="my-info">
          <div className="card-header"><div><h2>Workspace profile</h2><p>Optional business details used by approved dynamic placeholders and the AI Mix Wizard.</p></div></div>
          <div className="form-grid">
            <div className="field"><label htmlFor="company">Company</label><input id="company" name="company" defaultValue={profile?.company ?? workspace.name} /></div>
            <div className="field"><label htmlFor="industry">Industry</label><input id="industry" name="industry" defaultValue={profile?.industry ?? ""} /></div>
            <div className="field"><label htmlFor="website">Website</label><input id="website" name="website" type="url" inputMode="url" defaultValue={profile?.website ?? ""} placeholder="https://example.com" /></div>
            <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" inputMode="tel" defaultValue={profile?.phone ?? ""} /></div>
            <div className="field full"><label htmlFor="street">Street address</label><input id="street" name="street" defaultValue={profile?.street ?? ""} /></div>
            <div className="field"><label htmlFor="city">City</label><input id="city" name="city" defaultValue={profile?.city ?? ""} /></div>
            <div className="field"><label htmlFor="state">State or region</label><input id="state" name="state" defaultValue={profile?.state ?? ""} /></div>
            <div className="field"><label htmlFor="postalCode">Postal code</label><input id="postalCode" name="postalCode" defaultValue={profile?.postalCode ?? ""} /></div>
            <div className="field"><label htmlFor="timezone">Timezone</label><TimezonePicker defaultValue={profile?.timezone ?? "America/New_York"}/><small>Search any IANA timezone or use the timezone detected by your browser.</small></div>
            <div className="field full"><label htmlFor="mailingAddress">Mailing address</label><textarea id="mailingAddress" name="mailingAddress" defaultValue={profile?.mailingAddress ?? ""} /></div>
            <div className="field full"><RepeatableProfileRecords fieldName="products" title="Products and services" description="Add, name, reorder, or remove the offerings used when preparing follow-up content." initial={products} maximum={20}/></div>
            <div className="field full"><RepeatableProfileRecords fieldName="senderDetails" title="Custom sender details" description="Name reusable details such as booking link, office hours, or preferred introduction." initial={senderDetails} maximum={20}/></div>
          </div>
        </section>}

        {section === "messaging" && <section className="card">
          <div className="card-header"><div><h2>Signatures</h2><p>Reusable endings available through My Info placeholders.</p></div></div>
          <div className="form-grid">
            <div className="field full"><label htmlFor="smsSignature">SMS signature</label><input id="smsSignature" name="smsSignature" defaultValue={profile?.smsSignature ?? ""} /></div>
            <div className="field full"><label htmlFor="emailSignature">Email signature</label><textarea id="emailSignature" name="emailSignature" defaultValue={profile?.emailSignature ?? ""} /></div>
          </div>
        </section>}

        {section === "community" && <section className="card" id="community-profile">
          <div className="card-header"><div><h2>Community Public Profile</h2><p>Shown beside approved Mixes you contribute. Profile edits update every shared template automatically.</p></div></div>
          <div className="form-grid">
            <label className="checkbox-card field full"><input type="checkbox" name="communityProfileEnabled" defaultChecked={contributorProfile?.enabled ?? false} /><span><strong>Make this profile available for Community contributions</strong><small>Your private account email and workspace data are never exposed.</small></span></label>
            <div className="field"><label htmlFor="communityDisplayName">Display name</label><input id="communityDisplayName" name="communityDisplayName" defaultValue={contributorProfile?.displayName ?? ""} maxLength={120} /></div>
            <div className="field"><label htmlFor="communityTitle">Display title</label><input id="communityTitle" name="communityTitle" defaultValue={contributorProfile?.title ?? ""} maxLength={160} placeholder="Example: Client Retention Strategist" /></div>
            <div className="field full"><label htmlFor="communityBio">Short bio</label><textarea id="communityBio" name="communityBio" defaultValue={contributorProfile?.bio ?? ""} maxLength={500} placeholder="Share the experience behind your Mixes without including private client information." /></div>
            <div className="field"><label htmlFor="communityAvatarUrl">Profile image URL</label><input id="communityAvatarUrl" name="communityAvatarUrl" type="url" inputMode="url" defaultValue={contributorProfile?.avatarUrl ?? ""} placeholder="https://…" /></div>
            <div className="field"><label htmlFor="communityWebsite">Public website</label><input id="communityWebsite" name="communityWebsite" type="url" inputMode="url" defaultValue={contributorProfile?.website ?? ""} placeholder="https://…" /></div>
          </div>
        </section>}

        <div className="form-actions sticky-form-actions"><button className="button primary" type="submit">Save workspace profile</button></div>
      </form>}

    </div>
  );
}
