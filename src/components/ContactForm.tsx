"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createContactAction, updateContactAction } from "@/lib/actions";

type GroupOption = { id: string; name: string; color: string | null };
type ContactMethod = { value: string; label: string };
type ContactAddress = {
  label: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
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
  groups
}: {
  mode: "create" | "edit";
  contact?: ContactFormValue;
  groups: GroupOption[];
}) {
  const startingEmails = useMemo<ContactMethod[]>(() => {
    const values = contact?.emails?.map((item) => ({ value: item.email, label: item.label ?? "" })) ?? [];
    return values.length ? values : [{ value: "", label: "" }];
  }, [contact?.emails]);
  const startingPhones = useMemo<ContactMethod[]>(() => {
    const values = contact?.phones?.map((item) => ({ value: item.phone, label: item.label ?? "" })) ?? [];
    return values.length ? values : [{ value: "", label: "" }];
  }, [contact?.phones]);
  const startingAddresses = useMemo<ContactAddress[]>(() => {
    const values = contact?.addresses?.map((item) => ({
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

  const [emails, setEmails] = useState(startingEmails);
  const [phones, setPhones] = useState(startingPhones);
  const [addresses, setAddresses] = useState(startingAddresses);
  const [primaryEmail, setPrimaryEmail] = useState(primaryIndex(contact?.emails));
  const [primaryPhone, setPrimaryPhone] = useState(primaryIndex(contact?.phones));
  const [primaryAddress, setPrimaryAddress] = useState(primaryIndex(contact?.addresses));

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
    <form action={mode === "create" ? createContactAction : updateContactAction} className="contact-editor">
      {contact?.id && <input type="hidden" name="contactId" value={contact.id} />}

      <section className="card contact-editor-section">
        <div className="card-header"><div><h2>Contact details</h2><p>Only one identifying value is required.</p></div></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" defaultValue={contact?.firstName ?? ""} autoFocus /></div>
          <div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" defaultValue={contact?.lastName ?? ""} /></div>
          <div className="field full"><label htmlFor="company">Company</label><input id="company" name="company" defaultValue={contact?.company ?? ""} /></div>
        </div>
      </section>

      <section className="card contact-editor-section">
        <div className="card-header"><div><h2>Email addresses</h2><p>Choose the address used for email Jumps.</p></div><button type="button" className="button small" onClick={() => setEmails((current) => [...current, { value: "", label: "" }])}>+ Add email</button></div>
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
      </section>

      <section className="card contact-editor-section">
        <div className="card-header"><div><h2>Phone numbers</h2><p>Numbers are normalized before saving.</p></div><button type="button" className="button small" onClick={() => setPhones((current) => [...current, { value: "", label: "" }])}>+ Add phone</button></div>
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
      </section>

      <section className="card contact-editor-section">
        <div className="card-header"><div><h2>Addresses</h2><p>Choose the primary address available to placeholders.</p></div><button type="button" className="button small" onClick={() => setAddresses((current) => [...current, { label: "", street1: "", street2: "", city: "", state: "", postalCode: "", country: "" }])}>+ Add address</button></div>
        <div className="repeatable-list">
          {addresses.map((item, index) => (
            <fieldset className="address-row" key={`address-${index}`}>
              <legend>Address {index + 1}</legend>
              <label className="primary-choice"><input type="radio" name="addressPrimaryIndex" value={index} checked={primaryAddress === index} onChange={() => setPrimaryAddress(index)} /><span>Primary address</span></label>
              <div className="form-grid">
                <div className="field"><label>Label</label><input name="addressLabel" value={item.label} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} placeholder="Home or office" /></div>
                <div className="field"><label>Country</label><input name="addressCountry" value={item.country} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, country: event.target.value } : row))} placeholder="US" /></div>
                <div className="field full"><label>Street</label><input name="addressStreet1" value={item.street1} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, street1: event.target.value } : row))} /></div>
                <div className="field full"><label>Street line 2</label><input name="addressStreet2" value={item.street2} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, street2: event.target.value } : row))} /></div>
                <div className="field"><label>City</label><input name="addressCity" value={item.city} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, city: event.target.value } : row))} /></div>
                <div className="field"><label>State / region</label><input name="addressState" value={item.state} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, state: event.target.value } : row))} /></div>
                <div className="field"><label>Postal code</label><input name="addressPostalCode" inputMode="numeric" value={item.postalCode} onChange={(event) => setAddresses((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, postalCode: event.target.value } : row))} /></div>
              </div>
              <button type="button" className="button small danger" onClick={() => removeAddress(index)}>Remove address</button>
            </fieldset>
          ))}
        </div>
      </section>

      <section className="card contact-editor-section">
        <div className="card-header"><div><h2>Groups and notes</h2><p>Private Notes are intended only for phone-call context.</p></div></div>
        {groups.length ? <div className="group-choice-grid">{groups.map((group) => (
          <label className="checkbox-card" key={group.id}>
            <input type="checkbox" name="groupIds" value={group.id} defaultChecked={contact?.groupIds?.includes(group.id)} />
            <span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />
            <span>{group.name}</span>
          </label>
        ))}</div> : <p className="muted-copy">No groups have been created yet. You can add them from the Contacts page.</p>}
        <div className="form-grid notes-grid">
          <div className="field full"><label htmlFor="publicNotes">Public Notes</label><textarea id="publicNotes" name="publicNotes" defaultValue={contact?.publicNotes ?? ""} placeholder="Context that may be used in approved Jump placeholders." /></div>
          <div className="field full"><label htmlFor="privateNotes">Private Notes</label><textarea id="privateNotes" name="privateNotes" defaultValue={contact?.privateNotes ?? ""} placeholder="Sensitive call context. Never inserted into SMS or email Jumps." /></div>
        </div>
      </section>

      <div className="sticky-form-actions">
        <Link className="button" href={contact?.id ? `/contacts/${contact.id}` : "/contacts"}>Cancel</Link>
        <button className="button primary" type="submit">{mode === "create" ? "Save contact" : "Update contact"}</button>
      </div>
    </form>
  );
}
