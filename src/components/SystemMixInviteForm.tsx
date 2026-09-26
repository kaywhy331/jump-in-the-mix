"use client";
import { useEffect, useRef, useState } from "react";
import { FormGuard } from "@/components/FormGuard";
import { useFormStatus } from "react-dom";
import { sendSystemInviteAction } from "@/lib/system-mix-actions";
import { renderSystemMix, type SystemMixContent } from "@/lib/system-mix";
import { useConfirmDialog } from "@/components/useConfirmDialog";

type Contact = { id: string; displayName: string; emails: { email: string }[]; phones: { phone: string }[] };
type Recipient = { key: number; contactId: string; name: string; address: string; channel: "email" | "tel" };
function PrepareButton() {
  const { pending } = useFormStatus();
  return <button className="button primary" type="submit" disabled={pending}>{pending ? "Preparing invitations…" : "Add invitations to Today"}</button>;
}
export function SystemMixInviteForm({ contacts, sender, remaining, version, content }: { contacts: Contact[]; sender: string; remaining: number; version: number; content: SystemMixContent }) {
  const [recipients, setRecipients] = useState<Recipient[]>([{ key: 0, contactId: "", name: "", address: "", channel: "email" }]);
  const [query, setQuery] = useState(""); const [matches, setMatches] = useState(contacts); const [searchError, setSearchError] = useState(""); const [searching, setSearching] = useState(false); const [more, setMore] = useState(contacts.length >= 50);
  useEffect(() => { const controller = new AbortController(); setSearching(true); const timer = setTimeout(() => {
    fetch(`/api/contacts/recipient-search?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setMatches(data.contacts); setMore(data.more); setSearchError(""); }).catch(cause => { if (!controller.signal.aborted) setSearchError(cause.message || "Search is unavailable. Enter the recipient directly."); }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
  }, 250); return () => { clearTimeout(timer); controller.abort(); }; }, [query]);
  const [confirm, confirmDialog] = useConfirmDialog();
  const approved = useRef(false);
  const update = (key: number, data: Partial<Recipient>) => setRecipients(current => current.map(person => person.key === key ? { ...person, ...data } : person));
  return <form action={sendSystemInviteAction} className="form-stack" onSubmit={event => { if (approved.current) { approved.current = false; return; } event.preventDefault(); const form = event.currentTarget, submitter = (event.nativeEvent as SubmitEvent).submitter; void confirm({ title: `Prepare ${recipients.length} invitation${recipients.length === 1 ? "" : "s"} for ${recipients.map(person => person.address).join(", ")}?`, description: `This uses ${recipients.length} of your ${remaining} remaining slots, leaving ${remaining - recipients.length}. Revoking later does not restore slots. Nothing is sent now.`, confirmLabel: "Prepare invitations" }).then(ok => { if (ok) { approved.current = true; form.requestSubmit(submitter instanceof HTMLElement ? submitter : undefined); } }); }}><FormGuard /><label className="field"><span>Find a saved recipient</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, email, or phone" /></label><p role="status">{searching ? "Finding recipients…" : `${matches.length} matches${more ? "; refine the search for more people" : ""}. Your invitation entries stay below.`}</p>{searchError && <p role="alert">{searchError}</p>}
    <input type="hidden" name="systemMixVersion" value={version} /><input type="hidden" name="previewSender" value={sender} />
    <p>Add up to {remaining} {remaining === 1 ? "person" : "people"}. Each gets a unique link and a reminder in Today. You review the message and send it from your own text or email app.</p>
    {recipients.map((person, index) => {
      const preview = renderSystemMix(content, sender, person.name || person.address || "[your contact]");
      return <fieldset className="onboarding-step-card" key={person.key}><legend>Person {index + 1}</legend><div className="form-stack">
        <input type="hidden" name="contactId" value={person.contactId} />
        {(matches.length > 0 || person.contactId) && <label className="field"><span>Choose a saved contact (optional)</span><select value={person.contactId ? JSON.stringify([person.contactId, person.address]) : ""} onChange={event => {
          if (!event.target.value) return update(person.key, { contactId: "", name: "", address: "", channel: "email" });
          const [contactId, address] = JSON.parse(event.target.value) as string[];
          update(person.key, { contactId, address, channel: address.includes("@") ? "email" : "tel", name: matches.find(contact => contact.id === contactId)!.displayName });
        }}><option value="">Enter someone’s details</option>{person.contactId && !matches.some(contact => contact.id === person.contactId) && <option value={JSON.stringify([person.contactId, person.address])}>{person.name} · {person.address}</option>}{matches.flatMap(contact => [...contact.emails.map(item => item.email), ...contact.phones.map(item => item.phone)].map(address => <option key={`${contact.id}:${address}`} value={JSON.stringify([contact.id, address])}>{contact.displayName} · {address}</option>))}</select></label>}
        <label className="field"><span>Name (optional)</span><input name="name" value={person.name} onChange={event => update(person.key, { name: event.target.value })} maxLength={160} /></label>
        <label className="field"><span>Invitation channel</span><select value={person.channel} onChange={event => update(person.key, { channel: event.target.value as "email" | "tel" })}><option value="email">Email</option><option value="tel">Text message</option></select></label><label className="field"><span>Email address or text number</span><input type={person.channel} inputMode={person.channel} name="address" value={person.address} onChange={event => update(person.key, { address: event.target.value, contactId: "" })} required maxLength={254} autoComplete="off" placeholder="jordan@example.com or +1 555 555 0123" /></label>
        <details><summary>Preview invitation</summary><div className="speech-bubble speech-bubble--compose"><p><strong>{preview.subject}</strong></p><p style={{ whiteSpace: "pre-wrap" }}>{preview.body}</p><p>Their unique signup link will be added here. It can create one account.</p></div></details>
        {recipients.length > 1 && <button className="text-button" type="button" onClick={() => setRecipients(current => current.filter(row => row.key !== person.key))}>Remove person {index + 1}</button>}
      </div></fieldset>;
    })}
    {recipients.length < remaining && <button className="button" type="button" onClick={() => setRecipients(current => [...current, { key: Math.max(...current.map(row => row.key)) + 1, contactId: "", name: "", address: "", channel: "email" }])}>Add another person</button>}
    <p>Preparing a link uses one invitation. You decide when to send it from Today.</p>
    <PrepareButton />
  {confirmDialog}</form>;
}
