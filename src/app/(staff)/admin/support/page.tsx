import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import type { Prisma } from "@/generated/prisma/client";
import { requirePlatformAdmin } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  isSupportCategory,
  isSupportPriority,
  isSupportStatus,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  supportCategoryLabel,
  supportPriorityLabel,
  supportStatusLabel,
  type SupportCategoryValue,
  type SupportPriorityValue,
  type SupportStatusValue
} from "@/lib/support-content";

export const metadata: Metadata = { title: "Admin · Support" };

type SearchParams = {
  q?: string;
  email?: string;
  error?: string;
  impersonationEnded?: string;
  status?: string;
  category?: string;
  priority?: string;
};

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { user }] = await Promise.all([searchParams, requirePlatformAdmin("support.manage")]);
  const displayPreferences = await displayPreferencesForUser(user.id);
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const statusValue = params.status ?? "";
  const categoryValue = params.category ?? "";
  const priorityValue = params.priority ?? "";
  const status: SupportStatusValue | "all" = isSupportStatus(statusValue) ? statusValue : "all";
  const category: SupportCategoryValue | "all" = isSupportCategory(categoryValue) ? categoryValue : "all";
  const priority: SupportPriorityValue | "all" = isSupportPriority(priorityValue) ? priorityValue : "all";

  const [matchingUsers, matchingWorkspaces] = query
    ? await Promise.all([
        prisma.user.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } }
            ]
          },
          select: { id: true }
        }),
        prisma.workspace.findMany({
          where: { name: { contains: query, mode: "insensitive" } },
          select: { id: true }
        })
      ])
    : [[], []];

  const where: Prisma.SupportTicketWhereInput = {
    ...(params.email === "review" ? { messages: { some: { authorType: "ADMIN", emailStatus: "FAILED" } } } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(category !== "all" ? { category } : {}),
    ...(priority !== "all" ? { priority } : {}),
    ...(query
      ? {
          OR: [
            { reference: { contains: query, mode: "insensitive" } },
            { title: { contains: query, mode: "insensitive" } },
            { requesterUserId: { in: matchingUsers.map((item) => item.id) } },
            { workspaceId: { in: matchingWorkspaces.map((item) => item.id) } }
          ]
        }
      : {})
  };

  const [tickets, openCount, waitingCount, urgentCount, failedEmailCount] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        _count: { select: { messages: true } },
        assignedTo: { select: { name: true } }
      },
      orderBy: [{ priority: "desc" }, { lastActivityAt: "desc" }],
      take: 100
    }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "WAITING_ON_SUPPORT"] } } }),
    prisma.supportTicket.count({ where: { status: "WAITING_ON_USER" } }),
    prisma.supportTicket.count({ where: { priority: "URGENT", status: { not: "CLOSED" } } }),
    prisma.supportTicketMessage.count({ where: { authorType: "ADMIN", emailStatus: "FAILED" } })
  ]);

  const requesterIds = [...new Set(tickets.map((ticket) => ticket.requesterUserId))];
  const workspaceIds = [...new Set(tickets.map((ticket) => ticket.workspaceId))];
  const [requesters, workspaces] = await Promise.all([
    requesterIds.length
      ? prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } })
      : [],
    workspaceIds.length
      ? prisma.workspace.findMany({
          where: { id: { in: workspaceIds } },
          select: { id: true, name: true }
        })
      : []
  ]);
  const requesterById = new Map(requesters.map((item) => [item.id, item]));
  const workspaceById = new Map(workspaces.map((item) => [item.id, item]));

  return (
    <div className="page admin-support-page">
      <header className="page-header">
        <div>
          <h1>Admin · Support</h1>
          <p>Assign tickets, review customer requests, and track replies. Opening a conversation records access in the audit log.</p>
        </div>
        <div className="page-actions">
          <Link className="button" href="/admin/users">Users</Link>
          <Link className="button" href="/admin/templates">Ready-made mixes</Link>
        </div>
      </header>

      {params.error && <Notice type="error">{params.error}</Notice>}
      {params.impersonationEnded && <Notice type="success">The view-only support session has ended.</Notice>}
      <section className="stats-grid admin-support-stats">
        <article className="stat-card"><small>Waiting on support</small><strong>{openCount}</strong></article>
        <article className="stat-card"><small>Waiting on customer</small><strong>{waitingCount}</strong></article>
        <article className="stat-card"><small>Urgent, not closed</small><strong>{urgentCount}</strong></article>
        <article className="stat-card"><small>Reply emails needing review</small><strong>{failedEmailCount}</strong><Link href="/admin/support?email=review">Review notifications</Link></article>
      </section>

      <form className="card support-admin-filters" method="get">
        <label className="field"><span className="field-label">Email notifications</span><select name="email" defaultValue={params.email === "review" ? "review" : "all"}><option value="all">All tickets</option><option value="review">Needs review</option></select></label>
        <label className="field support-admin-query">
          <span className="field-label">Search</span>
          <input name="q" defaultValue={query} placeholder="Reference, title, user, email, or workspace" />
        </label>
        <label className="field">
          <span className="field-label">Status</span>
          <select name="status" defaultValue={status}>
            <option value="all">All statuses</option>
            {SUPPORT_STATUSES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Category</span>
          <select name="category" defaultValue={category}>
            <option value="all">All categories</option>
            {SUPPORT_CATEGORIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Priority</span>
          <select name="priority" defaultValue={priority}>
            <option value="all">All priorities</option>
            {SUPPORT_PRIORITIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <div className="support-admin-filter-actions">
          <button className="button primary" type="submit">Apply filters</button>
          <Link className="button" href="/admin/support">Clear</Link>
        </div>
      </form>

      <section className="support-admin-ticket-list">
        {tickets.map((ticket) => {
          const requester = requesterById.get(ticket.requesterUserId);
          const workspace = workspaceById.get(ticket.workspaceId);
          return (
            <Link prefetch={false} className={`card support-admin-ticket priority-${ticket.priority.toLowerCase()}`} href={`/admin/support/${ticket.id}`} key={ticket.id}>
              <div className="support-admin-ticket-heading">
                <div>
                  <span className="support-ticket-reference">{ticket.reference}</span>
                  <h2>{ticket.title}</h2>
                  <p>{requester?.name ?? "Unknown requester"} · {requester?.email ?? ticket.requesterUserId}</p>
                </div>
                <div className="support-admin-ticket-badges">
                  <span className={`status-pill ${ticket.status === "RESOLVED" ? "done" : ""}`}>{supportStatusLabel(ticket.status)}</span>
                  <span className={`status-pill priority-${ticket.priority.toLowerCase()}`}>{supportPriorityLabel(ticket.priority)}</span>
                </div>
              </div>
              <div className="support-admin-ticket-context">
                <span>{supportCategoryLabel(ticket.category)}</span>
                <span>{workspace?.name ?? ticket.workspaceId}</span>
                <span>{ticket._count.messages} messages</span>
                <span>Assigned: {ticket.assignedTo?.name ?? "Unassigned"}</span>
                <span>Updated {formatDateTime(ticket.lastActivityAt, displayPreferences)}</span>
              </div>
            </Link>
          );
        })}
        {!tickets.length && (
          <div className="empty-state">
            <div className="empty-icon">?</div>
            <h2>No tickets match these filters</h2>
            <p>Clear one or more filters or wait for a customer to submit a new support request.</p>
          </div>
        )}
      </section>
    </div>
  );
}
