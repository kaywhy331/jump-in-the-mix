import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import {
  assignMixToContactAction,
  createImportantDateAction,
  deleteJumpDateAction,
  removeMixAssignmentAction
} from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { customFieldPlaceholder } from "@/lib/contact-custom-fields";
import { formatDate } from "@/lib/format";
import { listGroupStates } from "@/lib/group-activity";
import { resumeMixForContactAction, stopMixForContactAction } from "@/lib/mix-stop-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Contact details" };

type SearchParams = {
  dateCreated?: string;
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
        jumpDates: { include: { dateType: true }, orderBy: { dateValue: "asc" } },
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

  return (
    <div className="page">
      {query.updated && <Notice type="success">Contact details updated. Future pending Jumps are being refreshed.</Notice>}
      {query.dateCreated && <Notice type="success">Important Date added. Matching Mixes can now create future Jumps.</Notice>}
      {query.dateDeleted && <Notice type="success">Important Date removed. Obsolete future Jumps are being reconciled.</Notice>}
      {query.mixAssigned && <Notice type="success">Mix assigned. The background worker is preparing matching Jumps.</Notice>}
      {query.mixRemoved && <Notice type="success">Mix removed from this Contact. Completed history remains available.</Notice>}
      {query.mixStopped && <Notice type="success">Mix stopped for this Contact. Its pending Jumps were removed.</Notice>}
      {query.mixResumed && <Notice type="success">Mix resumed for this Contact. Valid future Jumps are being restored.</Notice>}
      {query.mixStopError && <Notice type="error">The Mix could not be stopped for this Contact.</Notice>}
      {query.mixResumeError && <Notice type="error">The Mix stop could not be removed.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header">
        <div><h1>{contact.displayName}</h1><p>{contact.company || "Relationship details and follow-up timing"}</p></div>
        <div className="page-actions"><Link href={`/contacts/${contact.id}/edit`} className="button primary">Edit contact</Link><Link href="/contacts" className="button">Back</Link></div>
      </header>

      {contact.groupMemberships.length > 0 && <div className="contact-group-strip">{contact.groupMemberships.map(({ group }) => {
        const isActive = activeByGroupId.get(group.id) !== false;
        return <span className={`group-chip ${isActive ? "" : "inactive"}`} key={group.id}><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />{group.name}{isActive ? "" : " · inactive"}</span>;
      })}</div>}

      <div className="dashboard-grid">
        <section>
          <div className="card">
            <div className="card-header"><div><h2>Important Dates</h2><p>These moments can start a follow-up plan.</p></div></div>
            {contact.jumpDates.length ? <div className="jump-list">{contact.jumpDates.map((item) => (
              <article className="jump-card contact-date-card" key={item.id}>
                <div><h3>{item.dateType.name}</h3><div className="jump-meta"><span>{item.dateValue ? formatDate(item.dateValue) : `${item.month}/${item.day}`}</span><span>{item.recurrence.toLowerCase()}</span>{item.label && <span>{item.label}</span>}</div></div>
                <details className="destructive-confirm"><summary className="button small danger">Remove…</summary><div className="destructive-confirm-panel"><p>Remove this Important Date? Future pending work tied to it will be canceled.</p><form action={deleteJumpDateAction}><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="jumpDateId" value={item.id} /><button className="button small danger" type="submit">Confirm removal</button></form></div></details>
              </article>
            ))}</div> : <p className="muted-copy">No Important Dates yet. Add the next moment you genuinely need to remember.</p>}
          </div>

          <div className="card">
            <div className="card-header"><div><h2>Add an Important Date</h2><p>Choose the moment and when it occurs.</p></div></div>
            <form action={createImportantDateAction} className="form-grid">
              <input type="hidden" name="contactId" value={contact.id} />
              <div className="field"><label htmlFor="dateTypeId">Important Date Type</label><select id="dateTypeId" name="dateTypeId" required defaultValue={followUpType?.id}>{dateTypes.map((type) => <option key={type.id} value={type.id}>{type.isSystem ? `System · ${type.name}` : type.name}</option>)}</select></div>
              <div className="field"><label htmlFor="dateValue">Date</label><input id="dateValue" name="dateValue" type="date" required /></div>
              <div className="field"><label htmlFor="recurrence">Repeat</label><select id="recurrence" name="recurrence"><option value="NONE">Does not repeat</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></div>
              <div className="field"><label htmlFor="label">Optional label</label><input id="label" name="label" placeholder="Proposal follow-up" /></div>
              <label className="checkbox-card field full onboarding-default"><input type="checkbox" name="autoAssignRecommended" defaultChecked /><span><strong>Start a matching follow-up plan</strong><small>The first active Mix using this Important Date Type will be assigned automatically.</small></span></label>
              <div className="form-actions field full"><button className="button primary" type="submit">Add Important Date</button></div>
            </form>
          </div>
        </section>

        <aside>
          <div className="card">
            <div className="card-header"><div><h2>Contact methods</h2><p>Primary values appear first.</p></div></div>
            <div className="contact-method-sections">
              <section><h3>Email</h3>{contact.emails.length ? contact.emails.map((item) => <div className="contact-method-row" key={item.id}><span>{item.email}</span><small>{item.label || "Email"}{item.isPrimary ? " · Primary" : ""}</small></div>) : <p className="muted-copy">Not added</p>}</section>
              <section><h3>Phone</h3>{contact.phones.length ? contact.phones.map((item) => <div className="contact-method-row" key={item.id}><span>{item.phone}</span><small>{item.label || "Phone"}{item.isPrimary ? " · Primary" : ""}</small></div>) : <p className="muted-copy">Not added</p>}</section>
              <section><h3>Address</h3>{contact.addresses.length ? contact.addresses.map((item) => <div className="contact-method-row" key={item.id}><span>{addressText(item) || "Address details incomplete"}</span><small>{item.label || "Address"}{item.isPrimary ? " · Primary" : ""}</small></div>) : <p className="muted-copy">Not added</p>}</section>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div><h2>Notes</h2></div></div>
            <div className="form-stack">
              <div><small className="field-label">Public Notes</small><p className="note-copy">{contact.publicNotes || "No Public Notes"}</p></div>
              <div><small className="field-label">Private Notes</small><p className="note-copy">{contact.privateNotes || "No Private Notes"}</p><small className="muted-copy">Available only to Phone Call Jump scripts.</small></div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div><h2>Custom fields</h2><p>Values are available as dynamic Jump placeholders.</p></div><Link className="button small" href="/contacts/custom-fields">Manage</Link></div>
            {contact.customFieldValues.length ? <div className="contact-method-sections">{contact.customFieldValues.map((item) => <div className="contact-method-row" key={item.id}><span>{item.value}</span><small>{item.definition.name} · {customFieldPlaceholder(item.definition.key)}</small></div>)}</div> : <p className="muted-copy">No custom values saved for this Contact.</p>}
          </div>

          <div className="card">
            <div className="card-header"><div><h2>Assigned Mixes</h2><p>Stop pauses one Mix for this Contact without deleting history or the assignment.</p></div></div>
            {mixes.length ? <form action={assignMixToContactAction} className="form-stack"><input type="hidden" name="contactId" value={contact.id} /><div className="field"><label htmlFor="mixId">Mix</label><select id="mixId" name="mixId">{mixes.map((mix) => <option key={mix.id} value={mix.id}>{mix.name}</option>)}</select></div><button className="button primary" type="submit">Assign Mix</button></form> : <p className="muted-copy">Create or activate a Mix first.</p>}
            {contact.mixAssignments.length > 0 && <div className="assigned-mix-list">{contact.mixAssignments.map((assignment) => {
              const stop = stopByMixId.get(assignment.mix.id);
              return <div className="assigned-mix-row" key={assignment.id}><div><Link href={`/mixes/${assignment.mix.id}/edit`}>{assignment.mix.name}</Link>{stop && <small className="stopped-mix-label">Stopped</small>}</div><div className="assigned-mix-actions">{stop ? <form action={resumeMixForContactAction}><input type="hidden" name="mixId" value={assignment.mix.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small primary" type="submit">Resume</button></form> : <details className="destructive-confirm"><summary className="button small">Stop…</summary><div className="destructive-confirm-panel"><p>Stop this Mix only for {contact.displayName}? Pending Jumps from it will leave the queue.</p><form action={stopMixForContactAction}><input type="hidden" name="mixId" value={assignment.mix.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small danger" type="submit">Stop Mix</button></form></div></details>}<form action={removeMixAssignmentAction}><input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="contactId" value={contact.id} /><button className="button small danger" type="submit">Remove</button></form></div></div>;
            })}</div>}
            {additionalStoppedMixes.length > 0 && <div className="stopped-mix-section"><h3>Stopped from other audiences</h3>{additionalStoppedMixes.map((mix) => <div className="assigned-mix-row" key={mix.id}><div><Link href={`/mixes/${mix.id}/edit`}>{mix.name}</Link><small className="stopped-mix-label">Stopped</small></div><form action={resumeMixForContactAction}><input type="hidden" name="mixId" value={mix.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small primary" type="submit">Resume</button></form></div>)}</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
