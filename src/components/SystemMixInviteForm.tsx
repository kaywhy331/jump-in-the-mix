"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { FormGuard } from "@/components/FormGuard";
import { useFormStatus } from "react-dom";
import { sendSystemInviteAction } from "@/lib/system-mix-actions";
import { renderSystemMix, type SystemMixContent } from "@/lib/system-mix";
import { useConfirmDialog } from "@/components/useConfirmDialog";

type Contact = { id: string; displayName: string; emails: { email: string }[]; phones: { phone: string }[] };
/** One person: typed text until a saved contact is chosen, then that contact's chosen address. */
type Recipient = { key: number; text: string; name: string; contactId: string; address: string };
type Suggestion = { contactId: string; name: string; address: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** What typed text is without a chosen contact: an email address, a phone number, or neither (a name to search). */
function classify(text: string): "email" | "tel" | "name" | "" {
  const value = text.trim();
  if (!value) return "";
  if (value.includes("@")) return EMAIL.test(value) ? "email" : "name";
  return /^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, "").length >= 7 ? "tel" : "name";
}
const addressOf = (person: Recipient) => person.contactId ? person.address : person.text.trim();
const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";
const blank = (key: number): Recipient => ({ key, text: "", name: "", contactId: "", address: "" });

function PrepareButton() {
  const { pending } = useFormStatus();
  return <button className="button primary" type="submit" disabled={pending}>{pending ? "Preparing invitations…" : "Add invitations to Today"}</button>;
}

function RecipientRow({ person, index, removable, excluded, onChange, onRemove }: { person: Recipient; index: number; removable: boolean; excluded: Set<string>; onChange: (data: Partial<Recipient>) => void; onRemove: () => void }) {
  const id = useId(), listId = `${id}-list`, hintId = `${id}-hint`;
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchError, setSearchError] = useState("");
  const query = person.contactId ? "" : person.text.trim();
  const excludedKey = [...excluded].sort().join(",");
  useEffect(() => {
    if (!query) { setSuggestions([]); setSearchError(""); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/contacts/recipient-search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data.contacts as Contact[]; })
        .then(contacts => {
          const skip = new Set(excludedKey.split(","));
          setSuggestions(contacts.filter(contact => !skip.has(contact.id)).flatMap(contact => [...contact.emails.map(item => item.email), ...contact.phones.map(item => item.phone)].map(address => ({ contactId: contact.id, name: contact.displayName, address }))).slice(0, 8));
          setActive(0); setSearchError("");
        })
        .catch(cause => { if (!controller.signal.aborted) { setSuggestions([]); setSearchError(cause.message || "Search is unavailable. Enter an email address or phone number."); } });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, excludedKey]);
  const kind = classify(person.text);
  const unmatched = !person.contactId && kind === "name";
  useEffect(() => { input.current?.setCustomValidity(unmatched ? "Choose someone from the list, or enter an email address or phone number." : ""); }, [unmatched]);
  const choose = (choice: Suggestion) => { onChange({ contactId: choice.contactId, name: choice.name, address: choice.address, text: "" }); setOpen(false); };
  const expanded = open && suggestions.length > 0;
  const hint = searchError || (kind === "email" ? "New contact · invited by email" : kind === "tel" ? "New contact · invited by text message" : unmatched ? (suggestions.length ? "Choose a saved contact, or enter an email or phone number." : "No saved contact matches. Enter an email address or phone number.") : "");

  return <li className="invite-row">
    <span className="invite-row-number" aria-hidden="true">{index + 1}</span>
    <div className="invite-row-body">
      <input type="hidden" name="contactId" value={person.contactId} />
      {person.contactId ? <div className="invite-chosen">
        <input type="hidden" name="address" value={person.address} /><input type="hidden" name="name" value={person.name} />
        <span className="invite-avatar" aria-hidden="true">{initial(person.name)}</span>
        <span className="invite-person"><strong>{person.name}</strong><small>{person.address}</small></span>
        {!removable && <button className="icon-button" type="button" aria-label={`Change person ${index + 1}: ${person.name}`} onClick={() => { onChange(blank(person.key)); requestAnimationFrame(() => input.current?.focus()); }}><AppIcon name="close" /></button>}
      </div> : <>
        <div className="invite-fields">
        <div className="invite-combobox">
          <input ref={input} name="address" value={person.text} required maxLength={254} autoComplete="off" spellCheck={false} placeholder="Name, email, or phone"
            role="combobox" aria-label={`Person ${index + 1}: name, email, or phone`} aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId} aria-describedby={hintId}
            aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
            onChange={event => { onChange({ text: event.target.value }); setOpen(true); }}
            onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
            onKeyDown={event => {
              if (!expanded) { if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setOpen(true); } return; }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(current => (current + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length); }
              else if (event.key === "Enter") { event.preventDefault(); choose(suggestions[active]); }
              else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
            }} />
          <ul className="invite-suggestions" id={listId} role="listbox" aria-label={`Saved contacts for person ${index + 1}`} hidden={!expanded}>
            {suggestions.map((choice, position) => <li key={`${choice.contactId}:${choice.address}`} id={`${id}-option-${position}`} role="option" aria-selected={position === active}
              onMouseDown={event => { event.preventDefault(); choose(choice); }} onMouseEnter={() => setActive(position)}>
              <span className="invite-avatar" aria-hidden="true">{initial(choice.name)}</span>
              <span className="invite-person"><strong>{choice.name}</strong><small>{choice.address}</small></span>
            </li>)}
          </ul>
        </div>
        {kind === "email" || kind === "tel"
          ? <input className="invite-name" name="name" value={person.name} onChange={event => onChange({ name: event.target.value })} maxLength={160} autoComplete="off" placeholder="Their name (optional)" aria-label={`Person ${index + 1}: their name (optional)`} />
          : <input type="hidden" name="name" value="" />}
        </div>
        <small className="invite-hint" id={hintId} aria-live="polite">{hint}</small>
      </>}
    </div>
    {removable && <button className="icon-button invite-remove" type="button" aria-label={`Remove person ${index + 1}`} onClick={onRemove}><AppIcon name="close" /></button>}
  </li>;
}

export function SystemMixInviteForm({ sender, remaining, version, content, invitedContactIds }: { sender: string; remaining: number; version: number; content: SystemMixContent; invitedContactIds: string[] }) {
  const [recipients, setRecipients] = useState<Recipient[]>([blank(0)]);
  const [confirm, confirmDialog] = useConfirmDialog();
  const approved = useRef(false);
  const update = (key: number, data: Partial<Recipient>) => setRecipients(current => current.map(person => person.key === key ? { ...person, ...data } : person));
  const first = recipients.find(person => person.name || person.contactId || classify(person.text) === "email" || classify(person.text) === "tel");
  const preview = renderSystemMix(content, sender, first ? first.name || addressOf(first) : "[your contact]");

  return <form action={sendSystemInviteAction} className="invite-form" onSubmit={event => {
    if (approved.current) { approved.current = false; return; }
    event.preventDefault();
    const form = event.currentTarget, submitter = (event.nativeEvent as SubmitEvent).submitter;
    void confirm({ title: `Prepare ${recipients.length} invitation${recipients.length === 1 ? "" : "s"} for ${recipients.map(addressOf).join(", ")}?`, description: `This uses ${recipients.length} of your ${remaining} remaining slots, leaving ${remaining - recipients.length}. Revoking later does not restore slots. Nothing is sent now.`, confirmLabel: "Prepare invitations" })
      .then(ok => { if (ok) { approved.current = true; form.requestSubmit(submitter instanceof HTMLElement ? submitter : undefined); } });
  }}>
    <input type="hidden" name="systemMixVersion" value={version} /><input type="hidden" name="previewSender" value={sender} />
    <ol className="invite-rows">
      {recipients.map((person, index) => <RecipientRow key={person.key} person={person} index={index} removable={recipients.length > 1}
        excluded={new Set([...invitedContactIds, ...recipients.filter(other => other.key !== person.key && other.contactId).map(other => other.contactId)])}
        onChange={data => update(person.key, data)} onRemove={() => setRecipients(current => current.filter(row => row.key !== person.key))} />)}
    </ol>
    {recipients.length < remaining && <button className="text-button invite-add" type="button" onClick={() => setRecipients(current => [...current, blank(Math.max(...current.map(row => row.key)) + 1)])}><AppIcon name="plus" />Add another person</button>}
    <details className="invite-preview"><summary>Preview invitation</summary><div className="speech-bubble speech-bubble--compose"><p><strong>{preview.subject}</strong></p><p className="invite-preview-body">{preview.body}</p><p className="invite-preview-link">Their unique signup link goes here. It can create one account.</p></div></details>
    <div className="invite-submit"><PrepareButton /><FormGuard /></div>
    <p className="invite-footnote">Nothing is sent yet. Each invitation waits in Today, and you send it from your own email or text app.</p>
    {confirmDialog}
  </form>;
}
