import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ContactRelationshipStatePanel } from "@/components/ContactRelationshipStatePanel";
import { ContactTimeline } from "@/components/ContactTimeline";
import { ContactsBackLink } from "@/components/ContactsBackLink";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { customFieldPlaceholder } from "@/lib/contact-custom-fields";
import { assignMixToContactAction, removeMixAssignmentAction } from "@/lib/contact-mix-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDate, formatDateTime } from "@/lib/format";
import { listGroupStates } from "@/lib/group-activity";
import { createImportantDateAction, deactivateImportantDateAction, updateImportantDateAction } from "@/lib/important-date-actions";
import { formatDateInput } from "@/lib/mix-broadcast";
import { resumeMixForContactAction, stopMixForContactAction } from "@/lib/mix-stop-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Contact details" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

type SearchParams = {
  created?: string; dateCreated?: string; dateUpdated?: string; dateDeleted?: string; mixAssigned?: string; mixRemoved?: string;
  mixStopped?: string; mixResumed?: string; mixStopError?: string; mixResumeError?: string; updated?: string; inlineUpdated?: string;
  stateUpdated?: string; merged?: string; error?: string;
};

function addressText(address: { street1: string | null; street2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null }): string {
  return [address.street1, address.street2, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(", ");
}

export default async function ContactDetailPage({ params, searchParams }: { params: Promise<{ contactId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ contactId }, query, { workspace, user }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const [contact, dateTypes, plans, stops, groupStates, relationshipState, mergeHistory, nextFollowUp] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: contactId, workspaceId: workspace.id, archivedAt: null },
      include: {
        emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        groupMemberships: { include: { group: true } },
        customFieldValues: { include: { definition: true }, orderBy: { definition: { name: "asc" } } },
        jumpDates: { where: { isActive: true }, include: { dateType: true }, orderBy: [{ dateValue: "asc" }, { month: "asc" }, { day: "asc" }] },
        mixAssignments: { include: { mix: true }, where: { isActive: true, contactId }, orderBy: { createdAt: "asc" } }
      }
    }),
    prisma.dateType.findMany({ where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null }] }, orderBy: [{ isSystem: "asc" }, { name: "asc" }] }),
    prisma.mix.findMany({ where: { workspaceId: workspace.id, status: "ACTIVE", source: { not: "ONE_TIME" } }, orderBy: { name: "asc" } }),
    prisma.mixStop.findMany({ where: { workspaceId: workspace.id, contactId }, orderBy: { stoppedAt: "desc" } }),
    listGroupStates(workspace.id),
    prisma.contactRelationshipState.findUnique({ where: { contactId } }),
    prisma.contactMergeRecord.findMany({ where: { workspaceId: workspace.id, survivorContactId: contactId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.jump.findFirst({ where: { workspaceId: workspace.id, contactId, status: { in: ["PENDING", "COPIED"] } }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true, reason: true } })
  ]);
  if (!contact) notFound();

  const displayPreferences = await displayPreferencesForUser(user.id, workspace.profile?.timezone ?? "UTC");
  const followUpType = dateTypes.find((type) => type.slug === "follow-up");
  const stopByMixId = new Map(stops.map((stop) => [stop.mixId, stop]));
  const directPlanIds = new Set(contact.mixAssignments.map((assignment) => assignment.mixId));
  const additionalStoppedPlans = plans.filter((plan) => stopByMixId.has(plan.id) && !directPlanIds.has(plan.id));
  const activeByGroupId = new Map(groupStates.map((state) => [state.groupId, state.isActive]));
  const primaryEmail = contact.emails.find((item) => item.isPrimary)?.email ?? contact.emails[0]?.email ?? null;
  const primaryPhone = contact.phones.find((item) => item.isPrimary)?.phone ?? contact.phones[0]?.phone ?? null;
  const state = relationshipState ?? { preferredChannel: null, priority: "NORMAL" as const, doNotContact: false, relationshipStatus: null, nextCommitmentAt: null, version: 0 };

  return (
    <div className="page contact-detail-page">
      {query.created && <Notice type="success">Contact added.</Notice>}
      {query.updated && <Notice type="success">Contact updated.</Notice>}
      {query.inlineUpdated && <Notice type="success">Contact saved.</Notice>}
      {query.stateUpdated && <Notice type="success">Saved.</Notice>}
      {query.merged && <Notice type="success">Contacts merged.</Notice>}
      {!query.created && query.dateCreated && <Notice type="success">Date added.</Notice>}
      {query.dateUpdated && <Notice type="success">Date updated.</Notice>}
      {query.dateDeleted && <Notice type="success">Date removed.</Notice>}
      {!query.created && query.mixAssigned && <Notice type="success">Plan started.</Notice>}
      {query.mixRemoved && <Notice type="success">Plan removed.</Notice>}
      {query.mixStopped && <Notice type="success">Plan stopped.</Notice>}
      {query.mixResumed && <Notice type="success">Plan resumed.</Notice>}
      {query.mixStopError && <Notice type="error">Plan could not be stopped.</Notice>}
      {query.mixResumeError && <Notice type="error">Plan could not be resumed.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      {state.doNotContact && <Notice type="info">Do not contact is on.</Notice>}

      <header className="page-header contact-profile-header">
        <div><h1>{contact.displayName}</h1><p>{contact.company || "Customer details"}</p></div>
        <div className="page-actions contact-detail-header-actions">
          <Link href={`/contacts/${contact.id}/edit`} className="button primary"><AppIcon name="edit" />Edit</Link>
          <ContactsBackLink className="button" ariaLabel="Back to contacts"><AppIcon name="arrowLeft" />Back</ContactsBackLink>
        </div>
      </header>

      {!state.doNotContact && <nav className="contact-profile-quick-actions" aria-label={`Contact ${contact.displayName}`}>
        {primaryPhone ? <a className="button primary" href={`sms:${primaryPhone}`}><AppIcon name="message" />Text</a> : <Link className="button primary" href={`/contacts/${contact.id}/edit`}><AppIcon name="add" />Add phone</Link>}
        {primaryPhone && <a className="button" href={`tel:${primaryPhone}`}><AppIcon name="phone" />Call</a>}
        {primaryEmail ? <a className="button" href={`mailto:${primaryEmail}`}><AppIcon name="email" />Email</a> : <Link className="button" href={`/contacts/${contact.id}/edit`}><AppIcon name="add" />Add email</Link>}
      </nav>}

      <section className="contact-next-line" aria-label="Next follow-up">
        {nextFollowUp ? <><span>Next</span><strong>{nextFollowUp.reason}</strong><time>{formatDateTime(nextFollowUp.scheduledAt, displayPreferences)}</time><Link href="/jumps">Open Today</Link></> : <><span>Next</span><strong>Nothing scheduled</strong><Link href="#add-date">Add a date</Link></>}
      </section>

      {contact.groupMemberships.length > 0 && <div className="contact-group-strip" aria-label="Tags">{contact.groupMemberships.map(({ group }) => {
        const isActive = activeByGroupId.get(group.id) !== false;
        return <span className={`group-chip ${isActive ? "" : "inactive"}`} key={group.id}><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />{group.name}</span>;
      })}</div>}

      <div className="contact-detail-primary">
        <section className="card contact-notes-card">
          <div className="card-header"><div><h2>Notes</h2><p>The useful context you want handy before calling.</p></div><Link className="button small" href={`/contacts/${contact.id}/edit#contact-notes`}>Edit</Link></div>
          <p className="note-copy">{contact.publicNotes || "No notes yet."}</p>
          {contact.privateNotes && <div className="private-note"><strong>Private</strong><p>{contact.privateNotes}</p></div>}
        </section>

        <section className="card contact-priority-card">
          <div className="card-header"><div><h2>Relationship</h2><p>Changes save when tapped.</p></div></div>
          <ContactRelationshipStatePanel contactId={contact.id} state={state} />
        </section>

        <section className="card contact-timeline-card">
          <div className="card-header"><div><h2>Timeline</h2><p>Recent calls, messages, and notes.</p></div></div>
          <ContactTimeline contactId={contact.id} />
        </section>
      </div>

      <details className="card contact-detail-more">
        <summary><span><strong>More</strong><small>Dates, plans, contact details, and custom fields</small></span><AppIcon name="chevronDown" /></summary>
        <div className="contact-more-sections">
          <section>
            <div className="card-header"><div><h2>Contact details</h2><p>Primary details appear first.</p></div><Link className="button small" href={`/contacts/${contact.id}/edit`}>Edit</Link></div>
            <div className="contact-method-sections">
              <section><h3>Phone</h3>{contact.phones.length ? contact.phones.map((item) => <div className="contact-method-row" key={item.id}><span>{item.phone}</span><small>{item.label || "Phone"}{item.isPrimary ? " · Primary" : ""}</small></div>) : <p className="muted-copy">Not added</p>}</section>
              <section><h3>Email</h3>{contact.emails.length ? contact.emails.map((item) => <div className="contact-method-row" key={item.id}><span>{item.email}</span><small>{item.label || "Email"}{item.isPrimary ? " · Primary" : ""}</small></div>) : <p className="muted-copy">Not added</p>}</section>
              <section><h3>Address</h3>{contact.addresses.length ? contact.addresses.map((item) => <div className="contact-method-row" key={item.id}><span>{addressText(item) || "Address incomplete"}</span><small>{item.label || "Address"}{item.isPrimary ? " · Primary" : ""}</small></div>) : <p className="muted-copy">Not added</p>}</section>
            </div>
          </section>

          <section>
            <div className="card-header"><div><h2>Dates</h2><p>Moments that can start a follow-up plan.</p></div></div>
            {contact.jumpDates.length ? <div className="important-date-list">{contact.jumpDates.map((item) => <article className="important-date-row" key={item.id}>
              <div className="important-date-summary"><h3>{item.dateType.name}</h3><div className="jump-meta"><span>{item.dateValue ? formatDate(item.dateValue, displayPreferences) : `${item.month}/${item.day}`}</span><span>{item.recurrence.toLowerCase()}</span>{item.label && <span>{item.label}</span>}</div></div>
              <div className="important-date-actions">
                <details className="important-date-edit"><summary className="button small">Edit</summary><form action={updateImportantDateAction} className="important-date-edit-panel"><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="jumpDateId" value={item.id} />{!item.dateValue && <input type="hidden" name="monthDayOnly" value="1" />}<label className="field"><span>Type</span><select name="dateTypeId" defaultValue={item.dateTypeId} required>{dateTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>{item.dateValue ? <label className="field"><span>Date</span><input name="dateValue" type="date" defaultValue={formatDateInput(item.dateValue)} required /></label> : <><label className="field"><span>Month</span><select name="month" defaultValue={item.month ?? ""} required><option value="">Choose month</option>{MONTHS.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}</select></label><label className="field"><span>Day</span><input name="day" type="number" min={1} max={31} defaultValue={item.day ?? ""} inputMode="numeric" required /></label></>}<label className="field"><span>Repeat</span><select name="recurrence" defaultValue={item.recurrence}><option value="NONE">Does not repeat</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></label><label className="field"><span>Note</span><input name="label" defaultValue={item.label ?? ""} /></label><button className="button primary" type="submit">Save</button></form></details>
                <ConfirmDialog trigger={<AppIcon name="trash" />} triggerAriaLabel={`Remove ${item.dateType.name}`} triggerClassName="icon-button compact danger" title={`Remove ${item.dateType.name}?`} description="Future follow-ups tied to this date will be removed." danger><form action={deactivateImportantDateAction}><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="jumpDateId" value={item.id} /><button className="button danger" type="submit">Remove date</button></form></ConfirmDialog>
              </div>
            </article>)}</div> : <p className="muted-copy">No dates saved yet.</p>}
            <form id="add-date" action={createImportantDateAction} className="form-grid contact-add-date"><input type="hidden" name="contactId" value={contact.id} /><label className="field"><span>What date?</span><select name="dateTypeId" required defaultValue={followUpType?.id}>{dateTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label className="field"><span>When?</span><input name="dateValue" type="date" required /></label><label className="field"><span>Repeat</span><select name="recurrence"><option value="NONE">Does not repeat</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></label><label className="field"><span>Note</span><input name="label" placeholder="Estimate follow-up" /></label><label className="checkbox-card field full"><input type="checkbox" name="autoAssignRecommended" defaultChecked /><span><strong>Start a matching plan</strong><small>Uses your first active plan for this kind of date.</small></span></label><button className="button primary" type="submit">Add date</button></form>
          </section>

          <section>
            <div className="card-header"><div><h2>Plans</h2><p>Follow-up sequences assigned to this person.</p></div></div>
            {plans.length ? <form action={assignMixToContactAction} className="form-stack"><input type="hidden" name="contactId" value={contact.id} /><label className="field"><span>Choose a plan</span><select name="mixId">{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><button className="button primary" type="submit" disabled={state.doNotContact}>Start plan</button></form> : <p className="muted-copy">Create a plan first.</p>}
            {contact.mixAssignments.length > 0 && <div className="assigned-mix-list">{contact.mixAssignments.map((assignment) => {
              const stop = stopByMixId.get(assignment.mix.id);
              return <div className="assigned-mix-row" key={assignment.id}><div><Link href={`/mixes/${assignment.mix.id}/edit`}>{assignment.mix.name}</Link>{stop && <small className="stopped-mix-label">Stopped</small>}</div><div className="assigned-mix-actions">{stop ? <form action={resumeMixForContactAction}><input type="hidden" name="mixId" value={assignment.mix.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small primary" type="submit">Resume</button></form> : <ConfirmDialog trigger="Stop…" title={`Stop ${assignment.mix.name}?`} description="Future follow-ups from this plan will be removed."><form action={stopMixForContactAction}><input type="hidden" name="mixId" value={assignment.mix.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small danger" type="submit">Stop plan</button></form></ConfirmDialog>}<ConfirmDialog trigger="Remove…" title={`Remove ${assignment.mix.name}?`} description="Completed history stays available." danger><form action={removeMixAssignmentAction}><input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="contactId" value={contact.id} /><button className="button small danger" type="submit">Remove</button></form></ConfirmDialog></div></div>;
            })}</div>}
            {additionalStoppedPlans.length > 0 && <div className="stopped-mix-section"><h3>Other stopped plans</h3>{additionalStoppedPlans.map((plan) => <div className="assigned-mix-row" key={plan.id}><span>{plan.name}</span><form action={resumeMixForContactAction}><input type="hidden" name="mixId" value={plan.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small" type="submit">Resume</button></form></div>)}</div>}
          </section>

          {contact.customFieldValues.length > 0 && <section><div className="card-header"><div><h2>Custom fields</h2></div><Link className="button small" href="/contacts/custom-fields">Manage</Link></div><div className="contact-method-sections">{contact.customFieldValues.map((item) => <div className="contact-method-row" key={item.id}><span>{item.value}</span><small>{item.definition.name} · {customFieldPlaceholder(item.definition.key)}</small></div>)}</div></section>}
          {mergeHistory.length > 0 && <small className="muted-copy">{mergeHistory.length} duplicate merge{mergeHistory.length === 1 ? "" : "s"} recorded.</small>}
        </div>
      </details>
    </div>
  );
}
