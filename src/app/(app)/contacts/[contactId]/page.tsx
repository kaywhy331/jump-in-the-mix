import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { assignMixToContactAction, createImportantDateAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Contact details" };

export default async function ContactDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ dateCreated?: string; mixAssigned?: string; error?: string }>;
}) {
  const [{ contactId }, query] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace();
  const [contact, dateTypes, mixes] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: contactId, workspaceId: workspace.id, archivedAt: null },
      include: {
        emails: true,
        phones: true,
        jumpDates: { include: { dateType: true }, orderBy: { dateValue: "asc" } },
        mixAssignments: { include: { mix: true }, where: { isActive: true } }
      }
    }),
    prisma.dateType.findMany({ where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null }] }, orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
    prisma.mix.findMany({ where: { workspaceId: workspace.id, status: "ACTIVE" }, orderBy: { name: "asc" } })
  ]);
  if (!contact) notFound();
  const followUpType = dateTypes.find((type) => type.slug === "follow-up");

  return (
    <div className="page">
      {query.dateCreated && <Notice type="success">Important Date added. Any matching Mix can now generate future Jumps.</Notice>}
      {query.mixAssigned && <Notice type="success">Mix assigned. The background worker will prepare the matching Jumps.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header">
        <div><h1>{contact.displayName}</h1><p>{contact.company || "Relationship details and follow-up timing"}</p></div>
      </header>

      <div className="dashboard-grid">
        <section>
          <div className="card">
            <div className="card-header"><div><h2>Important Dates</h2><p>Dates are the moments that can trigger a follow-up Mix.</p></div></div>
            {contact.jumpDates.length ? (
              <div className="jump-list">
                {contact.jumpDates.map((item) => (
                  <article className="jump-card" key={item.id}>
                    <div><h3>{item.dateType.name}</h3><div className="jump-meta"><span>{item.dateValue ? formatDate(item.dateValue) : `${item.month}/${item.day}`}</span><span>{item.recurrence.toLowerCase()}</span>{item.label && <span>{item.label}</span>}</div></div>
                    <span className="status-pill">Active</span>
                  </article>
                ))}
              </div>
            ) : <p style={{ color: "var(--muted)" }}>No Important Dates yet. Add the next date you genuinely need to remember.</p>}
          </div>

          <div className="card">
            <div className="card-header"><div><h2>Add an Important Date</h2><p>Examples include a follow-up, renewal, event, birthday, or custom milestone.</p></div></div>
            <form action={createImportantDateAction} className="form-grid">
              <input type="hidden" name="contactId" value={contact.id} />
              <div className="field"><label htmlFor="dateTypeId">What is this date for?</label><select id="dateTypeId" name="dateTypeId" required defaultValue={followUpType?.id}>{dateTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
              <div className="field"><label htmlFor="dateValue">Date</label><input id="dateValue" name="dateValue" type="date" required /></div>
              <div className="field"><label htmlFor="recurrence">Repeat</label><select id="recurrence" name="recurrence"><option value="NONE">Does not repeat</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></div>
              <div className="field"><label htmlFor="label">Optional label</label><input id="label" name="label" placeholder="Proposal follow-up" /></div>
              <label className="checkbox-card field full onboarding-default"><input type="checkbox" name="autoAssignRecommended" defaultChecked /><span><strong>Use a matching follow-up Mix automatically</strong><small>If an active Mix matches this date type, it will be assigned so Jumps can appear without another setup step.</small></span></label>
              <div className="form-actions field full"><button className="button primary" type="submit">Add Important Date</button></div>
            </form>
          </div>
        </section>

        <aside>
          <div className="card">
            <div className="card-header"><div><h2>Contact details</h2></div></div>
            <div className="form-stack">
              <div><small className="field-label">Email</small><div>{contact.emails[0]?.email || "Not added"}</div></div>
              <div><small className="field-label">Phone</small><div>{contact.phones[0]?.phone || "Not added"}</div></div>
              <div><small className="field-label">Notes</small><div>{contact.publicNotes || "No private notes"}</div></div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div><h2>Follow-up Mixes</h2><p>Assign an active plan to this person.</p></div></div>
            {mixes.length ? (
              <form action={assignMixToContactAction} className="form-stack">
                <input type="hidden" name="contactId" value={contact.id} />
                <div className="field"><label htmlFor="mixId">Mix</label><select id="mixId" name="mixId">{mixes.map((mix) => <option key={mix.id} value={mix.id}>{mix.name}</option>)}</select></div>
                <button className="button primary" type="submit">Assign Mix</button>
              </form>
            ) : <p style={{ color: "var(--muted)" }}>Create or activate a Mix first.</p>}
            {contact.mixAssignments.length > 0 && <div className="checklist">{contact.mixAssignments.map((assignment) => <div className="check-row done" key={assignment.id}><span>✓</span><span>{assignment.mix.name}</span></div>)}</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
