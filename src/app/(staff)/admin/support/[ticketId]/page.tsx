import { randomUUID } from "node:crypto";
import { SupportEmailRecovery } from "@/components/SupportEmailRecovery";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { env } from "@/lib/env";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { readSupportCase } from "@/lib/support-case-access";
import { supportReadContext } from "@/lib/support-read-audit";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { SupportReplyComposer } from "@/components/SupportReplyComposer";
import { requirePlatformAdmin } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  adminAssignSupportTicketAction,
  adminUpdateSupportTicketStatusAction,
  adminUpdateSupportTicketTriageAction
} from "@/lib/support-admin-actions";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  supportCategoryLabel,
  supportEmailStatusLabel,
  supportPriorityLabel,
  supportStatusLabel
} from "@/lib/support-content";

export const metadata: Metadata = { title: "Admin · Support ticket" };

type SearchParams = {
  assignmentSaved?: string;
  replied?: string;
  email?: string;
  emailReviewed?: string;
  triageSaved?: string;
  statusSaved?: string;
  error?: string;
};

export default async function AdminSupportTicketPage({
  params,
  searchParams
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ ticketId }, query, { user, session, permissions }] = await Promise.all([params, searchParams, requirePlatformAdmin("support.manage")]);
  const displayPreferences = await displayPreferencesForUser(user.id);
  const ticket = await readSupportCase({ actorUserId: user.id, actorSessionId: session.id, ticketId, read: supportReadContext(await headers()) });
  if (!ticket) notFound();

  const staff = await prisma.user.findMany({ where: { suspendedAt: null, emailVerifiedAt: { not: null }, staffMembership: { status: "ACTIVE" } }, select: { id: true, name: true, staffMembership: true }, orderBy: { name: "asc" } });
  const assignees = staff.filter(person => hasAdminPermission(person.staffMembership, "support.manage"));
  const [requester, workspace, usage] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ticket.requesterUserId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true }
    }),
    prisma.workspace.findUnique({
      where: { id: ticket.workspaceId },
      select: { id: true, name: true }
    }),
    Promise.all([
      prisma.contact.count({ where: { workspaceId: ticket.workspaceId, archivedAt: null } }),
      prisma.mix.count({ where: { workspaceId: ticket.workspaceId, status: "ACTIVE" } }),
      prisma.jump.count({ where: { workspaceId: ticket.workspaceId, status: "PENDING" } })
    ]).then(([contacts, plans, pendingFollowUps]) => ({ contacts, plans, pendingFollowUps }))
  ]);

  const requestKey = randomUUID();
  return (
    <div className="page admin-support-ticket-page">
      <header className="page-header">
        <div>
          <span className="support-ticket-reference">{ticket.reference}</span>
          <h1>{ticket.title}</h1>
          <p>Review the complete customer thread, account context, triage state, and reply-email delivery.</p>
        </div>
        <div className="page-actions">
          <Link className="button" href="/admin/support">Support queue</Link>
          {permissions.includes("users.read") && <Link className="button" href="/admin/users">Users</Link>}
        </div>
      </header>

      {query.assignmentSaved && <Notice type="success">Ticket assignment saved. Any previous customer view for this ticket has ended.</Notice>}
      {query.replied && <Notice type="success">The response is available in the customer’s ticket. See the notification status below.</Notice>}
      {query.emailReviewed && <Notice type="success">Notification review saved. See its current status below.</Notice>}
      {query.triageSaved && <Notice type="success">Ticket category and priority updated.</Notice>}
      {query.statusSaved && <Notice type="success">Ticket status updated.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}

      <section className="support-admin-detail-grid">
        <div className="support-admin-main-column">
          <section className="card support-thread-card">
            <div className="card-header">
              <div><h2>Conversation</h2><p>All messages use server timestamps. Administrator identity remains auditable.</p></div>
              <span className="status-pill">{ticket.messages.length}</span>
            </div>
            <div className="support-thread">
              {ticket.messages.map((message) => (
                <article className={`support-message ${message.authorType === "ADMIN" ? "admin" : "user"}`} key={message.id}>
                  <header>
                    <strong>{message.authorType === "ADMIN" ? "Support" : requester?.name ?? "Customer"}</strong>
                    <time dateTime={message.createdAt.toISOString()}>{formatDateTime(message.createdAt, displayPreferences)}</time>
                  </header>
                  <p>{message.body}</p>
                  {message.authorType === "ADMIN" && (
                    <footer className="support-email-state">
                      <span className={`status-pill email-${message.emailStatus.toLowerCase()}`}>{supportEmailStatusLabel(message.emailStatus)}</span>
                      {message.emailSentAt && <small>Provider accepted {formatDateTime(message.emailSentAt, displayPreferences)}</small>}
                      {message.emailError && <small className="support-email-error">{message.emailError}</small>}
                      {message.emailDeliveries[0] && <SupportEmailRecovery ticketId={ticket.id} delivery={message.emailDeliveries[0]} canManageEmail={permissions.includes("email.manage")} />}
                      {message.emailDeliveries.length > 1 && <details><summary>Notification history ({message.emailDeliveries.length})</summary><ol>{message.emailDeliveries.map(delivery => <li key={delivery.id}>Notification {delivery.generation}: {delivery.status.toLowerCase()}, {delivery.attempts} worker attempts. Created {formatDateTime(delivery.createdAt, displayPreferences)}.</li>)}</ol></details>}
                    </footer>
                  )}
                </article>
              ))}
            </div>
          </section>

          {ticket.status !== "CLOSED" ? (
            <section className="card support-admin-reply-card">
              <div className="card-header"><div><h2>Reply</h2><p>Use a prepared response as a starting point, then tailor it to this customer.</p></div></div>
              <SupportReplyComposer key={requestKey} ticketId={ticket.id} requestKey={requestKey} />
            </section>
          ) : (
            <section className="card support-inline-empty">
              <strong>This ticket is closed.</strong>
              <span>Reopen it from the status controls before adding another response.</span>
            </section>
          )}
        </div>

        <aside className="support-admin-side-column">
          <section className="card">
            <div className="card-header"><div><h2>Assignment</h2><p>Assign a handler before opening this customer’s workspace. Changing the handler ends any active support view.</p></div></div>
            <form action={adminAssignSupportTicketAction} className="form-stack">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <input type="hidden" name="assignmentRevision" value={ticket.assignmentRevision} />
              <label className="field"><span className="field-label">Assigned to</span><select name="assignedToUserId" defaultValue={assignees.some(person => person.id === ticket.assignedToUserId) ? ticket.assignedToUserId ?? "" : ""}>
                <option value="">Unassigned</option>
                {assignees.map(person => <option key={person.id} value={person.id}>{person.name}{person.id === user.id ? " (you)" : ""}</option>)}
              </select></label>
              <label className="field"><span className="field-label">Assignment reason</span><textarea name="reason" minLength={10} maxLength={500} required /></label>
              <FormSubmitButton label="Save assignment" pendingLabel="Saving…" />
            </form>
          </section>
          {permissions.includes("support.view_customer") && (
            <section className="card">
              <div className="card-header"><div><h2>Customer support view</h2><p>Read this requester’s workspace for up to {env.impersonationMinutes} minutes. Each page request is audited. Private contact notes and mix content may be visible.</p></div></div>
              {ticket.assignedToUserId === user.id && !["RESOLVED", "CLOSED"].includes(ticket.status) ? (
                <form action="/api/admin/impersonation/start" method="post" className="form-stack">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <input type="hidden" name="assignmentRevision" value={ticket.assignmentRevision} />
                  <label className="field"><span className="field-label">Support reason</span><textarea name="reason" minLength={10} maxLength={500} required /></label>
                  <button className="button" type="submit">Start view-only session</button>
                </form>
              ) : <p>An active ticket must be assigned to you first. Resolve or close the ticket when the investigation is finished.</p>}
            </section>
          )}
          <section className="card">
            <div className="card-header"><div><h2>Triage</h2><p>Classification helps the queue remain actionable.</p></div></div>
            <form action={adminUpdateSupportTicketTriageAction} className="form-stack">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <label className="field">
                <span className="field-label">Category</span>
                <select name="category" defaultValue={ticket.category}>
                  {SUPPORT_CATEGORIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Priority</span>
                <select name="priority" defaultValue={ticket.priority}>
                  {SUPPORT_PRIORITIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                </select>
              </label>
              <button className="button" type="submit">Save triage</button>
            </form>
          </section>

          <section className="card">
            <div className="card-header"><div><h2>Status</h2><p>{supportStatusLabel(ticket.status)} · last activity {formatDateTime(ticket.lastActivityAt, displayPreferences)}</p></div></div>
            <div className="support-status-actions">
              {ticket.status !== "WAITING_ON_SUPPORT" && (
                <form action={adminUpdateSupportTicketStatusAction}><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="status" value="WAITING_ON_SUPPORT" /><button className="button" type="submit">Return to support queue</button></form>
              )}
              {ticket.status !== "RESOLVED" && (
                <form action={adminUpdateSupportTicketStatusAction}><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="status" value="RESOLVED" /><button className="button primary" type="submit">Resolve ticket</button></form>
              )}
              {ticket.status !== "CLOSED" ? (
                <form action={adminUpdateSupportTicketStatusAction}><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="status" value="CLOSED" /><button className="button danger" type="submit">Close ticket</button></form>
              ) : (
                <form action={adminUpdateSupportTicketStatusAction}><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="status" value="OPEN" /><button className="button" type="submit">Reopen ticket</button></form>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header"><div><h2>Customer context</h2><p>Use this information to investigate without asking the customer to repeat basic account details.</p></div></div>
            <dl className="support-definition-list">
              <div><dt>Requester</dt><dd>{requester?.name ?? "Unavailable"}</dd></div>
              <div><dt>Email</dt><dd>{requester?.email ?? ticket.requesterUserId}</dd></div>
              <div><dt>Email verified</dt><dd>{requester?.emailVerifiedAt ? "Yes" : "No"}</dd></div>
              <div><dt>Workspace</dt><dd>{workspace?.name ?? ticket.workspaceId}</dd></div>
              <div><dt>Contacts</dt><dd>{usage.contacts}</dd></div>
              <div><dt>Active mixes</dt><dd>{usage.plans}</dd></div>
              <div><dt>Pending follow-ups</dt><dd>{usage.pendingFollowUps}</dd></div>
              <div><dt>Category</dt><dd>{supportCategoryLabel(ticket.category)}</dd></div>
              <div><dt>Priority</dt><dd>{supportPriorityLabel(ticket.priority)}</dd></div>
            </dl>
          </section>
        </aside>
      </section>
    </div>
  );
}
