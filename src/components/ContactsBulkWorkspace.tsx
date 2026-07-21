"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DeviceContactQuickAdd } from "@/components/DeviceContactQuickAdd";
import { EmptyState } from "@/components/EmptyState";
import { archiveContactAction } from "@/lib/actions";
import {
  applyJumpToContactsAction,
  bulkArchiveContactsAction,
  bulkRemoveGroupAction
} from "@/lib/bulk-contact-actions";
import { customFieldPlaceholder } from "@/lib/contact-custom-fields";
import { createContactsCsv, type ExportContact } from "@/lib/contact-export";
import {
  assignSelectedContactsToActiveGroupAction,
  createContactGroupAction,
  deleteContactGroupAction,
  saveActiveGroupsAction
} from "@/lib/group-actions";

export type ContactBulkDto = ExportContact & {
  id: string;
  displayName: string;
  jumpDateCount: number;
  groupDetails: { id: string; name: string; color: string | null; isActive: boolean }[];
  lastInteraction: string | null;
  nextJump: string | null;
  nextJumpOverdue: boolean;
  relationshipType: string | null;
  preferredChannel: string | null;
  priority: string | null;
};

export type ContactBulkGroup = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  contactCount: number;
  isActive: boolean;
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
  groupFilter,
  intent
}: {
  contacts: ContactBulkDto[];
  groups: ContactBulkGroup[];
  jumps: ContactBulkJump[];
  customFields: ContactBulkCustomField[];
  groupLimit: string;
  query: string;
  groupFilter: string;
  intent?: "important-date" | "one-time-jump";
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState(intent === "one-time-jump");
  const [applyMode, setApplyMode] = useState<"existing" | "manual">(jumps.length ? "existing" : "manual");
  const [manualChannel, setManualChannel] = useState("SMS");
  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedContacts = useMemo(() => contacts.filter((contact) => selected.has(contact.id)), [contacts, selected]);
  const activeGroups = useMemo(() => groups.filter((group) => group.isActive), [groups]);
  const inactiveGroupCount = groups.length - activeGroups.length;
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
  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelected(new Set());
  };

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
        <div><h1>Contacts</h1><p>Keep relationship details, Important Dates, groups, and custom data together.</p></div>
        <div className="page-actions contacts-page-actions">
          <details className="group-manager contact-tools-menu">
            <summary className="button mobile-header-action" aria-label="More Contact tools"><AppIcon name="more"/><span className="mobile-action-label">More</span></summary>
            <div className="group-manager-panel contact-tools-panel">
              <button className="icon-button panel-close" type="button" aria-label="Close Contact tools" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}><AppIcon name="close" /></button>
              <div className="contact-tools-links"><Link href="/contacts/import">Import Contacts</Link><Link href="/contacts/custom-fields">Custom fields</Link></div>
              <div className="section-label"><h2>Contact Groups</h2><span>{activeGroups.length}/{groupLimit} active · {groups.length} stored</span></div>
              <p className="muted-copy">Inactive groups keep their Contacts and Mix assignments, but cannot receive new assignments or generate group-based Jumps. Select which groups remain active under your current plan.</p>
              <form action={createContactGroupAction} className="group-create-form">
                <input name="name" placeholder="Group name" aria-label="Group name" required />
                <input name="description" placeholder="Optional description" aria-label="Group description" />
                <label className="color-input"><span>Color</span><input name="color" type="color" defaultValue="#5d4cf2" /></label>
                <button className="button primary" type="submit">Add group</button>
              </form>
              {groups.length > 0 && (
                <>
                  <form id="group-activation-form" action={saveActiveGroupsAction} />
                  <div className="group-manage-list">
                    {groups.map((group) => (
                      <div className={`group-manage-row ${group.isActive ? "" : "inactive"}`} key={group.id}>
                        <label className="date-type-active-choice">
                          <input form="group-activation-form" type="checkbox" name="activeGroupIds" value={group.id} defaultChecked={group.isActive} />
                          <span>{group.isActive ? "Active" : "Inactive"}</span>
                        </label>
                        <span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />
                        <span><strong>{group.name}</strong><small>{group.contactCount} contact{group.contactCount === 1 ? "" : "s"}</small></span>
                        <ConfirmDialog trigger="Delete…" title={`Delete ${group.name}?`} description="The group is removed, but its Contacts and completed Jump history remain." danger><form action={deleteContactGroupAction}><input type="hidden" name="groupId" value={group.id} /><button className="button small danger" type="submit">Confirm delete</button></form></ConfirmDialog>
                      </div>
                    ))}
                  </div>
                  <div className="form-actions"><button className="button primary" form="group-activation-form" type="submit">Save active selection</button></div>
                </>
              )}
              {inactiveGroupCount > 0 && <small className="muted-copy">{inactiveGroupCount} group{inactiveGroupCount === 1 ? " is" : "s are"} preserved as inactive. Upgrade or deactivate another group to make one active.</small>}
            </div>
          </details>
          <details className="group-manager contact-add-menu">
            <summary className="button primary mobile-header-action" aria-label="Add Contact"><AppIcon name="add"/><span className="mobile-action-label">Add Contact</span></summary>
            <div className="group-manager-panel contact-add-panel">
              <button className="icon-button panel-close" type="button" aria-label="Close Add Contact" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}><AppIcon name="close" /></button>
              <div className="section-label"><h2>Add Contacts</h2><span>Choose a source</span></div>
              <div className="settings-hub-grid contact-acquisition-grid">
                <Link className="settings-hub-card" href="/contacts/new"><span className="settings-hub-icon"><AppIcon name="add" /></span><span><strong>New Contact</strong><small>Enter one person manually.</small></span></Link>
                <DeviceContactQuickAdd />
                <Link className="settings-hub-card" href="/contacts/import"><span className="settings-hub-icon"><AppIcon name="import" /></span><span><strong>Import CSV / VCF</strong><small>Map, deduplicate, review, and import a file.</small></span></Link>
                <Link className="settings-hub-card" href="/account#google-contacts"><span className="settings-hub-icon">G</span><span><strong>Google Contacts</strong><small>Connect labels or all Contacts on Plus and Pro.</small></span></Link>
              </div>
            </div>
          </details>
        </div>
      </header>

      {intent === "important-date" && <div className="notice info" role="status"><strong>Choose who the date belongs to.</strong> Use Add Important Date on the right of a Contact to continue.</div>}
      {intent === "one-time-jump" && <div className="notice info" role="status"><strong>Choose one or more Contacts.</strong> Select the people below; the one-time Jump composer will open automatically.</div>}

      <form className="filter-bar contact-filter-bar desktop-only" action="/contacts" method="get">
        <input name="q" type="search" defaultValue={query} placeholder="Search name, phone, email, company, or notes" aria-label="Search contacts" autoComplete="off" />
        <select name="group" defaultValue={groupFilter} aria-label="Filter Contacts by group"><option value="">All groups</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.isActive ? group.name : `Inactive · ${group.name}`}</option>)}</select>
        <button className="button" type="submit">Filter</button>
        {(query || groupFilter) && <Link className="button" href="/contacts">Clear</Link>}
        {contacts.length > 0 && <button className="button contact-select-toggle" type="button" onClick={toggleSelectionMode}>{selectionMode ? "Done selecting" : "Select"}</button>}
      </form>
      <div className="mobile-contact-controls contact-selection-controls mobile-only">
        <form className="mobile-search-form" action="/contacts" method="get"><input name="q" type="search" defaultValue={query} placeholder="Search contacts" aria-label="Search contacts" autoComplete="off" />{groupFilter && <input type="hidden" name="group" value={groupFilter}/>}<button className="sr-only" type="submit">Search contacts</button></form>
        <details className="mobile-filter-disclosure"><summary className={groupFilter ? "button filter-trigger active" : "button filter-trigger"}><AppIcon name="settings"/><span>Filter{groupFilter ? " 1" : ""}</span></summary><form className="mobile-filter-panel" action="/contacts" method="get"><input type="hidden" name="q" value={query}/><label className="filter-field"><span>Group</span><select name="group" defaultValue={groupFilter} aria-label="Filter Contacts by group"><option value="">All groups</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.isActive ? group.name : `Inactive · ${group.name}`}</option>)}</select></label><div className="mobile-filter-actions"><Link className="button" href={query ? `/contacts?q=${encodeURIComponent(query)}` : "/contacts"}>Reset</Link><button className="button primary" type="submit">Apply</button></div></form></details>
        {contacts.length > 0 && <button className="button contact-select-toggle" type="button" onClick={toggleSelectionMode}>{selectionMode ? "Done" : "Select"}</button>}
      </div>

      {contacts.length ? (
        <div className="contact-list selectable-contact-list">
          {contacts.map((contact) => {
            const isSelected = selected.has(contact.id);
            const primaryEmail = contact.emails.find((item) => item.isPrimary)?.email ?? contact.emails[0]?.email;
            const primaryPhone = contact.phones.find((item) => item.isPrimary)?.phone ?? contact.phones[0]?.phone;
            return (
              <article className={`contact-row contact-select-row ${selectionMode ? "selection-mode" : ""} ${isSelected ? "selected" : ""}`} key={contact.id}>
                <label className="contact-select-control" title={isSelected ? "Deselect Contact" : "Select Contact"}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleContact(contact.id)} aria-label={`${isSelected ? "Deselect" : "Select"} ${contact.displayName}`} />
                  <span>{isSelected ? <AppIcon name="check" /> : null}</span>
                </label>
                <Link href={`/contacts/${contact.id}`} className="contact-main">
                  <div className="avatar">{initials(contact.displayName) || "?"}</div>
                  <div>
                    <h3>{contact.displayName}</h3>
                    <div className="contact-relationship-state"><span><small>Last interaction</small><strong>{contact.lastInteraction ?? "No completed Jump yet"}</strong></span><span><small>Next Jump</small><strong className={contact.nextJumpOverdue ? "overdue-text" : ""}>{contact.nextJump ?? "Nothing scheduled"}</strong></span></div>
                    <p className="contact-mobile-meta mobile-only">{contact.groupDetails[0]?.name ?? contact.relationshipType ?? "Contact"} · {contact.nextJump ?? "No jump scheduled"}</p>
                    <div className="contact-visible-details">
                      <div className="contact-method-preview">
                        {primaryPhone && <span><AppIcon name="phone" />{primaryPhone}</span>}
                        {primaryEmail && <span><AppIcon name="email" />{primaryEmail}</span>}
                        {!primaryPhone && !primaryEmail && <span>No phone or email saved</span>}
                      </div>
                      {contact.publicNotes && <p className="contact-customer-note"><strong>Customer notes:</strong> {contact.publicNotes}</p>}
                    </div>
                    <div className="contact-meta">{contact.relationshipType && <span>{contact.relationshipType}</span>}{contact.preferredChannel && <span>Prefers {contact.preferredChannel}</span>}{contact.priority && <span>{contact.priority} priority</span>}<span>{contact.jumpDateCount} Important Date{contact.jumpDateCount === 1 ? "" : "s"}</span></div>
                    {contact.groupDetails.length > 0 && <div className="contact-group-list">{contact.groupDetails.slice(0, 3).map((group) => <span className={`group-chip ${group.isActive ? "" : "inactive"}`} key={group.id}><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />{group.name}{group.isActive ? "" : " · inactive"}</span>)}{contact.groupDetails.length > 3 && <span className="group-chip">+{contact.groupDetails.length - 3}</span>}</div>}
                  </div>
                </Link>
                <div className="table-actions">{intent === "important-date" && <Link className="button small primary" href={`/contacts/${contact.id}#add-important-date`}>Add Important Date</Link>}<details className="contact-row-menu"><summary className="button small" aria-label={`More actions for ${contact.displayName}`}>More</summary><div className="contact-row-menu-panel"><Link href={`/contacts/${contact.id}/edit`}>Edit Contact</Link><ConfirmDialog trigger="Archive…" title={`Archive ${contact.displayName}?`} description="Future pending Jumps will be canceled. Completed history remains preserved." danger><form action={archiveContactAction}><input type="hidden" name="contactId" value={contact.id}/><button className="button small danger" type="submit">Confirm archive</button></form></ConfirmDialog></div></details></div>
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
        <div className="bulk-selection-count"><strong>{selectedIds.length}</strong><span>selected</span><button type="button" className="text-button" onClick={() => setSelected(new Set())}>Clear</button>{contacts.length > 1 && <button type="button" className="text-button" onClick={toggleAll}>{allSelected ? "Deselect all" : "Select all"}</button>}</div>

        <details className="bulk-action-menu">
          <summary className="button bulk-action-button"><AppIcon name="community" /><span className="bulk-action-label">Groups</span></summary>
          <div className="bulk-action-panel">
            <h3>Update Contact Groups</h3>
            {groups.length ? <>
              {activeGroups.length ? <form action={assignSelectedContactsToActiveGroupAction} className="form-stack">{contactIdsInputs(selectedIds)}<div className="field"><label htmlFor="bulk-assign-group">Assign to active group</label><select id="bulk-assign-group" name="groupId" required>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div><button className="button primary" type="submit">Assign group</button></form> : <p className="muted-copy">No active Contact Groups are available. Choose an active group from Manage groups.</p>}
              <form action={bulkRemoveGroupAction} className="form-stack bulk-secondary-form">{contactIdsInputs(selectedIds)}<div className="field"><label htmlFor="bulk-remove-group">Remove from group</label><select id="bulk-remove-group" name="groupId" required>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.isActive ? "" : " · inactive"}</option>)}</select></div><button className="button" type="submit">Remove group</button></form>
            </> : <p className="muted-copy">Create a Contact Group first.</p>}
          </div>
        </details>

        <details className="bulk-action-menu bulk-apply-menu" open={intent === "one-time-jump" ? true : undefined}>
          <summary className="button primary bulk-action-button"><AppIcon name="bolt" /><span className="bulk-action-label">Apply Jump</span></summary>
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
                <div className="field"><label htmlFor="bulk-jump-template">Action Template</label><select id="bulk-jump-template" name="stepTemplateId" required>{jumps.map((jump) => <option value={jump.id} key={jump.id}>{jump.channel.replaceAll("_", " ")} · {jump.name}</option>)}</select></div>
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

        <button className="button bulk-action-button" type="button" onClick={exportSelected}><AppIcon name="import" className="export-icon" /><span className="bulk-action-label">Export CSV</span></button>

        <ConfirmDialog trigger={`Archive ${selectedIds.length}…`} title={`Archive ${selectedIds.length} selected Contact${selectedIds.length === 1 ? "" : "s"}?`} description="Future pending Jumps will be canceled. Completed history remains preserved." danger><form action={bulkArchiveContactsAction}>{contactIdsInputs(selectedIds)}<button className="button danger" type="submit"><AppIcon name="archive" /> Confirm archive</button></form></ConfirmDialog>
      </aside>}
    </>
  );
}
