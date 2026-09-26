"use client";

import { FormSubmitButton } from "@/components/FormSubmitButton";
import { useState } from "react";
import { mergeContactsAction } from "@/lib/contact-merge-actions";

export function DuplicateMergeForm({
  left,
  right
}: {
  left: { id: string; name: string; fields?: Record<string, string | null> };
  right: { id: string; name: string; fields?: Record<string, string | null> };
}) {
  const [survivorId, setSurvivorId] = useState(left.id);
  const survivor = survivorId === left.id ? left : right;
  const fields = [...new Set([...Object.keys(left.fields ?? {}), ...Object.keys(right.fields ?? {})])];
  const source = survivorId === left.id ? right : left;
  return (
    <form action={mergeContactsAction} className="form-grid duplicate-merge-form">
      <label className="field full"><span>Keep this Contact as the survivor</span><select name="survivorContactId" value={survivorId} onChange={(event) => setSurvivorId(event.target.value)}><option value={left.id}>{left.name}</option><option value={right.id}>{right.name}</option></select></label>
      <section className="field full" aria-label="Merge preview"><h3>After merging: {survivor.name}</h3><dl>{fields.map(field => <div key={field}><dt>{field}</dt><dd>{survivor.fields?.[field] ?? source.fields?.[field] ?? "Not provided"}{survivor.fields?.[field] != null && source.fields?.[field] != null && survivor.fields[field] !== source.fields[field] && <small> · Conflicting value on {source.name}: {source.fields[field]}</small>}</dd></div>)}</dl><p>All distinct emails, phones, dates and tags are retained. Existing values on the kept record win conflicts; notes from both are combined with their source. Review each record for details before confirming.</p></section>
      <input type="hidden" name="sourceContactId" value={source.id} />
      <label className="field full"><span>Type {source.name} to confirm</span><input name="confirmation" key={source.id} placeholder={source.name} required /></label>
      <small className="field full">The source is archived as an audit record after its useful data and history are moved to the survivor.</small>
      <div className="form-actions field full"><FormSubmitButton label="Merge contacts" pendingLabel="Merging contacts…" /></div>
    </form>
  );
}
