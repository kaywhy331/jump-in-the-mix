"use client";

import { useId, useState } from "react";
import { SUPPORT_CATEGORIES } from "@/lib/support-content";
import { redactSupportReportText } from "@/lib/support-report";

export function SupportReportFields({ disabled = false }: { disabled?: boolean }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const safetyId = useId();
  const safeTitle = redactSupportReportText(title);
  const safeBody = redactSupportReportText(body);
  const redacted = title !== safeTitle || body !== safeBody;
  return <>
    <label className="field support-compact-field"><span className="field-label">Topic</span><select name="category" defaultValue="BUG" disabled={disabled} required>{SUPPORT_CATEGORIES.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
    <label className="field"><span className="field-label">Short title</span><input name="title" minLength={5} maxLength={160} placeholder="Example: I could not save a contact" disabled={disabled} required value={title} onChange={event => setTitle(event.target.value)} aria-describedby={safetyId} /></label>
    <label className="field"><span className="field-label">What happened?</span><textarea name="body" minLength={10} maxLength={5000} rows={5} placeholder="What were you trying to do? What happened, and what did you expect?" disabled={disabled} required value={body} onChange={event => setBody(event.target.value)} aria-describedby={safetyId} /></label>
    <p id={safetyId} className="support-report-safety">Leave out customer details and passwords. We remove common emails, phone numbers, links and credentials; please check for names and other private details.</p>
    {redacted && <details className="support-report-preview" open>
      <summary>Review the cleaned report</summary>
      <div><strong>{safeTitle}</strong><p>{safeBody}</p></div>
    </details>}
  </>;
}
