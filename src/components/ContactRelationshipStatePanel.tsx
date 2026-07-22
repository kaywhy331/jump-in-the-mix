import type { Channel, ContactPriority } from "@/generated/prisma/client";
import { updateContactBasicsInlineAction, updateContactRelationshipStateAction } from "@/lib/contact-state-actions";

export type ContactRelationshipStateValue = {
  ownerUserId: string | null;
  preferredChannel: Channel | null;
  priority: ContactPriority;
  doNotContact: boolean;
  relationshipStatus: string | null;
  nextCommitmentAt: Date | null;
  version: number;
};

export function ContactRelationshipStatePanel({
  contactId,
  state,
  members
}: {
  contactId: string;
  state: ContactRelationshipStateValue;
  members: Array<{ userId: string; name: string; email: string }>;
}) {
  const nextCommitment = state.nextCommitmentAt ? new Date(state.nextCommitmentAt.getTime() - state.nextCommitmentAt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
  return (
    <form action={updateContactRelationshipStateAction} className="form-grid contact-relationship-state-form">
      <input type="hidden" name="contactId" value={contactId} />
      <input type="hidden" name="version" value={state.version} />
      <label className="field"><span>Relationship owner</span><select name="ownerUserId" defaultValue={state.ownerUserId ?? ""}><option value="">Unassigned</option>{members.map((member) => <option value={member.userId} key={member.userId}>{member.name} · {member.email}</option>)}</select></label>
      <label className="field"><span>Priority</span><select name="priority" defaultValue={state.priority}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
      <label className="field"><span>Preferred channel</span><select name="preferredChannel" defaultValue={state.preferredChannel ?? ""}><option value="">Not specified</option><option value="EMAIL">Email</option><option value="SMS">SMS</option><option value="PHONE_CALL">Phone call</option><option value="WHATSAPP">WhatsApp</option><option value="VOICEMAIL">Voicemail script</option></select></label>
      <label className="field"><span>Relationship status</span><input name="relationshipStatus" defaultValue={state.relationshipStatus ?? ""} maxLength={160} placeholder="Active client, prospect, partner…" /></label>
      <label className="field full"><span>Next commitment</span><input name="nextCommitmentAt" type="datetime-local" defaultValue={nextCommitment} /></label>
      <label className="checkbox-card field full"><input type="checkbox" name="doNotContact" defaultChecked={state.doNotContact} /><span><strong>Do not contact</strong><small>Cancel and suppress future pending Jumps until this setting is cleared.</small></span></label>
      <div className="form-actions field full"><button className="button primary" type="submit">Save relationship state</button></div>
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
      <label className="field full"><span>Customer notes summary</span><textarea name="publicNotes" defaultValue={publicNotes ?? ""} maxLength={20_000} rows={5} placeholder="How you met, preferences, background, family context, or other reusable relationship details." /></label>
      <div className="form-actions field full"><button className="button primary" type="submit">Save contact summary</button></div>
    </form>
  );
}
