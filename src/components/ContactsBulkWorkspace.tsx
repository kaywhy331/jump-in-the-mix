"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DeviceContactQuickAdd } from "@/components/DeviceContactQuickAdd";
import { EmptyState } from "@/components/EmptyState";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Sheet } from "@/components/Sheet";
import { applyJumpToContactsAction, bulkArchiveContactsAction, bulkRemoveGroupAction } from "@/lib/bulk-contact-actions";
import { bulkAssignMixAction } from "@/lib/contact-mix-actions";
import { bulkMixSheetSentence, CONTACT_MIX_FILTERS, type ContactMixCounts, type ContactMixFilter, type ContactMixStatus } from "@/lib/contact-mix-status-labels";
import { setNoMixNeededAction } from "@/lib/contact-no-mix-actions";
import { createContactsCsv, type ExportContact } from "@/lib/contact-export";
import { restoreContactListScroll, saveContactListState as rememberContactList } from "@/lib/contact-list-state";
import { useBrowserScope } from "@/components/BrowserAccountBoundary";
import { assignSelectedContactsToActiveGroupAction, createContactGroupAction, deleteContactGroupAction, saveActiveGroupsAction } from "@/lib/group-actions";

export type ContactBulkDto = ExportContact & {
  id: string;
  displayName: string;
  stageName?: string | null;
  jumpDateCount: number;
  groupDetails: { id: string; name: string; color: string | null; isActive: boolean }[];
  lastInteraction: string | null;
  nextJump: string | null;
  nextJumpOverdue: boolean;
  relationshipType: string | null;
  preferredChannel: string | null;
  priority: string | null;
  doNotContact: boolean;
  /** Whether this person is in a Mix (JITM-09 §2.76). */
  mixStatus: ContactMixStatus;
};

export type ContactBulkGroup = { id: string; name: string; description: string | null; color: string | null; contactCount: number; mixCount: number; isActive: boolean };

/** Deleting a tag ends the Mixes that run for its people; say so before the owner confirms. */
function tagDeleteDescription(mixCount: number): string {
  const warning = mixCount > 0 ? `${mixCount === 1 ? "1 Mix runs" : `${mixCount} Mixes run`} for this tag's people and will stop for them. ` : "";
  return `${warning}People and completed history will stay in your account.`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function contactIdsInputs(contactIds: string[]) {
  return contactIds.map((contactId) => <input key={contactId} type="hidden" name="contactIds" value={contactId} />);
}

export function ContactsBulkWorkspace({
  contacts,
  totalCount,
  initialSelected = [],
  selectedContactId,
  sort = "last-name",
  groups,
  query,
  groupFilter,
  priorityFilter,
  permissionFilter,
  mixFilter = "",
  mixCounts,
  mixes = [],
  todayKey,
  listHref = "/contacts",
  noMixHref = "/contacts?mix=no-mix",
  savedViews,
  intent
}: {
  contacts: ContactBulkDto[];
  totalCount?: number;
  initialSelected?: string[];
  selectedContactId?: string;
  sort?: string;
  groups: ContactBulkGroup[];
  query: string;
  groupFilter: string;
  priorityFilter: string;
  permissionFilter: string;
  mixFilter?: ContactMixFilter | "";
  mixCounts?: ContactMixCounts;
  mixes?: { id: string; name: string; triggerMode: string }[];
  todayKey?: string;
  /** Where a bulk action returns: this list's filters and docked person, without earlier notices (D47). */
  listHref?: string;
  /** The No Mix filter within the current search and filters. */
  noMixHref?: string;
  savedViews?: ReactNode;
  intent?: "important-date" | "one-time-jump" | "log-note";
}) {
  const router = useRouter();
  const [docked, setDocked] = useState(false);
  useEffect(() => { const media = window.matchMedia("(min-width: 1200px)"); const update = () => setDocked(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected.filter(id => contacts.some(contact => contact.id === id))));
  const scope = useBrowserScope();
  const saveContactListState = () => { if (scope) rememberContactList(scope); };
  const [selectionMode, setSelectionMode] = useState(intent === "one-time-jump");
  const [messageChannel, setMessageChannel] = useState("SMS");
  const [sendWhen, setSendWhen] = useState("now");
  // The No Mix strip selects this page and opens the Mix sheet (JITM-09 §2.81, D76); "none" lands on Mark No Mix needed.
  const [openMixSheet, setOpenMixSheet] = useState<"" | "mix" | "none">("");
  // The Mix chosen in the bulk Mix sheet, so its wording follows how that Mix starts (COPY-02).
  // Nothing is preselected: the owner names the Mix, so a quick Add can't start the alphabetically first one.
  const [chosenMixId, setChosenMixId] = useState("");
  const chosenMix = mixes.find(mix => mix.id === chosenMixId);
  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedContacts = useMemo(() => contacts.filter((contact) => selected.has(contact.id)), [contacts, selected]);
  const selectedDoNotContact = selectedContacts.filter((contact) => contact.doNotContact);
  const activeTags = useMemo(() => groups.filter((group) => group.isActive), [groups]);
  const inactiveTagCount = groups.length - activeTags.length;
  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  const activeFilterCount = [groupFilter, priorityFilter, permissionFilter, mixFilter].filter(Boolean).length;
  const initialSelectionKey = initialSelected.join(",");

  useEffect(() => {
    setSelectionMode(intent === "one-time-jump");
    setSelected(new Set(intent === "one-time-jump" ? initialSelected.filter(id => contacts.some(contact => contact.id === id)) : []));
  }, [intent, initialSelectionKey]);

  useEffect(() => { if (scope) restoreContactListScroll(scope); }, [scope, groupFilter, intent, permissionFilter, priorityFilter, query]);

  // Only a row chosen in the docked layout moves focus into the profile, once it has rendered;
  // first loads and Back/Forward leave focus where the browser puts it.
  const pendingProfileFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingProfileFocus.current || pendingProfileFocus.current !== selectedContactId) return;
    pendingProfileFocus.current = null;
    document.getElementById("contact-profile-heading")?.focus();
  }, [selectedContactId]);

  const toggleContact = (contactId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(contactId)) next.delete(contactId);
    else next.add(contactId);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(contacts.map((contact) => contact.id)));
  const toggleSelectionMode = () => { setSelectionMode((current) => !current); setSelected(new Set()); };
  const startBulkMix = (kind: "mix" | "none") => { setSelectionMode(true); setSelected(new Set(contacts.map(contact => contact.id))); setOpenMixSheet(kind); };
  useEffect(() => {
    if (!openMixSheet) return;
    const kind = openMixSheet;
    setOpenMixSheet("");
    if (kind === "none") requestAnimationFrame(() => document.querySelector<HTMLElement>(".bulk-no-mix-form button")?.focus());
  }, [openMixSheet]);
  const noMixTotal = mixCounts?.["no-mix"] ?? totalCount ?? contacts.length;
  // Choosing one person for a note or a date isn't bulk work, so those lists offer no Select (D76).
  const pickOne = intent === "log-note" || intent === "important-date";
  // While the bar shows, the directory keeps room below its page buttons, sized to the bar as it is (CON-23, JITM-07 §2.9).
  const barRef = useRef<HTMLElement>(null);
  const barShown = selectedIds.length > 0;
  useEffect(() => {
    const bar = barRef.current, directory = bar?.closest<HTMLElement>(".contacts-directory");
    if (!bar || !directory) return;
    const measure = () => directory.style.setProperty("--bulk-bar-room", `${Math.ceil(window.innerHeight - bar.getBoundingClientRect().top) + 16}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); directory.style.removeProperty("--bulk-bar-room"); };
  }, [barShown]);

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

  const directoryContext = ["person", "view", "intent", "importBatch", "people"].map(name => {
    const value = name === "person" ? selectedContactId : searchParams.get(name);
    return value ? <input key={name} name={name} type="hidden" value={value} /> : null;
  });
  const filterControl = <Sheet trigger={<button className="contact-filter-button" type="button" aria-label={activeFilterCount ? `Filter contacts, ${activeFilterCount} active` : "Filter contacts"}><AppIcon name="filter" />{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button>} title="Filter contacts" description="Changes apply right away.">
          <form className="filter-bar form-stack" action="/contacts" method="get">
            <input type="hidden" name="q" value={query} />{directoryContext}
            <label className="field"><span>Sort contacts</span><select name="sort" defaultValue={sort}><option value="name">Name</option><option value="last-name">Last name</option><option value="updated">Recently updated</option><option value="newest">Recently added</option></select></label>
            <label className="field"><span>Tag</span><select name="group" defaultValue={groupFilter}><option value="">All tags</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.isActive ? group.name : `Hidden · ${group.name}`}</option>)}</select></label>
            <label className="field"><span>Priority</span><select name="priority" defaultValue={priorityFilter}><option value="">All priorities</option><option value="URGENT">Urgent</option><option value="HIGH">High</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select></label>
            <label className="field"><span>Contact permission</span><select name="permission" defaultValue={permissionFilter}><option value="">Everyone</option><option value="contactable">Can contact</option><option value="do-not-contact">Do not contact</option></select></label>
            <label className="field"><span>Mix</span><select name="mix" defaultValue={mixFilter}><option value="">Any</option>{(Object.keys(CONTACT_MIX_FILTERS) as ContactMixFilter[]).map(value => <option key={value} value={value}>{CONTACT_MIX_FILTERS[value]}{mixCounts ? ` · ${mixCounts[value].toLocaleString()}` : ""}</option>)}</select></label>
          </form>
          {(query || activeFilterCount) && <Link className="button" href="/contacts">Clear filters</Link>}
          {savedViews}
        </Sheet>;
  useEffect(() => { setSelected(current => new Set([...current].filter(id => contacts.some(contact => contact.id === id)))); }, [contacts]);

  return (
    <>
      <header className="contacts-page-header">
        <h1>Contacts</h1>
        <div className="contacts-page-actions">
          <Link className="button contact-import-action" href="/contacts/import" onClick={saveContactListState}><AppIcon name="import" />Import</Link>
          <Link className="button mobile-header-action contact-add-action" href="/contacts/new" aria-label="Add contact" title="Add contact" onClick={saveContactListState}><AppIcon name="userPlus" /></Link>
          <Sheet trigger={<button className="button mobile-header-action" type="button" aria-label="More contact tools"><AppIcon name="more" /></button>} title="Contact tools">
            <nav className="contact-tools-links">
              <Link href="/contacts/new"><AppIcon name="userPlus" />Add a contact</Link>
              {contacts.length > 0 && !pickOne && <button type="button" className="text-button" onClick={event => { toggleSelectionMode(); event.currentTarget.closest("dialog")?.close(); }}><AppIcon name="check" />{selectionMode ? "Finish selecting contacts" : "Select contacts"}</button>}
              <Link href="/journey"><AppIcon name="journey" />Customer journey</Link>
              <Link href="/settings/connections"><AppIcon name="link" />Lead connections</Link>
              <Link href="/contacts/import" onClick={saveContactListState}><AppIcon name="import" />Import contacts</Link>
              <Link href="/contacts/custom-fields" onClick={saveContactListState}><AppIcon name="edit" />Custom fields</Link>
              <Link href="/contacts/duplicates"><AppIcon name="copy" />Find duplicates</Link>
              <Link href="/contacts/archived"><AppIcon name="archive" />Archived contacts</Link>
            </nav>
            <DeviceContactQuickAdd />
            <section className="tag-manager">
              <div className="section-label"><h2>Tags</h2><span>{activeTags.length}</span></div>
              <form action={createContactGroupAction} className="group-create-form">
                <label className="field"><span>Tag name</span><input name="name" placeholder="For example, Kitchen remodels" required /></label>
                <label className="field"><span>Note (optional)</span><input name="description" /></label>
                <label className="color-input"><span>Color</span><input name="color" type="color" defaultValue="#5d4cf2" /></label>
                <button className="button primary" type="submit">Add tag</button>
              </form>
              {groups.length > 0 && <>
                <form id="tag-activation-form" action={saveActiveGroupsAction} />
                <div className="group-manage-list">{groups.map((group) => <div className={`group-manage-row ${group.isActive ? "" : "inactive"}`} key={group.id}>
                  <label className="date-type-active-choice"><input form="tag-activation-form" type="checkbox" name="activeGroupIds" value={group.id} defaultChecked={group.isActive} /><span>Show<span className="sr-only"> the {group.name} tag</span></span></label>
                  <span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />
                  <span><strong>{group.name}</strong><small>{group.contactCount} contact{group.contactCount === 1 ? "" : "s"}</small></span>
                  <ConfirmDialog trigger="Delete…" triggerAriaLabel={`Delete the ${group.name} tag`} title={`Delete ${group.name}?`} description={tagDeleteDescription(group.mixCount)} danger><form action={deleteContactGroupAction}><input type="hidden" name="groupId" value={group.id} /><button className="button small danger" type="submit">Delete tag</button></form></ConfirmDialog>
                </div>)}</div>
                <button className="button" form="tag-activation-form" type="submit">Save tags</button>
              </>}
              {inactiveTagCount > 0 && <small className="muted-copy">{inactiveTagCount} hidden tag{inactiveTagCount === 1 ? "" : "s"}.</small>}
            </section>
          </Sheet>
        </div>
      </header>
      <div className="contact-search-row">
        <form className="contact-header-search live-search-form" action="/contacts" method="get">
          <AppIcon name="search" /><input name="q" type="search" defaultValue={query} placeholder="Search" aria-label="Search contacts" autoComplete="off" />
          <input name="sort" type="hidden" value={sort} />{directoryContext}
          {groupFilter && <input name="group" type="hidden" value={groupFilter} />}{priorityFilter && <input name="priority" type="hidden" value={priorityFilter} />}{permissionFilter && <input name="permission" type="hidden" value={permissionFilter} />}{mixFilter && <input name="mix" type="hidden" value={mixFilter} />}
        </form>{filterControl}
      </div>


      {intent === "important-date" && <div className="notice info" role="status"><strong>Choose a person.</strong> Then add the date you want to remember.</div>}
      {intent === "one-time-jump" && <div className="notice info" role="status"><strong>Choose one or more people.</strong></div>}
      {intent === "log-note" && <div className="notice info" role="status"><strong>Choose a person.</strong> Then add what happened to their notes.</div>}

      <div className="contact-list-summary"><span>{selectionMode ? `${selectedIds.length} selected` : `${(totalCount ?? contacts.length).toLocaleString()} ${(totalCount ?? contacts.length) === 1 ? "person" : "people"}`}</span>{!selectionMode && !mixFilter && Boolean(mixCounts?.["no-mix"]) && <Link className="contact-no-mix-link" href={noMixHref}>{mixCounts!["no-mix"].toLocaleString()} with No Mix</Link>}<span className="contact-list-tools"><form action="/contacts">{directoryContext}<input name="q" type="hidden" value={query} />{groupFilter && <input name="group" type="hidden" value={groupFilter} />}{priorityFilter && <input name="priority" type="hidden" value={priorityFilter} />}{permissionFilter && <input name="permission" type="hidden" value={permissionFilter} />}{mixFilter && <input name="mix" type="hidden" value={mixFilter} />}<select name="sort" aria-label="Sort contacts" defaultValue={sort} onChange={event => event.currentTarget.form?.requestSubmit()}><option value="name">Name</option><option value="last-name">Last name</option><option value="updated">Recently updated</option><option value="newest">Recently added</option></select></form>{contacts.length > 0 && !pickOne && <button type="button" className="text-button contact-select-toggle" onClick={toggleSelectionMode}>{selectionMode ? "Done" : "Select"}</button>}</span></div>
      {/* Outside selection mode only: a tick never moves the list, and an intent's own sheet never stacks with the Mix sheet. */}
      {!intent && !selectionMode && mixFilter === "no-mix" && contacts.length > 0 && <div className="contact-no-mix-strip" role="group" aria-labelledby="contact-no-mix-strip-text">
        <p id="contact-no-mix-strip-text"><strong>{noMixTotal.toLocaleString()}</strong> {noMixTotal === 1 ? "person has" : "people have"} No Mix.{noMixTotal > contacts.length ? ` This page shows ${contacts.length}.` : ""}</p>
        <div className="contact-no-mix-strip-actions"><button type="button" className="button primary" onClick={() => startBulkMix("mix")}>{contacts.length === 1 ? "Add this person to a Mix" : "Add these people to a Mix"}</button><button type="button" className="button" onClick={() => startBulkMix("none")}>Mark No Mix needed</button></div>
      </div>}
      {contacts.length ? <div className="contact-list selectable-contact-list">{contacts.map((contact) => {
        const isSelected = selected.has(contact.id);
        const primaryEmail = contact.emails.find((item) => item.isPrimary)?.email ?? contact.emails[0]?.email;
        const primaryPhone = contact.phones.find((item) => item.isPrimary)?.phone ?? contact.phones[0]?.phone;
        return <article className={`contact-row contact-select-row ${selectionMode ? "selection-mode" : ""} ${isSelected ? "selected" : ""} ${selectedContactId === contact.id ? "contact-current" : ""} ${contact.doNotContact ? "do-not-contact" : ""}`} key={contact.id}>
          <label className="contact-select-control" title={isSelected ? "Deselect contact" : "Select contact"}><input type="checkbox" checked={isSelected} onChange={() => toggleContact(contact.id)} aria-label={`${isSelected ? "Deselect" : "Select"} ${contact.displayName}`} /><span>{isSelected ? <AppIcon name="check" /> : null}</span></label>
          <div className="contact-main">
            <div className="avatar">{initials(contact.displayName) || "?"}</div>
            <div><h3><Link href={`/contacts/${contact.id}`} className="contact-open" aria-current={docked && selectedContactId === contact.id ? "true" : undefined} onClick={event => { if (selectionMode && event.detail > 0) { event.preventDefault(); toggleContact(contact.id); return; } saveContactListState(); if (!intent && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && window.matchMedia("(min-width: 1200px)").matches) { event.preventDefault(); const params = new URLSearchParams(searchParams); params.set("person", contact.id); if (contact.id === selectedContactId) document.getElementById("contact-profile-heading")?.focus(); else pendingProfileFocus.current = contact.id; router.push(`/contacts?${params}`, { scroll: false }); } }}>{contact.displayName}</Link></h3>
              <p className="contact-row-summary"><span>{contact.stageName ?? "No stage"}</span><span className="contact-summary-separator" aria-hidden="true"> · </span>{(contact.mixStatus === "no-mix" || contact.mixStatus === "no-mix-needed") && <><span className={contact.mixStatus === "no-mix" ? "contact-no-mix" : "contact-no-mix-needed"}>{CONTACT_MIX_FILTERS[contact.mixStatus]}</span>{(contact.nextJump || (!primaryEmail && !primaryPhone)) && <span className="contact-summary-separator" aria-hidden="true"> · </span>}</>}{!primaryEmail && !primaryPhone && !contact.doNotContact ? <Link className="contact-missing-method" href={`/contacts/${contact.id}/edit`}>Add phone or email</Link> : contact.doNotContact ? <span>Do not contact</span> : contact.nextJump ? <span className={contact.nextJumpOverdue ? "overdue-text" : ""}>{contact.nextJump}</span> : contact.mixStatus === "in-mix" ? <span>Nothing scheduled</span> : null}</p>
            </div>
          </div>
          <div className="table-actions">{intent === "important-date" ? <Link className="button small primary" href={`/contacts/${contact.id}#add-date`} onClick={saveContactListState}>Add date</Link> : intent === "log-note" ? <Link className="button small primary" href={`/contacts/${contact.id}#add-note`} onClick={saveContactListState}>Add note</Link> : null}</div>
        </article>;
      })}</div> : query || activeFilterCount ? <EmptyState title="No contacts matched" description="Try a different search or filter." actionHref="/contacts" actionLabel="Clear filters" /> : <EmptyState title="Start with one person" description="Make time for your circle. Add a customer, a friend, or someone you would like to know better." actionHref="/contacts/new" actionLabel="Add a person" />}

      {barShown && <aside ref={barRef} className="bulk-contact-bar" aria-label="Actions for selected contacts">
        <div className="bulk-selection-count"><strong>{selectedIds.length}</strong><span>selected</span><button type="button" className="text-button" onClick={() => setSelected(new Set())}>Clear</button>{contacts.length > 1 && <button type="button" className="text-button" onClick={toggleAll}>{allSelected ? "Deselect this page" : "Select this page"}</button>}</div>
        <div className="bulk-actions">
          <Sheet initiallyOpen={Boolean(openMixSheet)} trigger={<button className="button primary bulk-action-button" type="button" aria-label="Add to a Mix"><AppIcon name="mixes" /><span className="bulk-action-label"><span className="bulk-action-long">Add to a </span>Mix</span></button>} title={`Add ${selectedIds.length} ${selectedIds.length === 1 ? "person" : "people"} to a Mix`} description="Start a Mix, or confirm that these people don’t need one.">
            {mixes.length ? <>
              {selectedDoNotContact.length > 0 && <div className="notice error" id="bulk-mix-blocked">Remove {selectedDoNotContact.map((contact) => contact.displayName).join(", ")} because “Do not contact” is on.</div>}
              <form action={bulkAssignMixAction} className="form-stack">{contactIdsInputs(selectedIds)}<input type="hidden" name="returnTo" value={listHref} />
                <label className="field"><span>Choose a Mix</span><select name="mixId" required value={chosenMixId} onChange={(event) => setChosenMixId(event.target.value)}><option value="" disabled>Choose a Mix</option>{mixes.map(mix => <option key={mix.id} value={mix.id}>{mix.name}</option>)}</select></label>
                {/* A fixed-date Mix goes out on its own date, so it asks for no start day (COPY-02). */}
                {chosenMix?.triggerMode !== "BROADCAST" && <label className="field"><span>Start on</span><input type="date" name="startDate" required min={todayKey} defaultValue={todayKey} /></label>}
                {chosenMix && <p className="muted-copy">{bulkMixSheetSentence(chosenMix.triggerMode)}</p>}
                {/* The reason a disabled button gives is linked to it, so assistive technology reads it too (JITM-08 §2.6).
                    It stays disabled while the start is sent, so a double tap starts nobody twice (UNDO-03). */}
                <FormSubmitButton label="Add to the Mix" pendingLabel="Adding…" disabled={selectedDoNotContact.length > 0} describedBy={selectedDoNotContact.length > 0 ? "bulk-mix-blocked" : undefined} />
              </form>
            </> : <p>Create a Mix first. <Link href="/mixes">Go to Mixes</Link></p>}
            <form action={setNoMixNeededAction} className="form-stack bulk-no-mix-form">{contactIdsInputs(selectedIds)}<input type="hidden" name="returnTo" value={listHref} />
              <p className="muted-copy">For people who don’t need follow-ups from a Mix, such as a supplier. Anyone already in a Mix stays as they are.</p>
              <button className="button" type="submit">Mark No Mix needed</button>
            </form>
          </Sheet>
          <Sheet trigger={<button className="button bulk-action-button" type="button" aria-label="Tags"><AppIcon name="tag" /><span className="bulk-action-label">Tags</span></button>} title="Update tags">
            {groups.length ? <>
              {activeTags.length ? <form action={assignSelectedContactsToActiveGroupAction} className="form-stack">{contactIdsInputs(selectedIds)}<label className="field"><span>Add tag</span><select name="groupId" required>{activeTags.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><button className="button primary" type="submit">Add tag</button></form> : <p>No tags are available.</p>}
              <form action={bulkRemoveGroupAction} className="form-stack">{contactIdsInputs(selectedIds)}<label className="field"><span>Remove tag</span><select name="groupId" required>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><button className="button" type="submit">Remove tag</button></form>
            </> : <p>Add a tag first.</p>}
          </Sheet>
          <Sheet initiallyOpen={intent === "one-time-jump"} trigger={<button className="button bulk-action-button" type="button" aria-label="Message"><AppIcon name="message" /><span className="bulk-action-label">Message</span></button>} title={`Message ${selectedIds.length} ${selectedIds.length === 1 ? "person" : "people"}`} description="Choose how, write the message, and say when it should appear on Today.">
            {selectedDoNotContact.length > 0 && <div className="notice error">Remove {selectedDoNotContact.map((contact) => contact.displayName).join(", ")} because “Do not contact” is on.</div>}
            <form action={applyJumpToContactsAction} className="form-stack">
              {contactIdsInputs(selectedIds)}
              <input type="hidden" name="applyMode" value="manual" />
              <input type="hidden" name="manualName" value="One-time message" />
              <label className="field"><span>How</span><select name="manualChannel" value={messageChannel} onChange={(event) => setMessageChannel(event.target.value)}><option value="SMS">Text</option><option value="EMAIL">Email</option><option value="PHONE_CALL">Call</option><option value="WHATSAPP">WhatsApp</option></select></label>
              {messageChannel === "EMAIL" && <label className="field"><span>Subject</span><input name="manualSubject" placeholder="A quick note" required /></label>}
              {["SMS", "EMAIL", "WHATSAPP"].includes(messageChannel) ? <label className="field"><span>Message</span><textarea name="manualBody" placeholder="Hi {{First Name}}, …" required /></label> : <label className="field"><span>Call notes</span><textarea name="manualScript" required /></label>}
              <label className="field"><span>When</span><select name="sendWhen" value={sendWhen} onChange={(event) => setSendWhen(event.target.value)}><option value="now">Now</option><option value="tomorrow">Tomorrow</option><option value="date">Choose a date</option></select></label>
              {sendWhen === "date" && <label className="field"><span>Date</span><input name="scheduledDate" type="date" required /></label>}
              <button className="button primary" type="submit" disabled={selectedDoNotContact.length > 0}>Schedule message</button>
            </form>
          </Sheet>
          <button className="button bulk-action-button" type="button" aria-label="Export CSV" onClick={exportSelected}><AppIcon name="export" className="export-icon" /><span className="bulk-action-label">Export<span className="bulk-action-long"> CSV</span></span></button>
          <ConfirmDialog trigger={<><AppIcon name="archive" /><span className="bulk-action-label">Archive<span className="bulk-action-long"> {selectedIds.length}…</span></span></>} triggerAriaLabel={`Archive ${selectedIds.length}…`} triggerClassName="button danger bulk-action-button" title={`Archive ${selectedIds.length} selected contact${selectedIds.length === 1 ? "" : "s"}?`} description="Future follow-ups will be removed. Completed history stays available." danger><form action={bulkArchiveContactsAction}>{contactIdsInputs(selectedIds)}<button className="button danger" type="submit"><AppIcon name="archive" />Archive</button></form></ConfirmDialog>
        </div>
      </aside>}
    </>
  );
}
