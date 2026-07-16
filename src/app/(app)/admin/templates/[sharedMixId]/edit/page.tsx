import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MIX_TEMPLATE_CATEGORIES,
  MIX_TEMPLATE_INDUSTRIES,
  normalizeSharedMixSteps,
  sharedMixChannelLabel
} from "@/lib/shared-mix";
import { saveSharedMixAdminAction } from "@/lib/shared-mix-admin-actions";

export const metadata: Metadata = { title: "Admin · Edit Mix Template" };

type SearchParams = { created?: string; saved?: string; error?: string };

export default async function AdminEditTemplatePage({
  params,
  searchParams
}: {
  params: Promise<{ sharedMixId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ sharedMixId }, query] = await Promise.all([params, searchParams, requirePlatformAdmin()]);
  const template = await prisma.sharedMix.findUnique({
    where: { id: sharedMixId },
    include: {
      publisherWorkspace: {
        select: {
          name: true,
          planTier: true,
          profile: {
            select: {
              communityDisplayName: true,
              communityTitle: true,
              communityBio: true,
              communityWebsite: true,
              company: true,
              industry: true
            }
          }
        }
      }
    }
  });
  if (!template) notFound();

  let steps;
  try {
    steps = normalizeSharedMixSteps(template.steps);
  } catch (error) {
    return (
      <div className="page">
        <header className="page-header"><div><h1>Repair {template.title}</h1><p>The stored content cannot be opened in the visual editor.</p></div><Link className="button" href="/admin/templates">Back to templates</Link></header>
        <Notice type="error">{error instanceof Error ? error.message : "Invalid Mix Template content."}</Notice>
      </div>
    );
  }

  const profile = template.publisherWorkspace?.profile;
  return (
    <div className="page admin-template-editor-page">
      {query.created && <Notice type="success">Platform template created from the source Mix.</Notice>}
      {query.saved && <Notice type="success">Mix Template saved as version {template.version}.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header">
        <div><h1>Edit {template.title}</h1><p>Review the exact Jump content users will preview and import.</p></div>
        <div className="page-actions"><Link className="button" href="/admin/templates">Back to moderation</Link><Link className="button" href="/templates">Public library</Link></div>
      </header>

      {!template.isPlatform && (
        <section className="card admin-contributor-review">
          <div className="section-label"><h2>Contributor</h2><span>{template.publisherWorkspace?.planTier.toLowerCase()}</span></div>
          <strong>{profile?.communityDisplayName || template.publisherWorkspace?.name || "Unknown contributor"}</strong>
          <p>{[profile?.communityTitle, profile?.company, profile?.industry].filter(Boolean).join(" · ")}</p>
          {profile?.communityBio && <p>{profile.communityBio}</p>}
          {profile?.communityWebsite && <p><a href={profile.communityWebsite} rel="nofollow noopener" target="_blank">Review contributor website</a></p>}
        </section>
      )}

      <form action={saveSharedMixAdminAction} className="admin-template-editor-form">
        <input type="hidden" name="sharedMixId" value={template.id} />
        <section className="card">
          <div className="card-header"><div><h2>Discovery metadata</h2><p>Clear labels improve search and reduce analysis paralysis.</p></div></div>
          <div className="form-grid">
            <div className="field full"><label htmlFor="title">Title</label><input id="title" name="title" defaultValue={template.title} maxLength={160} required /></div>
            <div className="field full"><label htmlFor="description">Description</label><textarea id="description" name="description" defaultValue={template.description} minLength={20} maxLength={1200} required /></div>
            <div className="field"><label htmlFor="category">Category</label><select id="category" name="category" defaultValue={template.category} required>{MIX_TEMPLATE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label htmlFor="industry">Industry</label><select id="industry" name="industry" defaultValue={template.industry ?? "General / Other"} required>{MIX_TEMPLATE_INDUSTRIES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label htmlFor="framework">Framework</label><input id="framework" name="framework" defaultValue={template.framework ?? ""} maxLength={160} /></div>
            <div className="field"><label htmlFor="status">Moderation status</label><select id="status" name="status" defaultValue={template.status}><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="FLAGGED">Flagged</option><option value="REJECTED">Rejected</option><option value="UNPUBLISHED">Unpublished</option></select></div>
            <div className="field"><label htmlFor="triggerMode">Trigger mode</label><select id="triggerMode" name="triggerMode" defaultValue={template.triggerMode}><option value="MANUAL_START">Manual start</option><option value="DATE_TRIGGERED">Target Jump Date Type</option><option value="BROADCAST">Broadcast draft</option></select></div>
            <div className="field"><label htmlFor="dateTypeName">Target Jump Date Type name</label><input id="dateTypeName" name="dateTypeName" defaultValue={template.dateTypeName ?? ""} maxLength={120} /></div>
            <div className="field"><label htmlFor="dateTypeSlug">Target Jump Date Type slug</label><input id="dateTypeSlug" name="dateTypeSlug" defaultValue={template.dateTypeSlug ?? ""} maxLength={120} /></div>
            <div className="field full"><label htmlFor="moderationNote">Moderation note</label><textarea id="moderationNote" name="moderationNote" defaultValue={template.moderationNote ?? ""} maxLength={1200} placeholder="Explain a rejection, flag, or required change." /></div>
            <label className="checkbox-card field full"><input type="checkbox" name="featured" defaultChecked={Boolean(template.featuredAt)} /><span><strong>Feature this template</strong><small>Featured templates appear before ordinary results.</small></span></label>
          </div>
        </section>

        <section className="card">
          <div className="card-header"><div><h2>Prepared Jumps</h2><p>Edit human-readable content. Saving validates channels and approved placeholders.</p></div><span className="status-pill">{steps.length} Jumps</span></div>
          <div className="admin-template-step-editor-list">
            {steps.map((step, index) => (
              <fieldset className="admin-template-step-editor" key={`${index}-${step.name}`}>
                <legend>Jump #{index + 1} · {sharedMixChannelLabel(step.channel)}</legend>
                <div className="form-grid">
                  <div className="field full"><label htmlFor={`stepName-${index}`}>Jump name</label><input id={`stepName-${index}`} name="stepName" defaultValue={step.name} maxLength={160} required /></div>
                  <div className="field"><label htmlFor={`stepChannel-${index}`}>Channel</label><select id={`stepChannel-${index}`} name="stepChannel" defaultValue={step.channel}><option value="SMS">SMS</option><option value="EMAIL">Email</option><option value="PHONE_CALL">Phone Call</option><option value="VOICEMAIL">Voicemail Script</option><option value="WHATSAPP">WhatsApp</option></select></div>
                  <div className="field"><label htmlFor={`stepDayOffset-${index}`}>Day offset</label><input id={`stepDayOffset-${index}`} name="stepDayOffset" type="number" min={-3650} max={3650} defaultValue={step.dayOffset} required /></div>
                  <div className="field"><label htmlFor={`stepSendTimeMinutes-${index}`}>Time, minutes after midnight</label><input id={`stepSendTimeMinutes-${index}`} name="stepSendTimeMinutes" type="number" min={0} max={1439} defaultValue={step.sendTimeMinutes ?? ""} /></div>
                  <div className="field full"><label htmlFor={`stepSubject-${index}`}>Email subject</label><input id={`stepSubject-${index}`} name="stepSubject" defaultValue={step.subject ?? ""} maxLength={300} /></div>
                  <div className="field full"><label htmlFor={`stepBody-${index}`}>SMS, email, or WhatsApp content</label><textarea id={`stepBody-${index}`} name="stepBody" defaultValue={step.body ?? ""} rows={6} /></div>
                  <div className="field full"><label htmlFor={`stepScript-${index}`}>Phone or voicemail script</label><textarea id={`stepScript-${index}`} name="stepScript" defaultValue={step.script ?? ""} rows={6} /></div>
                </div>
              </fieldset>
            ))}
          </div>
        </section>

        <div className="form-actions sticky-form-actions"><Link className="button" href="/admin/templates">Cancel</Link><button className="button primary" type="submit">Save new version</button></div>
      </form>
    </div>
  );
}
