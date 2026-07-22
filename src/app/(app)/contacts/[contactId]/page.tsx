import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ContactTimeline } from "@/components/ContactTimeline";
import { ContactsBackLink } from "@/components/ContactsBackLink";
import { Notice } from "@/components/Notice";
import { PersonalizableCardBoard, type PersonalizableCardItem } from "@/components/PersonalizableCards";
import { requireWorkspace } from "@/lib/auth";
import { customFieldPlaceholder } from "@/lib/contact-custom-fields";
import { assignMixToContactAction, removeMixAssignmentAction } from "@/lib/contact-mix-actions";
import { formatDate } from "@/lib/format";
import { listGroupStates } from "@/lib/group-activity";
import {
  createImportantDateAction,
  deactivateImportantDateAction,
  updateImportantDateAction
} from "@/lib/important-date-actions";
import { formatDateInput } from "@/lib/mix-broadcast";
import { resumeMixForContactAction, stopMixForContactAction } from "@/lib/mix-stop-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Contact details" };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
] as const;

type SearchParams = {
  created?: string;
  dateCreated?: string;
  dateUpdated?: string;
  dateDeleted?: string;
  mixAssigned?: string;
  mixRemoved?: string;
  mixStopped?: string;
  mixResumed?: string;
  mixStopError?: string;
  mixResumeError?: string;
  updated?: string;
  error?: string;
};

function addressText(address: {
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}): string {
  return [address.street1, address.street2, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(", ");
}

export default async function ContactDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ contactId }, query, { workspace }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const [contact, dateTypes, mixes, stops, groupStates] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: contactId, workspaceId: workspace.id, archivedAt: null },
      include: {
        emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        groupMemberships: { include: { group: true } },
        customFieldValues: { include: { definition: true }, orderBy: { definition: { name: "asc" } } },
        jumpDates: {
          where: { isActive: true },
          include: { dateType: true },
          orderBy: [{ dateValue: "asc" }, { month: "asc" }, { day: "asc" }]
        },
        mixAssignments: { include: { mix: true }, where: { isActive: true, contactId }, orderBy: { createdAt: "asc" } }
      }
    }),
    prisma.dateType.findMany({
      where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null }] },
      orderBy: [{ isSystem: "asc" }, { name: "asc" }]
    }),
    prisma.mix.findMany({ where: { workspaceId: workspace.id, status: "ACTIVE", source: { not: "ONE_TIME" } }, orderBy: { name: "asc" } }),
    prisma.mixStop.findMany({ where: { workspaceId: workspace.id, contactId }, orderBy: { stoppedAt: "desc" } }),
    listGroupStates(workspace.id)
  ]);
  if (!contact) notFound();

  const followUpType = dateTypes.find((type) => type.slug === "follow-up");
  const stopByMixId = new Map(stops.map((stop) => [stop.mixId, stop]));
  const directMixIds = new Set(contact.mixAssignments.map((assignment) => assignment.mixId));
  const additionalStoppedMixes = mixes.filter((mix) => stopByMixId.has(mix.id) && !directMixIds.has(mix.id));
  const activeByGroupId = new Map(groupStates.map((state) => [state.groupId, state.isActive]));
  const primaryEmail = contact.emails.find((item) => item.isPrimary)?.email ?? contact.emails[0]?.email;
  const primaryPhone = contact.phones.find((item) => item.isPrimary)?.phone ?? contact.phones[0]?.phone;

  const cardItems: PersonalizableCardItem[] = [
    {
      id: "relationship-timeline",
      title: "Relationship timeline",
      description: "Calls, messages, outcomes, notes, and next commitments in chronological order.",
      content: <ContactTimeline contactId={contact.id} />
    },
    {
      id: "important-dates",
      title: "Important Dates",
      description: "Moments that can start a follow-up plan.",
      content: contact.jumpDates.length ? <div className="important-date-list">{contact.jumpDates.map((item) => (
        <article className="important-date-row" key={item.id} id={`important-date-${item.id}`}>
          <div className="important-date-summary">
            <h3>{item.dateType.name}</h3>
            <div className="jump-meta"><span>{item.dateValue ? formatDate(item.dateValue) : `${item.month}/${item.day}`}</span><span>{item.recurrence.toLowerCase()}</span>{item.label && <span>{item.label}</span>}</div>
          </div>
          <div className="important-date-actions">
            <details className="important-date-edit">
              <summary className="icon-button compact" aria-label={`Edit ${item.dateType.name}`} title="Edit Important Date"><AppIcon name="edit" /></summary>
              <form action={updateImportantDateAction} className="important-date-edit-panel">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="jumpDateId" value={item.id} />
                {!item.dateValue && <input type="hidden" name="monthDayOnly" value="1" />}
                <label className="field"><span>Type</span><select name="dateTypeId" defaultValue={item.dateTypeId} required>{dateTypes.map((type) => <option key={type.id} value={type.id}>{type.isSystem ? `System · ${type.name}` : type.name}</option>)}</select></label>
                {item.dateValue ? (
                  <label className="field"><span>Date</span><input name="dateValue" type="date" defaultValue={formatDateInput(item.dateValue)} required /></label>
                ) : (
                  <>
                    <label className="field"><span>Month</span><select name="month" defaultValue={item.month ?? ""} required><option value="">Choose month</option>{MONTHS.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}</select></label>
                    <label className="field"><span>Day</span><input name="day" type="number" min={1} max={31} defaultValue={item.day ?? ""} inputMode="numeric" required /></label>
                  </>
                )}
                <label className="field"><span>Repeat</span><select name="recurrence" defaultValue={item.recurrence}><option value="NONE">Does not repeat</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></label>
                <label className="field"><span>Label</span><input name="label" defaultValue={item.label ?? ""} placeholder="Proposal follow-up" /></label>
                <div className="form-actions"><button className="button primary" type="submit">Save changes</button></div>
              </form>
            </details>
            <ConfirmDialog
              trigger={<AppIcon name="trash" />}
              triggerAriaLabel={`Remove ${item.dateType.name}`}
              triggerClassName="icon-button compact danger"
              title={`Remove ${item.dateType.name}?`}
              description="Future pending work tied to this Important Date will be canceled. The date remains recoverable in history."
              danger
            >
              <form action={deactivateImportantDateAction}><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="jumpDateId" value={item.id} /><button className="button small danger" type="submit">Confirm removal</button></form>
            </ConfirmDialog>
          </div>
        </article>
      ))}</div> : <p className="muted-copy">No Important Dates yet. Add the next moment you genuinely need to remember.</p>
    },
    {
      id: "add-important-date",
      title: "Add an Important Date",
      description: "Choose the moment and when it occurs.",
      defaultCollapsed: true,
      content: <form action={createImportantDateAction} className="form-grid personalizable-form-content">
        <input type="hidden" name="contactId" value={contact.id} />
        <div className="field"><label htmlFor="dateTypeId">Important Date Type</label><select id="dateTypeId" name="dateTypeId" required defaultValue={followUpType?.id}>{dateTypes.map((type) => <option key={type.id} value={type.id}>{type.isSystem ? `System · ${type.name}` : type.name}</option>)}</select></div>
        <div className="field"><label htmlFor="dateValue">Date</label><input id="dateValue" name="dateValue" type="date" required /></div>
        <div className="field"><label htmlFor="recurrence">Repeat</label><select id="recurrence" name="recurrence"><option value="NONE">Does not repeat</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></div>
        <div className="field"><label htmlFor="label">Optional label</label><input id="label" name="label" placeholder="Proposal follow-up" /></div>
        <label className="checkbox-card field full onboarding-default"><input type="checkbox" name="autoAssignRecommended" defaultChecked /><span><strong>Start a matching follow-up plan</strong><small>The first active Mix using this Important Date Type will be assigned automatically.</small></span></label>
        <div className="form-actions field full"><button className="button primary" type="submit">Add Important Date</button></div>
      </form>
    },
    {
      id: "contact-methods",
      title: "Contact methods",
      description: "Phone, email, and address details with primary values first.",
      content: <div className="contact-method-sections personalizable-section-content">
        <section><h3>Email</h3>{contact.emails.length ? contact.emails.map((item) => <div className="contact-method-row" key={item.id}><span>{item.email}</span><small>{item.label || "Email"}{item.isPrimary ? " · Primary" : ""}</small></div>) : <p className="muted-copy">Not added</p>}</section>
        <section><h3>Phone</h3>{contact.phones.length ? contact.phones.map((item) => <div className="contact-method-row" key={item.id}><span>{item.phone}</span><small>{item.label || "Phone"}{item.isPrimary ? " · Primary" : ""}</small></div>) : <p className="muted-copy">Not added</p>}</section>
        <section><h3>Address</h3>{contact.addresses.length ? contact.addresses.map((item) => <div className="contact-method-row" key={item.id}><span>{addressText(item) || "Address details incomplete"}</span><small>{item.label || "Address"}{item.isPrimary ? " · Primary" : ""}</small></div>) : <p className="muted-copy">Not added</p>}</section>
      </div>
    },
    {
      id: "contact-notes",
      title: "Customer and private notes",
      description: "Pinned summaries stay distinct from the timestamped updates in the timeline.",
      actions: <Link className="icon-button compact" href={`/contacts/${contact.id}/edit#contact-notes`} aria-label="Edit Contact notes" title="Edit notes"><AppIcon name="edit" /></Link>,
      content: <div className="contact-notes-grid">
        <section className="contact-note-block"><h3>Customer notes summary</h3><p className="note-copy">{contact.publicNotes || "No customer notes summary yet."}</p><small>Keep durable background here; add dated updates in the Relationship timeline.</small></section>
        <section className="contact-note-block"><h3>Private relationship summary</h3><p className="note-copy">{contact.privateNotes || "No private relationship summary yet."}</p><small>This summary is never inserted into SMS or email content. Add dated deal and call updates in the timeline.</small></section>
      </div>
    },
    {
      id: "custom-fields",
      title: "Custom fields",
      description: "Workspace-specific values available to approved placeholders.",
      defaultCollapsed: true,
      actions: <Link className="icon-button compact" href="/contacts/custom-fields" aria-label="Manage custom fields" title="Manage custom fields"><AppIcon name="settings" /></Link>,
      content: contact.customFieldValues.length ? <div className="contact-method-sections personalizable-section-content">{contact.customFieldValues.map((item) => <div className="contact-method-row" key={item.id}><span>{item.value}</span><small>{item.definition.name} · {customFieldPlaceholder(item.definition.key)}</small></div>)}</div> : <p className="muted-copy">No custom values saved for this Contact.</p>
    },
    {
      id: "assigned-mixes",
      title: "Assigned Mixes",
      description: "Follow-up plans currently assigned to this Contact.",
      defaultCollapsed: true,
      content: <>
        {mixes.length ? <form action={assignMixToContactAction} className="form-stack personalizable-form-content"><input type="hidden" name="contactId" value={contact.id} /><div className="field"><label htmlFor="mixId">Mix</label><select id="mixId" name="mixId">{mixes.map((mix) => <option key={mix.id} value={mix.id}>{mix.name}</option>)}</select></div><button className="button primary" type="submit">Assign Mix</button></form> : <p className="muted-copy">Create or activate a Mix first.</p>}
        {contact.mixAssignments.length > 0 && <div className="assigned-mix-list">{contact.mixAssignments.map((assignment) => {
          const stop = stopByMixId.get(assignment.mix.id);
          return <div className="assigned-mix-row" key={assignment.id}><div><Link href={`/mixes/${assignment.mix.id}/edit`}>{assignment.mix.name}</Link>{stop && <small className="stopped-mix-label">Stopped</small>}</div><div className="assigned-mix-actions">{stop ? <form action={resumeMixForContactAction}><input type="hidden" name="mixId" value={assignment.mix.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small primary" type="submit">Resume</button></form> : <ConfirmDialog trigger="Stop…" title={`Stop ${assignment.mix.name}?`} description={`Pending Jumps for ${contact.displayName} from this Mix will leave the queue.`}><form action={stopMixForContactAction}><input type="hidden" name="mixId" value={assignment.mix.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small danger" type="submit">Stop Mix</button></form></ConfirmDialog>}<ConfirmDialog trigger="Remove…" title={`Remove ${assignment.mix.name}?`} description={`The direct assignment to ${contact.displayName} is removed. Completed Jump history remains available.`} danger><form action={removeMixAssignmentAction}><input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="contactId" value={contact.id} /><button className="button small danger" type="submit">Confirm remove</button></form></ConfirmDialog></div></div>;
        })}</div>}
        {additionalStoppedMixes.length > 0 && <div className="stopped-mix-section"><h3>Stopped from other audiences</h3>{additionalStoppedMixes.map((mix) => <div className="assigned-mix-row" key={mix.id}><div><Link href={`/mixes/${mix.id}/edit`}>{mix.name}</Link><small className="stopped-mix-label">Stopped</small></div><form action={resumeMixForContactAction}><input type="hidden" name="mixId" value={mix.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small primary" type="submit">Resume</button></form></div>)}</div>}
      </>
    }
  ];

  return (
    <div className="page contact-detail-page">
      {query.created && <Notice type="success">{query.dateCreated ? `Contact added with the first Important Date${query.mixAssigned ? " and follow-up plan" : ""}. Future Jumps are being prepared.` : "Contact added. Add an Important Date when you are ready to schedule follow-up."}</Notice>}
      {query.updated && <Notice type="success">Contact details updated. Future pending Jumps are being refreshed.</Notice>}
      {!query.created && query.dateCreated && <Notice type="success">Important Date added. Matching Mixes can now create future Jumps.</Notice>}
      {query.dateUpdated && <Notice type="success">Important Date updated. Future pending Jumps are being reconciled.</Notice>}
      {query.dateDeleted && <Notice type="success">Important Date removed from active planning. Its historical record remains recoverable.</Notice>}
      {!query.created && query.mixAssigned && <Notice type="success">Mix assigned. The background worker is preparing matching Jumps.</Notice>}
      {query.mixRemoved && <Notice type="success">Mix removed from this Contact. Completed history remains available.</Notice>}
      {query.mixStopped && <Notice type="success">Mix stopped for this Contact. Its pending Jumps were removed.</Notice>}
      {query.mixResumed && <Notice type="success">Mix resumed for this Contact. Valid future Jumps are being restored.</Notice>}
      {query.mixStopError && <Notice type="error">The Mix could not be stopped for this Contact.</Notice>}
      {query.mixResumeError && <Notice type="error">The Mix stop could not be removed.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}

      <header className="page-header">
        <div><h1>{contact.displayName}</h1><p>{contact.company || "Relationship details and follow-up timing"}</p></div>
        <div className="page-actions contact-detail-header-actions">
          <Link href={`/contacts/${contact.id}/edit`} className="button primary mobile-header-action" aria-label="Edit contact"><AppIcon name="edit" /><span>Edit contact</span></Link>
          <ContactsBackLink className="button mobile-header-action" ariaLabel="Back to Contacts"><AppIcon name="arrowLeft" /><span>Back</span></ContactsBackLink>
        </div>
      </header>

      <nav className="page-actions contact-profile-quick-actions" aria-label={`Contact ${contact.displayName}`}>
        {primaryPhone && <a className="button primary" href={`sms:${primaryPhone}`}><AppIcon name="message" />Text</a>}
        {primaryEmail && <a className="button" href={`mailto:${primaryEmail}`}><AppIcon name="email" />Email</a>}
        {primaryPhone && <a className="button" href={`tel:${primaryPhone}`}><AppIcon name="phone" />Call</a>}
        <a className="button" href="#add-important-date"><AppIcon name="calendar" />Add Important Date</a>
      </nav>

      {contact.groupMemberships.length > 0 && <div className="contact-group-strip">{contact.groupMemberships.map(({ group }) => {
        const isActive = activeByGroupId.get(group.id) !== false;
        return <span className={`group-chip ${isActive ? "" : "inactive"}`} key={group.id}><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />{group.name}{isActive ? "" : " · inactive"}</span>;
      })}</div>}

      <PersonalizableCardBoard storageKey={`jitm:contact:${contact.id}:cards`} items={cardItems} />
    </div>
  );
}
