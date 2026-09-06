"use client";
import { useActionState, useState } from "react";
import { submitLeadFormAction } from "@/lib/lead-form-actions";
import { Notice } from "@/components/Notice";
export function PublicLeadForm({ connectionId, eventId, businessName }: { connectionId: string; eventId: string; businessName: string }) {
  const [values, setValues] = useState({ displayName: "", email: "", phone: "", company: "", message: "", contactPermission: false });
  const [state, action, pending] = useActionState(submitLeadFormAction, { error: "", received: false });
  if (state.received) return <div role="status" className="card"><h2>Thanks for reaching out.</h2><p>Your request has been received. {businessName} can follow up using the details you shared.</p></div>;
  return <form action={action} className="form-stack" onChange={event => { const field = event.target as HTMLInputElement; setValues(current => ({ ...current, [field.name]: field.type === "checkbox" ? field.checked : field.value })); }}>{state.error && <Notice type="error">{state.error}</Notice>}<input type="hidden" name="connectionId" value={connectionId} /><input type="hidden" name="eventId" value={eventId} /><div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label className="field"><span>Your name</span><input name="displayName" value={values.displayName} onChange={() => {}} autoComplete="name" maxLength={160} required /></label>
    <p className="muted-copy" id="lead-contact-hint">Share an email or phone number so we can respond.</p>
    <label className="field"><span>Email</span><input name="email" value={values.email} onChange={() => {}} type="email" autoComplete="email" maxLength={254} aria-describedby="lead-contact-hint" /></label><label className="field"><span>Phone</span><input name="phone" value={values.phone} onChange={() => {}} type="tel" autoComplete="tel" maxLength={40} aria-describedby="lead-contact-hint" /></label>
    <label className="field"><span>Company (optional)</span><input name="company" value={values.company} onChange={() => {}} autoComplete="organization" maxLength={160} /></label><label className="field"><span>How can we help?</span><textarea name="message" value={values.message} onChange={() => {}} rows={5} maxLength={4000} /></label>
    <label className="checkbox-row"><input type="checkbox" name="contactPermission" checked={values.contactPermission} onChange={() => {}} required /><span>{businessName} may contact me about this request using the details I provide.</span></label><button className="button primary" disabled={pending}>{pending ? "Sending request…" : "Send request"}</button>
  </form>;
}
