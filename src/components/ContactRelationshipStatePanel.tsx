"use client";

import type { Channel, ContactPriority } from "@/generated/prisma/client";
import { useRef, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useFormStatus } from "react-dom";
import { updateContactBasicsInlineAction, updateContactRelationshipStateAction } from "@/lib/contact-state-actions";
import { useConfirmDialog } from "@/components/useConfirmDialog";

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

/** Priority and Prefers. Do not contact is in the profile's ••• menu (D77); this form carries it unchanged. */
export function ContactRelationshipStatePanel({
  contactId,
  state
}: {
  contactId: string;
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
      {state.doNotContact && <input type="hidden" name="doNotContact" value="on" />}
      <PreferenceSaveState><fieldset><legend>Priority</legend><div className="relationship-chip-row">{(["LOW", "NORMAL", "HIGH", "URGENT"] as const).map((priority) => <label className="relationship-chip" key={priority}><input type="radio" name="priority" value={priority} defaultChecked={state.priority === priority} onChange={save} /><span>{priority === "NORMAL" ? "Normal" : priority[0] + priority.slice(1).toLowerCase()}</span></label>)}</div></fieldset>
      <fieldset><legend>Prefers</legend><div className="relationship-chip-row">{([{ value: "", label: "Any" }, { value: "SMS", label: "Text" }, { value: "PHONE_CALL", label: "Call" }, { value: "EMAIL", label: "Email" }] as const).map((channel) => <label className="relationship-chip" key={channel.value || "any"}><input type="radio" name="preferredChannel" value={channel.value} defaultChecked={(state.preferredChannel ?? "") === channel.value} onChange={save} /><span>{channel.label}</span></label>)}</div></fieldset>
      <noscript><button className="button small" type="submit">Save preferences</button></noscript></PreferenceSaveState>
    </form>
  );
}

function DoNotContactButton({ on, onTurnOn }: { on: boolean; onTurnOn: () => void }) {
  const { pending } = useFormStatus();
  return <button type={on ? "submit" : "button"} onClick={on ? undefined : onTurnOn} disabled={pending} aria-busy={pending}><AppIcon name="flag" />{pending ? "Saving…" : on ? "Turn off Do not contact" : "Do not contact"}</button>;
}

/** Do not contact as a row of the profile's ••• menu (D77). Turning it on asks first, as it stops the person's
 *  pending follow-ups; the rest of their preferences go with it unchanged. */
export function DoNotContactMenuItem({ contactId, pendingCount, state }: { contactId: string; pendingCount: number; state: ContactRelationshipStateValue }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirm, confirmDialog] = useConfirmDialog();
  const turnOn = () => void confirm({ title: `Stop ${pendingCount} pending follow-up${pendingCount === 1 ? "" : "s"} for this person?`, description: "Saved history stays available. You can still open contact details, but must respect their contact preference. Turning this off can prepare future follow-ups again.", confirmLabel: "Stop follow-ups", danger: true }).then(stop => { if (stop) formRef.current?.requestSubmit(); });
  return <form ref={formRef} action={updateContactRelationshipStateAction} data-closes-menu>
    <input type="hidden" name="intent" value="do-not-contact" />
    <input type="hidden" name="contactId" value={contactId} />
    <input type="hidden" name="version" value={state.version} />
    <input type="hidden" name="priority" value={state.priority} />
    <input type="hidden" name="preferredChannel" value={state.preferredChannel ?? ""} />
    <input type="hidden" name="relationshipStatus" value={state.relationshipStatus ?? ""} />
    <input type="hidden" name="nextCommitmentAt" value={state.nextCommitmentAt?.toISOString() ?? ""} />
    {!state.doNotContact && <input type="hidden" name="doNotContact" value="on" />}
    <DoNotContactButton on={state.doNotContact} onTurnOn={turnOn} />
    {confirmDialog}
  </form>;
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
