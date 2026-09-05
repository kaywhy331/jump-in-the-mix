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
  sharedMixChannelLabel,
  type SharedMixStep
} from "@/lib/shared-mix";
import { saveSharedMixAdminAction } from "@/lib/shared-mix-admin-actions";

export const metadata: Metadata = { title: "Admin · Edit ready-made plan" };

type SearchParams = { created?: string; saved?: string; error?: string };

export default async function AdminEditTemplatePage({
  params,
  searchParams
}: {
  params: Promise<{ sharedMixId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ sharedMixId }, query] = await Promise.all([params, searchParams, requirePlatformAdmin()]);
  const template = await prisma.sharedMix.findUnique({ where: { id: sharedMixId } });
  if (!template) notFound();
  const templateMetadata = await prisma.sharedMixMetadata.findUnique({ where: { sharedMixId: template.id } });

  let steps: SharedMixStep[];
  try {
    steps = normalizeSharedMixSteps(template.steps);
  } catch (error) {
    return (
      <div className="page">
        <header className="page-header"><div><h1>Repair {template.title}</h1><p>The stored content cannot be opened in the visual editor.</p></div><Link className="button" href="/admin/templates">Back to templates</Link></header>
        <Notice type="error">{error instanceof Error ? error.message : "Invalid ready-made plan content."}</Notice>
      </div>
    );
  }

  return (
    <div className="page admin-template-editor-page">
      {query.created && <Notice type="success">Ready-made plan published.</Notice>}
      {query.saved && <Notice type="success">Ready-made plan saved.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header">
        <div><h1>Edit {template.title}</h1><p>Review the exact follow-up content customers will preview and use.</p></div>
        <div className="page-actions"><Link className="button" href="/admin/templates">Back to plans</Link><Link className="button" href="/templates">Customer library</Link></div>
      </header>

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
            <div className="field"><label htmlFor="status">Visibility</label><select id="status" name="status" defaultValue={template.status}><option value="APPROVED">Published</option><option value="UNPUBLISHED">Hidden</option></select></div>
            <div className="field"><label htmlFor="triggerMode">Starts</label><select id="triggerMode" name="triggerMode" defaultValue={templateMetadata?.triggerMode ?? "MANUAL_START"}><option value="MANUAL_START">When chosen for someone</option><option value="DATE_TRIGGERED">From a saved date</option><option value="BROADCAST">On one fixed date</option></select></div>
            <div className="field"><label htmlFor="dateTypeName">Saved date type name</label><input id="dateTypeName" name="dateTypeName" defaultValue={templateMetadata?.dateTypeName ?? ""} maxLength={120} /></div>
            <div className="field"><label htmlFor="dateTypeSlug">Saved date type key</label><input id="dateTypeSlug" name="dateTypeSlug" defaultValue={templateMetadata?.dateTypeSlug ?? ""} maxLength={120} /></div>
            <label className="checkbox-card field full"><input type="checkbox" name="featured" defaultChecked={Boolean(templateMetadata?.featuredAt)} /><span><strong>Feature this plan</strong><small>Featured plans appear before ordinary results.</small></span></label>
          </div>
        </section>

        <section className="card">
          <div className="card-header"><div><h2>Prepared follow-ups</h2><p>Edit the exact messages and call notes customers will receive.</p></div><span className="status-pill">{steps.length} follow-ups</span></div>
          <div className="admin-template-step-editor-list">
            {steps.map((step, index) => (
              <fieldset className="admin-template-step-editor" key={`${index}-${step.name}`}>
                <legend>Follow-up #{index + 1} · {sharedMixChannelLabel(step.channel)}</legend>
                <div className="form-grid">
                  <div className="field full"><label htmlFor={`stepName-${index}`}>Follow-up name</label><input id={`stepName-${index}`} name="stepName" defaultValue={step.name} maxLength={160} required /></div>
                  <div className="field"><label htmlFor={`stepChannel-${index}`}>Channel</label><select id={`stepChannel-${index}`} name="stepChannel" defaultValue={step.channel}><option value="SMS">SMS</option><option value="EMAIL">Email</option><option value="PHONE_CALL">Phone Call</option><option value="VOICEMAIL">Voicemail Script</option><option value="WHATSAPP">WhatsApp</option></select></div>
                  <div className="field"><label htmlFor={`stepDayOffset-${index}`}>Days after start</label><input id={`stepDayOffset-${index}`} name="stepDayOffset" type="number" min={-3650} max={3650} defaultValue={step.dayOffset} required /></div>
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
