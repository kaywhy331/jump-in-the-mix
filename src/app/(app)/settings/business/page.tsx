import { SignaturePreview } from "@/components/SignaturePreview";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { prisma } from "@/lib/prisma";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { BUSINESS_TYPES } from "@/lib/business-taxonomy";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { RepeatableProfileRecords } from "@/components/RepeatableProfileRecords";
import { requireWorkspace } from "@/lib/auth";
import { updateWorkspaceProfileFormAction } from "@/lib/workspace-profile-actions";
import { BackLink } from "@/components/BackLink";

export const metadata: Metadata = { title: "My business" };

type SearchParams = { saved?: string; error?: string };
type ProfileRecord = { name: string; value: string };

function records(raw: unknown, legacy: Array<string | null | undefined>): ProfileRecord[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => item && typeof item === "object" && !Array.isArray(item)
      ? [{ name: String((item as Record<string, unknown>).name ?? ""), value: String((item as Record<string, unknown>).value ?? "") }]
      : []);
  }
  return legacy.flatMap((value, index) => value ? [{ name: `Service ${index + 1}`, value }] : []);
}

export default async function BusinessSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
  const profile = workspace.profile;
  const [display, sending] = await Promise.all([displayPreferencesForUser(user.id), prisma.automationPreference.findUnique({ where: { workspaceId: workspace.id } })]);
  const services = records(profile?.products, [profile?.product1, profile?.product2, profile?.product3, profile?.product4, profile?.product5]);

  return <div className="page page--form settings-business-page">
    {params.saved && <Notice type="success">Business details saved.</Notice>}
    {params.error && <Notice type="error">{params.error}</Notice>}
    <BackLink href="/settings" label="Settings" /><header className="page-header"><div><h1>My business</h1><p>These details make every prepared message sound complete and personal.</p></div></header>
    <section className="notice info"><p>Timezone: {display.timeZone} · {sending?.enabled ? "Automatic sending enabled" : "You review and send"}.</p><Link href="/account/preferences">Timezone and scheduling</Link> · <Link href="/settings/sending">Sending defaults</Link></section>
    <ActionForm protect action={updateWorkspaceProfileFormAction} className="form-stack settings-profile-layout">
      <input type="hidden" name="settingsSection" value="business" />
      <section className="card">
        <div className="card-header"><div><h2>Business details</h2><p>Tell customers who you are and what you help with.</p></div></div>
        <div className="form-grid">
          <label className="field"><span>Business name</span><input name="company" defaultValue={profile?.company ?? ""} autoComplete="organization" maxLength={200} required /></label>
          <label className="field"><span>Type of business</span><select name="industry" defaultValue={profile?.industry ?? "Other"}>{[...new Set([...BUSINESS_TYPES, ...(profile?.industry ? [profile.industry] : [])])].map(type => <option key={type}>{type}</option>)}</select></label>
          <label className="field"><span>Business phone</span><input name="phone" inputMode="tel" autoComplete="tel" defaultValue={profile?.phone ?? ""} maxLength={80} /></label>
          <label className="field"><span>Website</span><input name="website" type="url" inputMode="url" autoComplete="url" defaultValue={profile?.website ?? ""} placeholder="https://example.com" maxLength={500} /></label>
          <label className="field full"><span>Public review page</span><input name="reviewUrl" type="url" inputMode="url" defaultValue={profile?.reviewUrl ?? ""} placeholder="https://g.page/r/your-business/review" maxLength={500} /><small>Every customer can choose this after answering your private check-in, regardless of rating.</small></label>
          <div className="field full"><RepeatableProfileRecords fieldName="products" title="Services" description="Add up to five services that can be used in prepared messages." initial={services} maximum={5} /></div>
        </div>
      </section>
      <section className="card">
        <div className="card-header"><div><h2>How messages end</h2><p>Keep texts short. Your email signature can include a title or phone number.</p></div></div>
        <div className="form-grid">
          <label className="field full"><span>Text signature</span><input name="smsSignature" defaultValue={profile?.smsSignature ?? user.name} maxLength={500} placeholder={user.name} required /></label>
          <label className="field full"><span>Email signature</span><textarea name="emailSignature" defaultValue={profile?.emailSignature ?? user.name} maxLength={2000} rows={4} required /></label><SignaturePreview />
        </div>
      </section>
      <div className="form-actions"><FormSubmitButton label="Save business details" pendingLabel="Saving…" /></div>
    </ActionForm>
  </div>;
}
