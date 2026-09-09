"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DeviceContactQuickAdd } from "@/components/DeviceContactQuickAdd";
import { EmptyState } from "@/components/EmptyState";
import { Sheet } from "@/components/Sheet";
import { archiveContactAction } from "@/lib/actions";
import { applyJumpToContactsAction, bulkArchiveContactsAction, bulkRemoveGroupAction } from "@/lib/bulk-contact-actions";
import { createContactsCsv, type ExportContact } from "@/lib/contact-export";
import { restoreContactListScroll, saveContactListState as rememberContactList } from "@/lib/contact-list-state";
import { useBrowserScope } from "@/components/BrowserAccountBoundary";
import { assignSelectedContactsToActiveGroupAction, createContactGroupAction, deleteContactGroupAction, saveActiveGroupsAction } from "@/lib/group-actions";

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
  doNotContact: boolean;
};

export type ContactBulkGroup = { id: string; name: string; description: string | null; color: string | null; contactCount: number; isActive: boolean };

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function contactIdsInputs(contactIds: string[]) {
  return contactIds.map((contactId) => <input key={contactId} type="hidden" name="contactIds" value={contactId} />);
}

export function ContactsBulkWorkspace({
  contacts,
  groups,
  query,
  groupFilter,
  priorityFilter,
  permissionFilter,
  intent
}: {
  contacts: ContactBulkDto[];
  groups: ContactBulkGroup[];
  query: string;
  groupFilter: string;
  priorityFilter: string;
  permissionFilter: string;
  intent?: "important-date" | "one-time-jump" | "log-note";
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const scope = useBrowserScope();
  const saveContactListState = () => { if (scope) rememberContactList(scope); };
  const [selectionMode, setSelectionMode] = useState(intent === "one-time-jump");
  const [messageChannel, setMessageChannel] = useState("SMS");
  const [sendWhen, setSendWhen] = useState("now");
  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedContacts = useMemo(() => contacts.filter((contact) => selected.has(contact.id)), [contacts, selected]);
  const selectedDoNotContact = selectedContacts.filter((contact) => contact.doNotContact);
  const activeTags = useMemo(() => groups.filter((group) => group.isActive), [groups]);
  const inactiveTagCount = groups.length - activeTags.length;
  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  const activeFilterCount = [groupFilter, priorityFilter, permissionFilter].filter(Boolean).length;

  useEffect(() => { if (scope) restoreContactListScroll(scope); }, [scope, groupFilter, intent, permissionFilter, priorityFilter, query]);

  const toggleContact = (contactId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(contactId)) next.delete(contactId);
    else next.add(contactId);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(contacts.map((contact) => contact.id)));
  const toggleSelectionMode = () => { setSelectionMode((current) => !current); setSelected(new Set()); };

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
        <div className="contacts-title-search">
          <h1>Contacts</h1>
          <form className="contact-header-search live-search-form" action="/contacts" method="get">
            <input name="q" type="search" defaultValue={query} placeholder="Search contacts" aria-label="Search contacts" autoComplete="off" />
            {groupFilter && <input type="hidden" name="group" value={groupFilter} />}
            {priorityFilter && <input type="hidden" name="priority" value={priorityFilter} />}
            {permissionFilter && <input type="hidden" name="permission" value={permissionFilter} />}
          </form>
        </div>
        <div className="page-actions contacts-page-actions">
          <Link className="button primary mobile-header-action" href="/contacts/new"><AppIcon name="add" /><span className="mobile-action-label">Add</span></Link>
          <Sheet trigger={<button className="button mobile-header-action" type="button" aria-label="More contact tools"><AppIcon name="more" /><span className="mobile-action-label">More</span></button>} title="Contact tools">
            <nav className="contact-tools-links">
              <Link href="/journey">Customer journey</Link>
              <Link href="/settings/connections">Lead connections</Link>
              <Link href="/contacts/import" onClick={saveContactListState}>Import contacts</Link>
              <Link href="/contacts/custom-fields" onClick={saveContactListState}>Custom fields</Link>
              <Link href="/contacts/duplicates">Find duplicates</Link>
              <Link href="/contacts/archived">Archived contacts</Link>
            </nav>
            <DeviceContactQuickAdd />
            <section className="tag-manager">
              <div className="section-label"><h2>Tags</h2><span>{activeTags.length}</span></div>
              <form action={createContactGroupAction} className="group-create-form">
                <input name="name" placeholder="Tag name" aria-label="Tag name" required />
                <input name="description" placeholder="Optional note" aria-label="Tag note" />
                <label className="color-input"><span>Color</span><input name="color" type="color" defaultValue="#5d4cf2" /></label>
                <button className="button primary" type="submit">Add tag</button>
              </form>
              {groups.length > 0 && <>
                <form id="tag-activation-form" action={saveActiveGroupsAction} />
                <div className="group-manage-list">{groups.map((group) => <div className={`group-manage-row ${group.isActive ? "" : "inactive"}`} key={group.id}>
                  <label className="date-type-active-choice"><input form="tag-activation-form" type="checkbox" name="activeGroupIds" value={group.id} defaultChecked={group.isActive} /><span>{group.isActive ? "On" : "Off"}</span></label>
                  <span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />
                  <span><strong>{group.name}</strong><small>{group.contactCount} contact{group.contactCount === 1 ? "" : "s"}</small></span>
                  <ConfirmDialog trigger="Delete…" title={`Delete ${group.name}?`} description="People and completed history will stay in your account." danger><form action={deleteContactGroupAction}><input type="hidden" name="groupId" value={group.id} /><button className="button small danger" type="submit">Delete tag</button></form></ConfirmDialog>
                </div>)}</div>
                <button className="button" form="tag-activation-form" type="submit">Save tags</button>
              </>}
              {inactiveTagCount > 0 && <small className="muted-copy">{inactiveTagCount} hidden tag{inactiveTagCount === 1 ? "" : "s"}.</small>}
            </section>
          </Sheet>
        </div>
      </header>

      {intent === "important-date" && <div className="notice info" role="status"><strong>Choose a person.</strong> Then add the date you want to remember.</div>}
      {intent === "one-time-jump" && <div className="notice info" role="status"><strong>Choose one or more people.</strong></div>}
      {intent === "log-note" && <div className="notice info" role="status"><strong>Choose a person.</strong> Then add what happened to their notes.</div>}

      <div className="contact-list-controls">
        <Sheet trigger={<button className={activeFilterCount ? "button filter-trigger active" : "button filter-trigger"} type="button"><AppIcon name="settings" />Filter{activeFilterCount ? ` ${activeFilterCount}` : ""}</button>} title="Filter contacts" description="Changes apply right away.">
          <form className="filter-bar form-stack" action="/contacts" method="get">
            <input type="hidden" name="q" value={query} />
            <label className="field"><span>Tag</span><select name="group" defaultValue={groupFilter}><option value="">All tags</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.isActive ? group.name : `Hidden · ${group.name}`}</option>)}</select></label>
            <label className="field"><span>Priority</span><select name="priority" defaultValue={priorityFilter}><option value="">All priorities</option><option value="URGENT">Urgent</option><option value="HIGH">High</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select></label>
            <label className="field"><span>Contact permission</span><select name="permission" defaultValue={permissionFilter}><option value="">Everyone</option><option value="contactable">Can contact</option><option value="do-not-contact">Do not contact</option></select></label>
          </form>
          {(query || activeFilterCount) && <Link className="button" href="/contacts">Clear filters</Link>}
        </Sheet>
        {contacts.length > 0 && <button className="button contact-select-toggle" type="button" onClick={toggleSelectionMode}>{selectionMode ? "Done" : "Select"}</button>}
      </div>

      {contacts.length ? <div className="contact-list selectable-contact-list">{contacts.map((contact) => {
        const isSelected = selected.has(contact.id);
        const primaryEmail = contact.emails.find((item) => item.isPrimary)?.email ?? contact.emails[0]?.email;
        const primaryPhone = contact.phones.find((item) => item.isPrimary)?.phone ?? contact.phones[0]?.phone;
        return <article className={`contact-row contact-select-row ${selectionMode ? "selection-mode" : ""} ${isSelected ? "selected" : ""} ${contact.doNotContact ? "do-not-contact" : ""}`} key={contact.id}>
          <label className="contact-select-control" title={isSelected ? "Deselect contact" : "Select contact"}><input type="checkbox" checked={isSelected} onChange={() => toggleContact(contact.id)} aria-label={`${isSelected ? "Deselect" : "Select"} ${contact.displayName}`} /><span>{isSelected ? <AppIcon name="check" /> : null}</span></label>
          <Link href={`/contacts/${contact.id}`} className="contact-main" onClick={saveContactListState}>
            <div className="avatar">{initials(contact.displayName) || "?"}</div>
            <div>
              <h3>{contact.displayName}</h3>
              <div className="contact-relationship-state"><span><small>Last follow-up</small><strong>{contact.lastInteraction ?? "No activity yet"}</strong></span><span><small>Next follow-up</small><strong className={contact.nextJumpOverdue ? "overdue-text" : ""}>{contact.doNotContact ? "Do not contact" : contact.nextJump ?? "Nothing scheduled"}</strong></span></div>
              <div className="contact-visible-details"><div className="contact-method-preview">{primaryPhone && <span><AppIcon name="phone" />{primaryPhone}</span>}{primaryEmail && <span><AppIcon name="email" />{primaryEmail}</span>}{!primaryPhone && !primaryEmail && <span>Add phone or email</span>}</div>{contact.publicNotes && <p className="contact-customer-note"><strong>Note:</strong> {contact.publicNotes}</p>}</div>
              <div className="contact-meta">{contact.doNotContact && <span className="status-pill overdue">Do not contact</span>}{contact.relationshipType && <span>{contact.relationshipType}</span>}{contact.preferredChannel && <span>Prefers {contact.preferredChannel.replaceAll("_", " ").toLowerCase()}</span>}{contact.priority && <span>{contact.priority.toLowerCase()} priority</span>}<span>{contact.jumpDateCount} saved date{contact.jumpDateCount === 1 ? "" : "s"}</span></div>
              {contact.groupDetails.length > 0 && <div className="contact-group-list">{contact.groupDetails.slice(0, 3).map((group) => <span className={`group-chip ${group.isActive ? "" : "inactive"}`} key={group.id}><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />{group.name}</span>)}{contact.groupDetails.length > 3 && <span className="group-chip">+{contact.groupDetails.length - 3}</span>}</div>}
            </div>
          </Link>
          <div className="table-actions">{intent === "important-date" ? <Link className="button small primary" href={`/contacts/${contact.id}#add-date`} onClick={saveContactListState}>Add date</Link> : intent === "log-note" ? <Link className="button small primary" href={`/contacts/${contact.id}#add-note`} onClick={saveContactListState}>Add note</Link> : <Sheet trigger={<button className="button small" type="button" aria-label={`More options for ${contact.displayName}`}>More</button>} title={contact.displayName}><Link className="button" href={`/contacts/${contact.id}/edit`} onClick={saveContactListState}>Edit contact</Link><ConfirmDialog trigger="Archive…" title={`Archive ${contact.displayName}?`} description="Future follow-ups will be removed. Completed history stays available." danger><form action={archiveContactAction}><input type="hidden" name="contactId" value={contact.id} /><button className="button danger" type="submit">Archive contact</button></form></ConfirmDialog></Sheet>}</div>
        </article>;
      })}</div> : query || activeFilterCount ? <EmptyState title="No contacts matched" description="Try a different search or filter." actionHref="/contacts" actionLabel="Clear filters" /> : <EmptyState title="Start with one person" description="Make time for your circle. Add a customer, a friend, or someone you would like to know better." actionHref="/contacts/new" actionLabel="Add a person" />}

      {selectedIds.length > 0 && <aside className="bulk-contact-bar" aria-label="Actions for selected contacts">
        <div className="bulk-selection-count"><strong>{selectedIds.length}</strong><span>selected</span><button type="button" className="text-button" onClick={() => setSelected(new Set())}>Clear</button>{contacts.length > 1 && <button type="button" className="text-button" onClick={toggleAll}>{allSelected ? "Deselect all" : "Select all"}</button>}</div>
        <Sheet trigger={<button className="button bulk-action-button" type="button" aria-label="Tags"><AppIcon name="people" /><span className="bulk-action-label">Tags</span></button>} title="Update tags">
          {groups.length ? <>
            {activeTags.length ? <form action={assignSelectedContactsToActiveGroupAction} className="form-stack">{contactIdsInputs(selectedIds)}<label className="field"><span>Add tag</span><select name="groupId" required>{activeTags.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><button className="button primary" type="submit">Add tag</button></form> : <p>No tags are available.</p>}
            <form action={bulkRemoveGroupAction} className="form-stack">{contactIdsInputs(selectedIds)}<label className="field"><span>Remove tag</span><select name="groupId" required>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><button className="button" type="submit">Remove tag</button></form>
          </> : <p>Add a tag first.</p>}
        </Sheet>
        <Sheet initiallyOpen={intent === "one-time-jump"} trigger={<button className="button primary bulk-action-button" type="button" aria-label="Message"><AppIcon name="message" /><span className="bulk-action-label">Message</span></button>} title={`Message ${selectedIds.length} ${selectedIds.length === 1 ? "person" : "people"}`} description="Choose how, write the message, and say when it should appear on Today.">
          {selectedDoNotContact.length > 0 && <div className="notice error">Remove {selectedDoNotContact.map((contact) => contact.displayName).join(", ")} because “Do not contact” is on.</div>}
          <form action={applyJumpToContactsAction} className="form-stack">
            {contactIdsInputs(selectedIds)}
            <input type="hidden" name="applyMode" value="manual" />
            <input type="hidden" name="manualName" value="One-time message" />
            <label className="field"><span>How</span><select name="manualChannel" value={messageChannel} onChange={(event) => setMessageChannel(event.target.value)}><option value="SMS">Text</option><option value="EMAIL">Email</option><option value="PHONE_CALL">Phone call</option><option value="WHATSAPP">WhatsApp</option></select></label>
            {messageChannel === "EMAIL" && <label className="field"><span>Subject</span><input name="manualSubject" placeholder="A quick note" required /></label>}
            {["SMS", "EMAIL", "WHATSAPP"].includes(messageChannel) ? <label className="field"><span>Message</span><textarea name="manualBody" placeholder="Hi {{First Name}}, …" required /></label> : <label className="field"><span>Call notes</span><textarea name="manualScript" required /></label>}
            <label className="field"><span>When</span><select name="sendWhen" value={sendWhen} onChange={(event) => setSendWhen(event.target.value)}><option value="now">Now</option><option value="tomorrow">Tomorrow</option><option value="date">Choose a date</option></select></label>
            {sendWhen === "date" && <label className="field"><span>Date</span><input name="scheduledDate" type="date" required /></label>}
            <button className="button primary" type="submit" disabled={selectedDoNotContact.length > 0}>Schedule message</button>
          </form>
        </Sheet>
        <button className="button bulk-action-button" type="button" aria-label="Export CSV" onClick={exportSelected}><AppIcon name="import" className="export-icon" /><span className="bulk-action-label">Export CSV</span></button>
        <ConfirmDialog trigger={`Archive ${selectedIds.length}…`} title={`Archive ${selectedIds.length} selected contact${selectedIds.length === 1 ? "" : "s"}?`} description="Future follow-ups will be removed. Completed history stays available." danger><form action={bulkArchiveContactsAction}>{contactIdsInputs(selectedIds)}<button className="button danger" type="submit"><AppIcon name="archive" />Archive</button></form></ConfirmDialog>
      </aside>}
    </>
  );
}
