"use client";

import { useId, useState } from "react";
import { SUPPORT_CATEGORIES } from "@/lib/support-content";
import { SupportContext } from "@/components/SupportContext";
import { formatSupportReport, supportReportBodyForSubmission, SUPPORT_BODY_LIMIT, SUPPORT_TITLE_LIMIT } from "@/lib/support-report";

export function SupportReportFields({ disabled = false }: { disabled?: boolean }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [diagnosticsJson, setDiagnosticsJson] = useState("");
  const safetyId = useId();
  const titleCountId = useId();
  const bodyCountId = useId();
  const submittedBody = supportReportBodyForSubmission(body);
  const saved = formatSupportReport({ title, body: submittedBody, diagnostics: diagnosticsJson });
  const changed = saved.title !== title.trim() || saved.body !== submittedBody.trim();
  return <>
    <label className="field support-compact-field"><span className="field-label">Topic</span><select name="category" defaultValue="BUG" disabled={disabled} required>{SUPPORT_CATEGORIES.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
    <label className="field"><span className="field-label">Short title</span><input name="title" minLength={5} maxLength={160} placeholder="Example: I could not save a contact" disabled={disabled} required value={title} onChange={event => setTitle(event.target.value)} aria-describedby={`${safetyId} ${titleCountId}`} /><small id={titleCountId}>{saved.title.length}/{SUPPORT_TITLE_LIMIT} characters will be saved.{saved.titleShortened && " The title will be shortened."}</small></label>
    <label className="field"><span className="field-label">What happened?</span><textarea name="body" minLength={10} maxLength={5000} rows={5} placeholder="What were you trying to do? What happened, and what did you expect?" disabled={disabled} required value={body} onChange={event => setBody(event.target.value)} aria-describedby={`${safetyId} ${bodyCountId}`} /><small id={bodyCountId}>{saved.body.length}/{SUPPORT_BODY_LIMIT} characters will be saved.{saved.bodyShortened && " The end of the report will not be saved."}</small></label>
    <p id={safetyId} className="support-report-safety">Leave out customer details and passwords. We remove common emails, phone numbers, links and credentials; please check for names and other private details.</p>
    {changed && <details className="support-report-preview" open>
      <summary>Review the report as it will be saved</summary>
      <div><strong>{saved.title}</strong><p>{saved.body}</p></div>
    </details>}
    <SupportContext disabled={disabled} onDiagnosticsChange={setDiagnosticsJson} />
  </>;
}
