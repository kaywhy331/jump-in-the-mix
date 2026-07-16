"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import {
  applyJumpToContactsAction,
  bulkArchiveContactsAction,
  bulkAssignGroupAction,
  bulkRemoveGroupAction
} from "@/lib/bulk-contact-actions";
import { createContactsCsv, type ExportContact } from "@/lib/contact-export";
import { archiveContactAction, createGroupAction, deleteGroupAction } from "@/lib/actions";
import { customFieldPlaceholder } from "@/lib/contact-custom-fields";

export type ContactBulkDto = ExportContact & {
  id: string;
  displayName: string;
  jumpDateCount: number;
  groupDetails: { id: string; name: string; color: string | null }[];
};

export type ContactBulkGroup = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  contactCount: number;
};

export type ContactBulkJump = {
  id: string;
  name: string;
  channel: string;
};

export type ContactBulkCustomField = {
  id: string;
  name: string;
  key: string;
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function contactIdsInputs(contactIds: string[]) {
  return contactIds.map((contactId) => <input key={contactId} type="hidden" name="contactIds" value={contactId} />);
}

export function ContactsBulkWorkspace({
  contacts,
  groups,
  jumps,
  customFields,
  groupLimit,
  query,
  groupFilter
}: {
  contacts: ContactBulkDto[];
  groups: ContactBulkGroup[];
  jumps: ContactBulkJump[];
  customFields: ContactBulkCustomField[];
  groupLimit: string;
  query: string;
  groupFilter: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [applyMode, setApplyMode] = useState<"existing" | "manual">(jumps.length ? "existing" : "manual");
  const [manualChannel, setManualChannel] = useState("SMS");
  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedContacts = useMemo(() => contacts.filter((contact) => selected.has(contact.id)), [contacts, selected]);
  const allSelected = contacts.length > 0 && selected.size === contacts.length;

  const toggleContact = (contactId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(contacts.map((contact) => contact.id)));

  const exportSelected = () => {
    if (!selectedContacts.length) return;
    const csv = createContactsCsv(selectedContacts);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jump-in-the-mix-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <header className="page-header contacts-page-header">
        <div><h1>Contacts</h1><p>Keep relationship details, Jump Dates, groups, and custom data together.</p></div>
        <div className="page-actions contacts-page-actions">
          <details className="group-manager">
            <summary className="button">Manage groups</summary>
            <div className="group-manager-panel">
              <div className="section-label"><h2>Contact Groups</h2><span>{groups.length}/{groupLimit}</span></div>
              <form action={createGroupAction} className="group-create-form">
                <input name="name" placeholder="Group name" aria-label="Group name" required />
                <input name="description" placeholder="Optional description" aria-label="Group description" />
                <label className="color-input"><span>Color</span><input name="color" type="color" defaultValue="#5d4cf2" /></label>
                <button className="button primary" type="submit">Add group</button>
              </form>
              {groups.length > 0 && <div className="group-manage-list">{groups.map((group) => (
                <div className="group-manage-row" key={group.id}>
                  <span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />
                  <span><strong>{group.name}</strong><small>{group.contactCount} contact{group.contactCount === 1 ? "" : "s"}</small></span>
                  <form action={deleteGroupAction}><input type="hidden" name="groupId" value={group.id} /><button className="button small danger" type="submit">Delete</button></form>
                </div>
              ))}</div>}
            </div>
          </details>
          <Link className="button" href="/contacts/custom-fields">Custom fields</Link>
          {contacts.length > 0 && <button className="button" type="button" onClick={toggleAll}>{allSelected ? "Deselect all" : "Select all"}</button>}
          <details className="group-manager contact-add-menu">
  <summary className="button primary">+ Add</summary>
  <div className="group-manager-panel contact-add-panel">
    <div className="section-label"><h2>Add Contacts</h2><span>Choose a source</span></div>
    <div className="settings-hub-grid contact-acquisition-grid">
      <Link className="settings-hub-card" href="/contacts/new"><span className="settings-hub-icon">＋</span><span><strong>New Contact</strong><small>Enter one person manually.</small></span></Link>
      <Link className="settings-hub-card" href="/contacts/import"><span className="settings-hub-icon">⇧</span><span><strong>Import CSV / VCF</strong><small>Map, deduplicate, review, and import a file.</small></span></Link>
      <Link className="settings-hub-card" href="/account#google-contacts"><span className="settings-hub-icon">G</span><span><strong>Google Contacts</strong><small>Connect labels or all Contacts on Plus and Pro.</small></span></Link>
    </div>
  </div>
</details>
        </div>
      </header>

      <form className="filter-bar contact-filter-bar" action="/contacts" method="get">
        <input name="q" defaultValue={query} placeholder="Search name, company, contact method, or custom value" aria-label="Search contacts" />
        <select name="group" defaultValue={groupFilter} aria-label="Filter Contacts by group"><option value="">All groups</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
        <button className="button" type="submit">Filter</button>
        {(query || groupFilter) && <Link className="button" href="/contacts">Clear</Link>}
      </form>

      {contacts.length ? (
        <div className="contact-list selectable-contact-list">
          {contacts.map((contact) => {
            const primaryEmail = contact.emails.find((item) => item.isPrimary) ?? contact.emails[0];
            const primaryPhone = contact.phones.find((item) => item.isPrimary) ?? contact.phones[0];
            const isSelected = selected.has(contact.id);
            return (
              <article className={`contact-row contact-select-row ${isSelected ? "selected" : ""}`} key={contact.id}>
                <label className="contact-select-control" title={isSelected ? "Deselect Contact" : "Select Contact"}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleContact(contact.id)} aria-label={`${isSelected ? "Deselect" : "Select"} ${contact.displayName}`} />
                  <span aria-hidden="true">{isSelected ? "✓" : ""}</span>
                </label>
                <Link href={`/contacts/${contact.id}`} className="contact-main">
                  <div className="avatar">{initials(contact.displayName) || "?"}</div>
                  <div>
                    <h3>{contact.displayName}</h3>
                    <div className="contact-meta">{contact.company && <span>{contact.company}</span>}{primaryEmail && <span>{primaryEmail.email}</span>}{primaryPhone && <span>{primaryPhone.phone}</span>}<span>{contact.jumpDateCount} Jump Date{contact.jumpDateCount === 1 ? "" : "s"}</span></div>
                    {contact.groupDetails.length > 0 && <div className="contact-group-list">{contact.groupDetails.slice(0, 3).map((group) => <span className="group-chip" key={group.id}><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />{group.name}</span>)}{contact.groupDetails.length > 3 && <span className="group-chip">+{contact.groupDetails.length - 3}</span>}</div>}
                  </div>
                </Link>
                <div className="table-actions"><Link className="button small" href={`/contacts/${contact.id}/edit`}>Edit</Link><details className="destructive-confirm"><summary className="button small danger">Archive…</summary><div className="destructive-confirm-panel"><p>Archive this Contact? Their future pending Jumps will be canceled.</p><form action={archiveContactAction}><input type="hidden" name="contactId" value={contact.id} /><button className="button small danger" type="submit">Confirm archive</button></form></div></details></div>
              </article>
            );
          })}
        </div>
      ) : query || groupFilter ? (
        <EmptyState title="No contacts matched those filters" description="Try a different search or Contact Group." actionHref="/contacts" actionLabel="Clear filters" />
      ) : (
        <EmptyState title="Start with one person" description="Add the next person you genuinely need to remember." actionHref="/contacts/new" actionLabel="Add my first contact" />
      )}

      {selectedIds.length > 0 && <aside className="bulk-contact-bar" aria-label="Bulk Contact actions">
        <div className="bulk-selection-count"><strong>{selectedIds.length}</strong><span>selected</span><button type="button" className="text-button" onClick={() => setSelected(new Set())}>Clear</button></div>

        <details className="bulk-action-menu">
          <summary className="button bulk-action-button"><span aria-hidden="true">◎</span><span className="bulk-action-label">Groups</span></summary>
          <div className="bulk-action-panel">
            <h3>Update Contact Groups</h3>
            {groups.length ? <>
              <form action={bulkAssignGroupAction} className="form-stack">{contactIdsInputs(selectedIds)}<div className="field"><label htmlFor="bulk-assign-group">Assign to group</label><select id="bulk-assign-group" name="groupId" required>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div><button className="button primary" type="submit">Assign group</button></form>
              <form action={bulkRemoveGroupAction} className="form-stack bulk-secondary-form">{contactIdsInputs(selectedIds)}<div className="field"><label htmlFor="bulk-remove-group">Remove from group</label><select id="bulk-remove-group" name="groupId" required>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div><button className="button" type="submit">Remove group</button></form>
            </> : <p className="muted-copy">Create a Contact Group first.</p>}
          </div>
        </details>

        <details className="bulk-action-menu bulk-apply-menu">
          <summary className="button primary bulk-action-button"><span aria-hidden="true">↗</span><span className="bulk-action-label">Apply Jump</span></summary>
          <div className="bulk-action-panel bulk-apply-panel">
            <h3>Apply one-time Jump</h3>
            <p className="muted-copy">Creates one pending Jump for every selected Contact. It does not create a recurring Mix.</p>
            <form action={applyJumpToContactsAction} className="form-stack">
              {contactIdsInputs(selectedIds)}
              <div className="bulk-mode-choice">
                <label className="checkbox-card"><input type="radio" name="applyMode" value="existing" checked={applyMode === "existing"} onChange={() => setApplyMode("existing")} disabled={!jumps.length} />Existing Jump</label>
                <label className="checkbox-card"><input type="radio" name="applyMode" value="manual" checked={applyMode === "manual"} onChange={() => setApplyMode("manual")} />One-time content</label>
              </div>
              {applyMode === "existing" ? (
                <div className="field"><label htmlFor="bulk-jump-template">Reusable Jump</label><select id="bulk-jump-template" name="stepTemplateId" required>{jumps.map((jump) => <option key={jump.id} value={jump.id}>{jump.channel.replaceAll("_", " ")} · {jump.name}</option>)}</select></div>
              ) : (
                <>
                  <div className="field"><label htmlFor="bulk-manual-name">Internal label</label><input id="bulk-manual-name" name="manualName" placeholder="One-time check-in" /></div>
                  <div className="field"><label htmlFor="bulk-manual-channel">Channel</label><select id="bulk-manual-channel" name="manualChannel" value={manualChannel} onChange={(event) => setManualChannel(event.target.value)}><option value="SMS">SMS</option><option value="EMAIL">Email</option><option value="PHONE_CALL">Phone Call</option><option value="VOICEMAIL">Ringless Voicemail</option><option value="WHATSAPP">WhatsApp</option></select></div>
                  {manualChannel === "EMAIL" && <div className="field"><label htmlFor="bulk-manual-subject">Email subject</label><input id="bulk-manual-subject" name="manualSubject" placeholder="A quick note for {{First Name}}" required /></div>}
                  {["SMS", "EMAIL", "WHATSAPP"].includes(manualChannel) && <div className="field"><label htmlFor="bulk-manual-body">Message</label><textarea id="bulk-manual-body" name="manualBody" placeholder="Hi {{First Name}}, …" required /></div>}
                  {["PHONE_CALL", "VOICEMAIL"].includes(manualChannel) && <div className="field"><label htmlFor="bulk-manual-script">{manualChannel === "PHONE_CALL" ? "Call script or notes" : "Voicemail script"}</label><textarea id="bulk-manual-script" name="manualScript" placeholder={manualChannel === "PHONE_CALL" ? "Type your call script or notes here…" : "Type the voicemail script here…"} required /></div>}
                  <small className="muted-copy">Supported placeholders include {"{{First Name}}"}, {"{{Company}}"}, {"{{Public Notes}}"}, My Info, and the custom fields below.</small>
                  {customFields.length > 0 && <div className="placeholder-chip-list" aria-label="Contact custom field placeholders">{customFields.map((field) => <code className="placeholder-chip static" key={field.id} title={field.name}>{customFieldPlaceholder(field.key)}</code>)}</div>}
                </>
              )}
              <div className="field"><label htmlFor="bulk-jump-reason">Reason shown on Jump page</label><input id="bulk-jump-reason" name="reason" placeholder="Personal check-in" /></div>
              <button className="button primary" type="submit">Create {selectedIds.length} Jump{selectedIds.length === 1 ? "" : "s"}</button>
            </form>
          </div>
        </details>

        <button className="button bulk-action-button" type="button" onClick={exportSelected}><span aria-hidden="true">⇩</span><span className="bulk-action-label">Export CSV</span></button>

        <details className="bulk-action-menu">
          <summary className="button danger bulk-action-button"><span aria-hidden="true">⌫</span><span className="bulk-action-label">Archive</span></summary>
          <div className="bulk-action-panel bulk-danger-panel"><h3>Archive selected Contacts?</h3><p>Future pending Jumps will be canceled. Completed history remains preserved.</p><form action={bulkArchiveContactsAction}>{contactIdsInputs(selectedIds)}<button className="button danger" type="submit">Archive {selectedIds.length} Contact{selectedIds.length === 1 ? "" : "s"}</button></form></div>
        </details>
      </aside>}
    </>
  );
}
