"use client";

import type { Channel, ContactPriority } from "@/generated/prisma/client";
import { useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { updateContactBasicsInlineAction, updateContactRelationshipStateAction } from "@/lib/contact-state-actions";

export type ContactRelationshipStateValue = {
  preferredChannel: Channel | null;
  priority: ContactPriority;
  doNotContact: boolean;
  relationshipStatus: string | null;
  nextCommitmentAt: Date | null;
  version: number;
};

function PreferenceSaveState({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <><fieldset className="relationship-save-fields" aria-label="Contact preferences" disabled={pending}>{children}</fieldset><span role="status" className="muted-copy">{pending ? "Saving preferences…" : ""}</span></>;
}

export function ContactRelationshipStatePanel({
  contactId,
  pendingCount,
  state
}: {
  contactId: string;
  pendingCount: number;
  state: ContactRelationshipStateValue;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const save = () => formRef.current?.requestSubmit();
  return (
    <form ref={formRef} action={updateContactRelationshipStateAction} className="contact-relationship-chips">
      <input type="hidden" name="contactId" value={contactId} />
      <input type="hidden" name="version" value={state.version} />
      <input type="hidden" name="relationshipStatus" value={state.relationshipStatus ?? ""} />
      <input type="hidden" name="nextCommitmentAt" value={state.nextCommitmentAt?.toISOString() ?? ""} />
      <PreferenceSaveState><fieldset><legend>Priority</legend><div className="relationship-chip-row">{(["LOW", "NORMAL", "HIGH", "URGENT"] as const).map((priority) => <label className="relationship-chip" key={priority}><input type="radio" name="priority" value={priority} defaultChecked={state.priority === priority} onChange={save} /><span>{priority === "NORMAL" ? "Normal" : priority[0] + priority.slice(1).toLowerCase()}</span></label>)}</div></fieldset>
      <fieldset><legend>Prefers</legend><div className="relationship-chip-row">{([{ value: "", label: "Any" }, { value: "SMS", label: "Text" }, { value: "PHONE_CALL", label: "Call" }, { value: "EMAIL", label: "Email" }] as const).map((channel) => <label className="relationship-chip" key={channel.value || "any"}><input type="radio" name="preferredChannel" value={channel.value} defaultChecked={(state.preferredChannel ?? "") === channel.value} onChange={save} /><span>{channel.label}</span></label>)}</div></fieldset>
      <label className="relationship-toggle"><input type="checkbox" name="doNotContact" defaultChecked={state.doNotContact} onChange={event => { if (event.target.checked && !window.confirm(`Stop ${pendingCount} pending follow-up${pendingCount === 1 ? "" : "s"} for this person? Saved history stays available. You can still open contact details, but must respect their contact preference. Turning this off can prepare future follow-ups again.`)) { event.target.checked = false; return; } save(); }} /><span><strong>Do not contact</strong><small>{pendingCount} pending follow-up{pendingCount === 1 ? "" : "s"} will stop. Saved drafts and history remain. Manual contact links remain available; respect this preference.</small></span></label>
      <noscript><button className="button small" type="submit">Save preferences</button></noscript></PreferenceSaveState>
    </form>
  );
}

export function ContactInlineBasicsForm({
  contactId,
  company,
  primaryEmail,
  primaryPhone,
  publicNotes
}: {
  contactId: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  publicNotes: string | null;
}) {
  return (
    <form action={updateContactBasicsInlineAction} className="form-grid contact-inline-basics-form">
      <input type="hidden" name="contactId" value={contactId} />
      <label className="field"><span>Company</span><input name="company" defaultValue={company ?? ""} maxLength={240} /></label>
      <label className="field"><span>Primary email</span><input name="primaryEmail" type="email" defaultValue={primaryEmail ?? ""} maxLength={254} /></label>
      <label className="field"><span>Primary phone</span><input name="primaryPhone" type="tel" defaultValue={primaryPhone ?? ""} maxLength={80} /></label>
      <label className="field full"><span>Customer summary</span><textarea name="publicNotes" defaultValue={publicNotes ?? ""} maxLength={20_000} rows={5} placeholder="How you met, preferences, background, family context, or other useful details." /></label>
      <div className="form-actions field full"><button className="button primary" type="submit">Save contact summary</button></div>
    </form>
  );
}
