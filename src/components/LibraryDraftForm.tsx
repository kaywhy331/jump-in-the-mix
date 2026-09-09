"use client";

import { useRef, useState } from "react";
import { SendTimeField } from "@/components/SendTimeField";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { saveSharedMixAdminAction } from "@/lib/shared-mix-admin-actions";
import { MIX_TEMPLATE_CATEGORIES, MIX_TEMPLATE_INDUSTRIES } from "@/lib/shared-mix";
import { EMPTY_LIBRARY_CONTENT, type LibraryContent } from "@/lib/library-content";

export function LibraryDraftForm({ id, revision, content }: { id?: string; revision: number; content: LibraryContent }) {
  const nextKey = useRef(content.steps.length);
  const [steps, setSteps] = useState(content.steps.map((step, key) => ({ step, key })));
  const move = (index: number, direction: number) => setSteps(rows => { const next = [...rows]; if (!next[index] || !next[index + direction]) return rows; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; });
  return <form action={saveSharedMixAdminAction} className="admin-template-editor-form">
    <input type="hidden" name="sharedMixId" value={id ?? ""} /><input type="hidden" name="revision" value={revision} />
    <section className="card form-stack"><h2>Draft details</h2><p>Saving a draft does not change the customer library. Review the saved preview before publishing.</p>
      <label className="field"><span>Title</span><input name="title" defaultValue={content.title} maxLength={160} required /></label>
      <label className="field"><span>Description</span><textarea name="description" defaultValue={content.description} minLength={20} maxLength={1200} required rows={3} /></label>
      <div className="form-grid">
        <label className="field"><span>Category</span><select name="category" defaultValue={content.category}>{MIX_TEMPLATE_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Industry</span><select name="industry" defaultValue={content.industry}>{MIX_TEMPLATE_INDUSTRIES.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Short label</span><input name="framework" defaultValue={content.framework ?? ""} maxLength={160} /></label>
        <label className="field"><span>Starts</span><select name="triggerMode" defaultValue={content.triggerMode}><option value="MANUAL_START">When chosen for someone</option><option value="DATE_TRIGGERED">From a saved date</option><option value="BROADCAST">On one fixed date</option></select></label>
        <label className="field"><span>Saved date type name</span><input name="dateTypeName" defaultValue={content.dateTypeName ?? ""} maxLength={120} /></label>
        <label className="field"><span>Saved date type key</span><input name="dateTypeSlug" defaultValue={content.dateTypeSlug ?? ""} maxLength={120} /></label>
      </div>
      <label><input type="checkbox" name="featured" defaultChecked={content.featured} /> Feature this mix when published</label>
    </section>
    <section className="card form-stack"><h2>Prepared beats</h2><p>Use supported placeholders such as {"{{First Name}}"}. Private Notes are allowed only in phone-call notes.</p>
      {steps.map(({ step, key }, index) => <fieldset key={key} className="admin-template-step-editor"><legend>Beat {index + 1}</legend>
        <div className="form-grid">
          <label className="field full"><span>Beat name</span><input name="stepName" defaultValue={step.name} maxLength={160} required /></label>
          <label className="field"><span>Channel</span><select name="stepChannel" defaultValue={step.channel}><option value="SMS">SMS</option><option value="EMAIL">Email</option><option value="PHONE_CALL">Phone call</option><option value="VOICEMAIL">Voicemail script</option><option value="WHATSAPP">WhatsApp</option></select></label>
          <label className="field"><span>Days after start</span><input name="stepDayOffset" type="number" min={-3650} max={3650} step={1} defaultValue={step.dayOffset} required /></label>
          <SendTimeField id={`library-time-${key}`} defaultMinutes={step.sendTimeMinutes} />
          <label className="field full"><span>Email subject</span><input name="stepSubject" defaultValue={step.subject ?? ""} maxLength={300} /></label>
          <label className="field full"><span>Message</span><textarea name="stepBody" defaultValue={step.body ?? ""} maxLength={20_000} rows={4} /></label>
          <label className="field full"><span>Phone or voicemail notes</span><textarea name="stepScript" defaultValue={step.script ?? ""} maxLength={20_000} rows={4} /></label>
          <label><input type="checkbox" name="stepLongSms" value={index} defaultChecked={step.longSms} /> Allow long SMS</label>
          <label><input type="checkbox" name="stepOptOut" value={index} defaultChecked={step.includeOptOut} /> Include opt-out wording</label>
        </div>
        <div className="form-actions">
          <button className="button small" type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move beat ${index + 1} earlier`}>Move earlier</button>
          <button className="button small" type="button" disabled={index === steps.length - 1} onClick={() => move(index, 1)} aria-label={`Move beat ${index + 1} later`}>Move later</button>
          <button className="button small" type="button" disabled={steps.length === 1} onClick={() => setSteps(rows => rows.filter(row => row.key !== key))} aria-label={`Remove beat ${index + 1}`}>Remove beat</button>
        </div>
      </fieldset>)}
      <button className="button" type="button" disabled={steps.length >= 50} onClick={() => setSteps(rows => [...rows, { key: nextKey.current++, step: { ...EMPTY_LIBRARY_CONTENT.steps[0] } }])}>Add beat</button>
    </section>
    <section className="card form-stack"><label className="field"><span>Reason for draft change</span><textarea name="reason" minLength={10} maxLength={500} rows={2} required /></label>
      <FormSubmitButton label="Save draft for review" pendingLabel="Saving draft…" />
    </section>
  </form>;
}
