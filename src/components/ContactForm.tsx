"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { VoiceNoteButton } from "@/components/VoiceNoteButton";
import { createContactAction, updateContactAction } from "@/lib/contact-actions";
import { customFieldPlaceholder } from "@/lib/contact-custom-fields";

type GroupOption = { id: string; name: string; color: string | null; isActive: boolean };
type CustomFieldOption = { id: string; name: string; key: string };
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

      {mode === "create" && followUp && <section className="card contact-editor-section contact-first-follow-up">
        <div className="card-header"><div><h2>First follow-up</h2><p>Save the Contact and the first Important Date in one step.</p></div></div>
        <label className="checkbox-card onboarding-default">
          <input type="checkbox" name="scheduleFollowUp" checked={scheduleFollowUp} onChange={(event) => setScheduleFollowUp(event.target.checked)} />
          <span><strong>Schedule a follow-up now</strong><small>Create a {followUp.dateTypeName} Important Date and optionally start a matching active Mix.</small></span>
        </label>
        {scheduleFollowUp && <div className="form-grid contact-first-follow-up-fields">
          <input type="hidden" name="followUpDateTypeId" value={followUp.dateTypeId} />
          <div className="field"><label htmlFor="followUpDate">Follow-up date</label><input id="followUpDate" name="followUpDate" type="date" defaultValue={followUp.defaultDate ?? ""} required /></div>
          <div className="field"><label htmlFor="followUpReason">Reason</label><input id="followUpReason" name="followUpReason" defaultValue={followUp.defaultReason ?? "Follow up"} placeholder="Proposal follow-up" /></div>
          <div className="field full"><label htmlFor="followUpMixId">Follow-up plan</label>{followUp.mixes.length ? <><select id="followUpMixId" name="followUpMixId" defaultValue={followUp.mixes[0]?.id ?? ""}><option value="">Save the Important Date without starting a Mix</option>{followUp.mixes.map((mix) => <option key={mix.id} value={mix.id}>{mix.name}</option>)}</select><small>The selected active Mix is assigned immediately; its future Jumps are then reconciled.</small></> : <><input id="followUpMixId" name="followUpMixId" type="hidden" value="" /><small>No active Mix currently targets {followUp.dateTypeName}. The Important Date will still be saved.</small></>}</div>
        </div>}
      </section>}

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
        <div className="card-header"><div><h2>Groups and notes</h2><p>Inactive memberships remain attached to this Contact but cannot be newly assigned. Private Notes are intended only for phone-call context.</p></div></div>
        {groups.length ? <div className="group-choice-grid">{groups.map((group) => {
          const selected = selectedGroupIds.has(group.id);
          return (
            <div key={group.id}>
              {!group.isActive && selected && <input type="hidden" name="groupIds" value={group.id} />}
              <label className={`checkbox-card ${group.isActive ? "" : "inactive"}`}>
                <input type="checkbox" name={group.isActive ? "groupIds" : undefined} value={group.id} defaultChecked={selected} disabled={!group.isActive} />
                <span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />
                <span><strong>{group.name}</strong>{!group.isActive && <small>{selected ? "Inactive · membership preserved" : "Inactive under current plan"}</small>}</span>
              </label>
            </div>
          );
        })}</div> : <p className="muted-copy">No groups have been created yet. You can add them from the Contacts page.</p>}
        <div className="form-grid notes-grid">
          <div className="field full"><div className="field-label-row"><label htmlFor="publicNotes">Public Notes</label>{mode === "create" && <VoiceNoteButton targetId="publicNotes" />}</div><textarea id="publicNotes" name="publicNotes" defaultValue={contact?.publicNotes ?? ""} placeholder="Context that may be used in approved Jump placeholders." /></div>
          <div className="field full"><label htmlFor="privateNotes">Private Notes</label><textarea id="privateNotes" name="privateNotes" defaultValue={contact?.privateNotes ?? ""} placeholder="Sensitive call context. Never inserted into SMS or email Jumps." /></div>
        </div>
      </section>

      <section className="card contact-editor-section">
        <div className="card-header"><div><h2>Custom fields</h2><p>Workspace-specific values can be inserted into Jumps using their stable placeholder.</p></div><Link className="button small" href="/contacts/custom-fields">Manage fields</Link></div>
        {customFields.length ? <div className="form-grid">{customFields.map((field) => (
          <div className="field" key={field.id}>
            <input type="hidden" name="customFieldDefinitionId" value={field.id} />
            <label htmlFor={`custom-field-${field.id}`}><span>{field.name}</span><code>{customFieldPlaceholder(field.key)}</code></label>
            <input id={`custom-field-${field.id}`} name="customFieldValue" defaultValue={customValueByDefinition.get(field.id) ?? ""} maxLength={2000} />
          </div>
        ))}</div> : <p className="muted-copy">No custom fields yet. Create one when your workflow needs data beyond the standard Contact fields.</p>}
      </section>

      <div className="sticky-form-actions">
        <Link className="button" href={contact?.id ? `/contacts/${contact.id}` : "/contacts"}>Cancel</Link>
        <button className="button primary" type="submit">{mode === "create" ? scheduleFollowUp ? "Save & schedule follow-up" : "Save contact" : "Update contact"}</button>
      </div>
    </form>
  );
}
