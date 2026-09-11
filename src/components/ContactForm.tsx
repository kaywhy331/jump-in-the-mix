"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { VoiceNoteButton } from "@/components/VoiceNoteButton";
import { createContactAction, updateContactAction } from "@/lib/contact-actions";
import { customFieldPlaceholder } from "@/lib/contact-custom-fields";
import { WhenField } from "@/components/WhenPicker";

type GroupOption = { id: string; name: string; color: string | null; isActive: boolean };
type CustomFieldOption = { id: string; name: string; key: string };
type ContactMethod = { value: string; label: string };
type ContactAddress = {
  id?: string;
  label: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};
type FollowUpOption = {
  dateTypeId: string;
  dateTypeName: string;
  mixes: { id: string; name: string }[];
  defaultDate?: string;
  defaultReason?: string;
};

type ContactFormValue = {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  publicNotes?: string | null;
  privateNotes?: string | null;
  emails?: { email: string; label: string | null; isPrimary: boolean }[];
  phones?: { phone: string; label: string | null; isPrimary: boolean }[];
  addresses?: {
    id: string;
    label: string | null;
    street1: string | null;
    street2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    isPrimary: boolean;
  }[];
  groupIds?: string[];
  customFieldValues?: { definitionId: string; value: string }[];
};

function primaryIndex<T extends { isPrimary: boolean }>(values: T[] | undefined): number {
  const index = values?.findIndex((item) => item.isPrimary) ?? -1;
  return index >= 0 ? index : 0;
}

function removeAt<T>(values: T[], index: number): T[] {
  return values.filter((_, itemIndex) => itemIndex !== index);
}

export function ContactForm({
  mode,
  contact,
  groups,
  customFields,
  followUp
}: {
  mode: "create" | "edit";
  contact?: ContactFormValue;
  groups: GroupOption[];
  customFields: CustomFieldOption[];
  followUp?: FollowUpOption | null;
}) {
  const startingEmails = useMemo<ContactMethod[]>(() => {
    const values = contact?.emails?.map((item) => ({ value: item.email, label: item.label ?? "" })) ?? [];
    return values.length ? values : [{ value: "", label: "" }];
  }, [contact?.emails]);
  const startingPhones = useMemo<ContactMethod[]>(() => {
    const values = contact?.phones?.map((item) => ({ value: item.phone, label: item.label ?? "" })) ?? [];
    return values.length ? values : [{ value: "", label: mode === "create" ? "Mobile" : "" }];
  }, [contact?.phones, mode]);
  const startingAddresses = useMemo<ContactAddress[]>(() => {
    const values = contact?.addresses?.map((item) => ({
      id: item.id,
      label: item.label ?? "",
      street1: item.street1 ?? "",
      street2: item.street2 ?? "",
      city: item.city ?? "",
      state: item.state ?? "",
      postalCode: item.postalCode ?? "",
      country: item.country ?? ""
    })) ?? [];
    return values.length ? values : [{ label: "", street1: "", street2: "", city: "", state: "", postalCode: "", country: "" }];
  }, [contact?.addresses]);

  const customValueByDefinition = useMemo(
    () => new Map((contact?.customFieldValues ?? []).map((item) => [item.definitionId, item.value])),
    [contact?.customFieldValues]
  );
  const selectedGroupIds = useMemo(() => new Set(contact?.groupIds ?? []), [contact?.groupIds]);
  const [emails, setEmails] = useState(startingEmails);
  const [phones, setPhones] = useState(startingPhones);
  const [addresses, setAddresses] = useState(startingAddresses);
  const [primaryEmail, setPrimaryEmail] = useState(primaryIndex(contact?.emails));
  const [primaryPhone, setPrimaryPhone] = useState(primaryIndex(contact?.phones));
  const [primaryAddress, setPrimaryAddress] = useState(primaryIndex(contact?.addresses));
  const [scheduleFollowUp, setScheduleFollowUp] = useState(Boolean(followUp?.defaultDate));

  const removeEmail = (index: number) => {
    const next = removeAt(emails, index);
    setEmails(next.length ? next : [{ value: "", label: "" }]);
    setPrimaryEmail((current) => current === index ? 0 : current > index ? current - 1 : current);
  };
  const removePhone = (index: number) => {
    const next = removeAt(phones, index);
    setPhones(next.length ? next : [{ value: "", label: "" }]);
    setPrimaryPhone((current) => current === index ? 0 : current > index ? current - 1 : current);
  };
  const removeAddress = (index: number) => {
    const next = removeAt(addresses, index);
    setAddresses(next.length ? next : [{ label: "", street1: "", street2: "", city: "", state: "", postalCode: "", country: "" }]);
    setPrimaryAddress((current) => current === index ? 0 : current > index ? current - 1 : current);
  };

  return (
    <form action={mode === "create" ? createContactAction : updateContactAction} className="contact-editor" onFocusCapture={(event) => {
      const control = event.target;
      if (!(control instanceof HTMLElement) || control.closest(".sticky-form-actions")) return;
      // Pointer-focused buttons and disclosures must stay put until activation.
      if (!control.matches(":focus-visible")) return;
      const bounds = control.getBoundingClientRect();
      const overlays = document.querySelectorAll(".sticky-form-actions, .mobile-nav, .mobile-app-header");
      const obscured = Array.from(overlays).some((overlay) => {
        const rect = overlay.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && bounds.left < rect.right && bounds.right > rect.left && bounds.top < rect.bottom && bounds.bottom > rect.top;
      });
      if (obscured) control.scrollIntoView({ block: "center", behavior: "instant" });
    }}>
      {contact?.id && <input type="hidden" name="contactId" value={contact.id} />}

      <section className="card contact-editor-section contact-quick-form">
        <div className="card-header"><div><h2>{mode === "create" ? "Add a person" : "Contact details"}</h2><p>{mode === "create" ? "A name and one way to reach them is plenty to start." : "Update the basics below."}</p></div></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" defaultValue={contact?.firstName ?? ""} autoFocus /></div>
          <div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" defaultValue={contact?.lastName ?? ""} /></div>
          {mode === "edit" && <div className="field full"><label htmlFor="company">Company</label><input id="company" name="company" defaultValue={contact?.company ?? ""} /></div>}
          {mode === "create" && <>
            <input type="hidden" name="phonePrimaryIndex" value="0" />
            {phones.map((item, index) => <div className="field" key={`quick-phone-${index}`}><label htmlFor={`quick-phone-${index}`}>{index ? `Phone ${index + 1}` : "Phone"}</label><input id={`quick-phone-${index}`} name="phoneValue" type="tel" inputMode="tel" autoComplete={index ? "off" : "tel"} value={item.value} onChange={(event) => setPhones((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))} placeholder="(555) 555-0123" /><input type="hidden" name="phoneLabel" value={index ? item.label || "Other" : "Mobile"} />{index > 0 && <button className="text-button" type="button" onClick={() => removePhone(index)}>Remove</button>}</div>)}
            <input type="hidden" name="emailPrimaryIndex" value="0" />
            {emails.map((item, index) => <div className="field" key={`quick-email-${index}`}><label htmlFor={`quick-email-${index}`}>{index ? `Email ${index + 1}` : <>Email <small>optional</small></>}</label><input id={`quick-email-${index}`} name="emailValue" type="email" inputMode="email" autoComplete={index ? "off" : "email"} value={item.value} onChange={(event) => setEmails((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))} /><input type="hidden" name="emailLabel" value={item.label || "Email"} />{index > 0 && <button className="text-button" type="button" onClick={() => removeEmail(index)}>Remove</button>}</div>)}
            {groups.length > 0 && <label className="field"><span>Tag <small>optional</small></span><select name="groupIds" defaultValue=""><option value="">No tag yet</option>{groups.filter((group) => group.isActive).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
            <div className="field full"><div className="field-label-row"><label htmlFor="publicNotes">Note <small>optional</small></label><VoiceNoteButton targetId="publicNotes" /></div><textarea id="publicNotes" name="publicNotes" defaultValue={contact?.publicNotes ?? ""} placeholder="Job, estimate, how you met, or anything worth remembering" /></div>
          </>}
        </div>
        {mode === "create" && <div className="page-actions"><button className="button small" type="button" onClick={() => setPhones((current) => [...current, { value: "", label: "Other" }])}>Add another phone</button><button className="button small" type="button" onClick={() => setEmails((current) => [...current, { value: "", label: "Other" }])}>Add another email</button></div>}
      </section>

      {mode === "create" && followUp && <section className="card contact-editor-section contact-first-follow-up">
        <div className="card-header"><div><h2>First follow-up</h2><p>Choose when you want this person to appear on Today.</p></div></div>
        <label className="checkbox-card onboarding-default">
          <input type="checkbox" name="scheduleFollowUp" checked={scheduleFollowUp} onChange={(event) => setScheduleFollowUp(event.target.checked)} />
          <span><strong>Schedule a follow-up now</strong><small>Start a matching mix if one is available.</small></span>
        </label>
        {scheduleFollowUp && <div className="form-grid contact-first-follow-up-fields">
          <input type="hidden" name="followUpDateTypeId" value={followUp.dateTypeId} />
          <div className="field"><span className="field-label">Follow-up date</span><WhenField label="Follow-up date" dateName="followUpDate" defaultDate={followUp.defaultDate ?? ""} noPast /></div>
          <div className="field"><label htmlFor="followUpReason">Reason</label><input id="followUpReason" name="followUpReason" defaultValue={followUp.defaultReason ?? "Follow up"} placeholder="Proposal follow-up" /></div>
          <div className="field full"><label htmlFor="followUpMixId">Mix</label>{followUp.mixes.length ? <select id="followUpMixId" name="followUpMixId" defaultValue={followUp.mixes[0]?.id ?? ""}><option value="">Just save the date</option>{followUp.mixes.map((mix) => <option key={mix.id} value={mix.id}>{mix.name}</option>)}</select> : <><input id="followUpMixId" name="followUpMixId" type="hidden" value="" /><small>You can add a mix later.</small></>}</div>
        </div>}
      </section>}

      {mode === "edit" && <section className="card contact-editor-section">
        <div className="card-header"><div><h2>Email addresses</h2><p>Choose the address used for email follow-ups.</p></div><button type="button" className="button small" onClick={() => setEmails((current) => [...current, { value: "", label: "" }])}>+ Add email</button></div>
        <div className="repeatable-list">
          {emails.map((item, index) => (
            <div className="repeatable-row" key={`email-${index}`}>
              <label className="primary-choice"><input type="radio" name="emailPrimaryIndex" value={index} checked={primaryEmail === index} onChange={() => setPrimaryEmail(index)} /><span>Primary</span></label>
              <input name="emailLabel" value={item.label} onChange={(event) => setEmails((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} placeholder="Work" aria-label={`Email ${index + 1} label`} />
              <input name="emailValue" type="email" inputMode="email" value={item.value} onChange={(event) => setEmails((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))} placeholder="person@example.com" aria-label={`Email ${index + 1}`} />
              <button type="button" className="button small danger" onClick={() => removeEmail(index)} aria-label={`Remove email ${index + 1}`}>Remove</button>
            </div>
          ))}
        </div>
      </section>}

      {mode === "edit" && <section className="card contact-editor-section">
        <div className="card-header"><div><h2>Phone numbers</h2><p>Choose the best number to reach this person.</p></div><button type="button" className="button small" onClick={() => setPhones((current) => [...current, { value: "", label: "" }])}>+ Add phone</button></div>
        <div className="repeatable-list">
          {phones.map((item, index) => (
            <div className="repeatable-row" key={`phone-${index}`}>
              <label className="primary-choice"><input type="radio" name="phonePrimaryIndex" value={index} checked={primaryPhone === index} onChange={() => setPrimaryPhone(index)} /><span>Primary</span></label>
              <input name="phoneLabel" value={item.label} onChange={(event) => setPhones((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} placeholder="Mobile" aria-label={`Phone ${index + 1} label`} />
              <input name="phoneValue" type="tel" inputMode="tel" value={item.value} onChange={(event) => setPhones((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))} placeholder="+1 555 123 4567" aria-label={`Phone ${index + 1}`} />
              <button type="button" className="button small danger" onClick={() => removePhone(index)} aria-label={`Remove phone ${index + 1}`}>Remove</button>
            </div>
          ))}
        </div>
      </section>}

      <details className="contact-more-details"><summary>{mode === "create" ? "More details" : "Addresses, tags, and notes"}</summary>
      {mode === "create" && <section className="card contact-editor-section"><div className="card-header"><div><h2>Company</h2><p>Optional.</p></div></div><label className="field"><span>Company</span><input id="company" name="company" defaultValue={contact?.company ?? ""} /></label></section>}
      <section className="card contact-editor-section">
        <div className="card-header"><div><h2>Addresses</h2><p>Save an address for visits, deliveries, or prepared messages.</p></div><button type="button" className="button small" onClick={() => setAddresses((current) => [...current, { label: "", street1: "", street2: "", city: "", state: "", postalCode: "", country: "" }])}>+ Add address</button></div>
        <div className="repeatable-list">
          {addresses.map((item, index) => (
            <fieldset className="address-row" key={`address-${index}`}>
              <legend>Address {index + 1}</legend>
              {item.id && <input type="hidden" name="addressId" value={item.id} />}
              {!item.id && <input type="hidden" name="addressId" value="" />}
              <label className="primary-choice"><input type="radio" name="addressPrimaryIndex" value={index} checked={primaryAddress === index} onChange={() => setPrimaryAddress(index)} /><span>Primary address</span></label>
              <div className="form-grid">
                <div className="field"><label htmlFor={`addressLabel-${index}`}>Label</label><input id={`addressLabel-${index}`} name="addressLabel" value={item.label} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} placeholder="Home or office" /></div>
                <div className="field"><label htmlFor={`addressCountry-${index}`}>Country</label><input id={`addressCountry-${index}`} name="addressCountry" value={item.country} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, country: event.target.value } : row))} placeholder="US" /></div>
                <div className="field full"><label htmlFor={`addressStreet1-${index}`}>Street</label><input id={`addressStreet1-${index}`} name="addressStreet1" value={item.street1} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, street1: event.target.value } : row))} /></div>
                <div className="field full"><label htmlFor={`addressStreet2-${index}`}>Street line 2</label><input id={`addressStreet2-${index}`} name="addressStreet2" value={item.street2} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, street2: event.target.value } : row))} /></div>
                <div className="field"><label htmlFor={`addressCity-${index}`}>City</label><input id={`addressCity-${index}`} name="addressCity" value={item.city} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, city: event.target.value } : row))} /></div>
                <div className="field"><label htmlFor={`addressState-${index}`}>State / region</label><input id={`addressState-${index}`} name="addressState" value={item.state} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, state: event.target.value } : row))} /></div>
                <div className="field"><label htmlFor={`addressPostalCode-${index}`}>Postal code</label><input id={`addressPostalCode-${index}`} name="addressPostalCode" inputMode="numeric" value={item.postalCode} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, postalCode: event.target.value } : row))} /></div>
              </div>
              <button type="button" className="button small danger" onClick={() => removeAddress(index)}>Remove address</button>
            </fieldset>
          ))}
        </div>
      </section>

      {mode === "edit" && <section className="card contact-editor-section" id="contact-notes">
        <div className="card-header"><div><h2>Tags and notes</h2><p>Use a private note for anything that should never appear in a prepared message.</p></div></div>
        {groups.length ? <div className="group-choice-grid">{groups.map((group) => {
          const selected = selectedGroupIds.has(group.id);
          return (
            <div key={group.id}>
              {!group.isActive && selected && <input type="hidden" name="groupIds" value={group.id} />}
              <label className={`checkbox-card ${group.isActive ? "" : "inactive"}`}>
                <input type="checkbox" name={group.isActive ? "groupIds" : undefined} value={group.id} defaultChecked={selected} disabled={!group.isActive} />
                <span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />
                <span><strong>{group.name}</strong>{!group.isActive && <small>{selected ? "Inactive · assignment preserved" : "Inactive"}</small>}</span>
              </label>
            </div>
          );
        })}</div> : <p className="muted-copy">No tags have been created yet. You can add them from the Contacts page.</p>}
        <div className="form-grid notes-grid">
          <div className="field full"><div className="field-label-row"><label htmlFor="publicNotes">Notes</label><VoiceNoteButton targetId="publicNotes" /></div><textarea id="publicNotes" name="publicNotes" defaultValue={contact?.publicNotes ?? ""} placeholder="How you met, preferences, background, or details worth remembering." /><small>A mix can use a note only when you deliberately add its note placeholder.</small></div>
          <div className="field full"><label htmlFor="privateNotes">Private note</label><textarea id="privateNotes" name="privateNotes" defaultValue={contact?.privateNotes ?? ""} placeholder="Sensitive context, commitments, or details for your eyes only." /><small>Private notes never appear in texts, emails, or WhatsApp messages.</small></div>
        </div>
      </section>}

      <section className="card contact-editor-section">
        <div className="card-header"><div><h2>Custom fields</h2><p>Customer details can be inserted into prepared messages with a placeholder.</p></div><Link className="button small" href="/contacts/custom-fields">Manage fields</Link></div>
        {customFields.length ? <div className="form-grid">{customFields.map((field) => (
          <div className="field" key={field.id}>
            <input type="hidden" name="customFieldDefinitionId" value={field.id} />
            <label htmlFor={`custom-field-${field.id}`}><span>{field.name}</span><code>{customFieldPlaceholder(field.key)}</code></label>
            <input id={`custom-field-${field.id}`} name="customFieldValue" defaultValue={customValueByDefinition.get(field.id) ?? ""} maxLength={2000} />
          </div>
        ))}</div> : <p className="muted-copy">No custom fields yet. Create one when your workflow needs data beyond the standard Contact fields.</p>}
      </section>
      </details>

      <div className="sticky-form-actions">
        <Link className="button" href={contact?.id ? `/contacts/${contact.id}` : "/contacts"}>Cancel</Link>
        <button className="button primary" type="submit">{mode === "create" ? scheduleFollowUp ? "Save & schedule follow-up" : "Save contact" : "Update contact"}</button>
      </div>
    </form>
  );
}
