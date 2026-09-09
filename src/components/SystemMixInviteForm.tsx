"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { sendSystemInviteAction } from "@/lib/system-mix-actions";
import { renderSystemMix, type SystemMixContent } from "@/lib/system-mix";

type Contact = { id: string; displayName: string; emails: { email: string }[] };
function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button primary" type="submit" disabled={disabled || pending}>{pending ? "Preparing invitation…" : "Send personal invitation"}</button>;
}
export function SystemMixInviteForm({ contacts, sender, remaining, version, content }: { contacts: Contact[]; sender: string; remaining: number; version: number; content: SystemMixContent }) {
  const [recipient, setRecipient] = useState("");
  const selected = contacts.find(contact => contact.emails.some(item => JSON.stringify({ contactId: contact.id, email: item.email }) === recipient));
  const preview = renderSystemMix(content, sender, selected?.displayName ?? "[your contact]");
  return <form action={sendSystemInviteAction} className="form-stack">
    <input type="hidden" name="systemMixVersion" value={version} /><input type="hidden" name="previewSender" value={sender} /><input type="hidden" name="previewContact" value={selected?.displayName ?? ""} />
    <label className="field"><span>1. Choose someone in your circle</span><select name="recipient" value={recipient} onChange={event => setRecipient(event.target.value)} required disabled={remaining === 0}>
      <option value="">Choose a contact and email</option>
      {contacts.flatMap(contact => contact.emails.map(item => <option key={`${contact.id}:${item.email}`} value={JSON.stringify({ contactId: contact.id, email: item.email })}>{contact.displayName} · {item.email}</option>))}
    </select></label>
    <div className="field"><span>2. Review your invitation</span><div className="speech-bubble speech-bubble--compose"><p><strong>Subject:</strong> {preview.subject}</p><p style={{ whiteSpace: "pre-wrap" }}>{preview.body}</p><p>Their unique, single-use access link will be included in the email, along with a link to stop invitation emails.</p></div></div>
    <p>3. Send through Jump in the Mix. This uses one of your five invitations. Your contact must use the selected email to join.</p>
    <SendButton disabled={!recipient || remaining === 0} />
  </form>;
}
