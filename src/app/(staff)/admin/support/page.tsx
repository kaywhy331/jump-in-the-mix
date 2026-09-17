import { AdminPagination } from "@/components/AdminPagination";
import { adminPage, adminQuery } from "@/lib/admin-navigation";
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
  supportPriorityLabel,
  adminSupportStatusLabel,
  type SupportCategoryValue,
  type SupportPriorityValue,
  type SupportStatusValue
} from "@/lib/support-content";

export const metadata: Metadata = { title: "Admin · Support" };

type SearchParams = {
  page?: string;
  view?: string;
  q?: string;
  email?: string;
  error?: string;
  impersonationEnded?: string;
  status?: string;
  category?: string;
  priority?: string;
};

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { user, permissions }] = await Promise.all([searchParams, requirePlatformAdmin("support.manage")]);
  const displayPreferences = await displayPreferencesForUser(user.id);
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const view = ["mine", "unassigned", "waiting", "all"].includes(params.view ?? "") ? params.view! : params.email === "review" ? "all" : "attention";
  const statusValue = params.status ?? (view === "waiting" ? "WAITING_ON_USER" : view === "all" ? "all" : "attention");
  const categoryValue = params.category ?? "";
  const priorityValue = params.priority ?? "";
  const status: SupportStatusValue | "all" | "attention" = isSupportStatus(statusValue) ? statusValue : statusValue === "attention" ? "attention" : "all";
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
    ...(view === "mine" ? { assignedToUserId: user.id } : view === "unassigned" ? { assignedToUserId: null } : {}),
    ...(params.email === "review" ? { messages: { some: { authorType: "ADMIN", emailStatus: "FAILED" } } } : {}),
    ...(status === "attention" ? { status: { in: ["OPEN", "WAITING_ON_SUPPORT"] } } : status !== "all" ? { status } : {}),
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

  const total = await prisma.supportTicket.count({ where });
  const page = Math.min(adminPage(params.page), Math.max(1, Math.ceil(total / 25)));
  const queueHref = (nextPage = page, nextView = view) => adminQuery("/admin/support", { q: query, status: statusValue, category: categoryValue, priority: priorityValue, email: params.email, view: nextView, page: nextPage });
  const returnTo = queueHref();
  const [tickets, openCount, waitingCount, urgentCount, failedEmailCount] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        assignedTo: { select: { name: true } }
      },
      orderBy: [{ priority: "desc" }, { lastActivityAt: "asc" }, { id: "asc" }],
      take: 25, skip: (page - 1) * 25
    }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "WAITING_ON_SUPPORT"] } } }),
    prisma.supportTicket.count({ where: { status: "WAITING_ON_USER" } }),
    prisma.supportTicket.count({ where: { priority: "URGENT", status: { not: "CLOSED" } } }),
    prisma.supportTicketMessage.count({ where: { authorType: "ADMIN", emailStatus: "FAILED" } })
  ]);

  const requesterIds = [...new Set(tickets.map((ticket) => ticket.requesterUserId))];
  const requesters = requesterIds.length
    ? await prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } })
    : [];
  const requesterById = new Map(requesters.map(item => [item.id, item]));

  return (
    <div className="page admin-support-page">
      <header className="page-header">
        <div>
          <h1>Support</h1>

        </div>
        <div className="page-actions">
          {permissions.includes("users.read") && <Link className="button" href="/admin/users">Customers</Link>}

        </div>
      </header>

      {params.error && <Notice type="error">{params.error}</Notice>}
      {params.impersonationEnded && <Notice type="success">The view-only support session has ended.</Notice>}
      <section className="stats-grid admin-support-stats">
        <article className="stat-card"><small>Waiting on support</small><strong>{openCount}</strong></article>
        <article className="stat-card"><small>Waiting on customer</small><strong>{waitingCount}</strong></article>
        <article className="stat-card"><small>Urgent, not closed</small><strong>{urgentCount}</strong></article>
        <Link className="stat-card" href="/admin/support?email=review&view=all"><small>Email needs review</small><strong>{failedEmailCount}</strong></Link>
      </section>

      <nav className="admin-content-tabs" aria-label="Support views">{[["attention", "Needs reply"], ["mine", "Mine"], ["unassigned", "Unassigned"], ["waiting", "Waiting on customer"], ["all", "All"]].map(([key, label]) => <Link key={key} href={adminQuery("/admin/support", { view: key, q: query })} aria-current={view === key ? "page" : undefined}>{label}</Link>)}</nav>
      <form className="admin-filter-toolbar live-search-form" method="get">
        <input type="hidden" name="view" value={view} />
        <label className="field"><span>Search tickets</span><input type="search" name="q" defaultValue={query} placeholder="Name, email, reference or workspace" /></label>
        <label className="field"><span>Priority</span><select name="priority" defaultValue={priority}><option value="all">All priorities</option>{SUPPORT_PRIORITIES.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <button className="button primary" type="submit">Apply filters</button><Link className="button" href="/admin/support">Clear</Link>
        <details className="admin-filter-options" open={Boolean(params.category && params.category !== "all" || params.email === "review" || params.status && params.status !== "attention" && params.status !== "all")}><summary>More filters{category !== "all" || params.email === "review" ? " · active" : ""}</summary><div>
          <label className="field"><span>Status</span><select name="status" defaultValue={status}><option value="all">All statuses</option><option value="attention">Needs a reply</option>{SUPPORT_STATUSES.map(item => <option value={item.value} key={item.value}>{adminSupportStatusLabel(item.value)}</option>)}</select></label>
          <label className="field"><span>Category</span><select name="category" defaultValue={category}><option value="all">All categories</option>{SUPPORT_CATEGORIES.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
          <label className="field"><span>Email notifications</span><select name="email" defaultValue={params.email === "review" ? "review" : "all"}><option value="all">All tickets</option><option value="review">Needs review</option></select></label>
        </div></details>
      </form>

      <p className="admin-result-summary" role="status">{total} tickets · priority, then oldest first</p>
      <section className="support-admin-ticket-list" role="region" aria-label="Support tickets" tabIndex={0}>
        {tickets.map((ticket) => {
          const requester = requesterById.get(ticket.requesterUserId);
          return (
            <Link prefetch={false} className={`card support-admin-ticket priority-${ticket.priority.toLowerCase()}`} href={adminQuery(`/admin/support/${ticket.id}`, { returnTo })} key={ticket.id}>
              <div><h2>{ticket.title}</h2><p><span className="support-ticket-reference">{ticket.reference}</span>{requester?.name ?? "Unknown requester"} · {requester?.email ?? ticket.requesterUserId}</p></div>
              <div className="support-admin-ticket-badges"><span className={`status-pill ${ticket.status === "RESOLVED" ? "done" : ""}`}>{adminSupportStatusLabel(ticket.status)}</span>{ticket.priority !== "NORMAL" && <span className={`status-pill priority-${ticket.priority.toLowerCase()}`}>{supportPriorityLabel(ticket.priority)}</span>}</div>
              <div className="admin-ticket-age"><span>{ticket.assignedTo?.name ?? "Unassigned"}</span><time dateTime={ticket.lastActivityAt.toISOString()} title={formatDateTime(ticket.lastActivityAt, displayPreferences)}>{Math.floor((Date.now() - ticket.lastActivityAt.getTime()) / 86_400_000) >= 1 ? `${Math.floor((Date.now() - ticket.lastActivityAt.getTime()) / 86_400_000)}d` : `${Math.max(0, Math.floor((Date.now() - ticket.lastActivityAt.getTime()) / 3_600_000))}h`} since activity</time></div>
            </Link>
          );
        })}
        {!tickets.length && (
          <div className="empty-state">
            <div className="empty-icon">?</div>
            <h2>No tickets match these filters</h2>
            <p>Try fewer filters.</p>
          </div>
        )}
      </section>
      <AdminPagination page={page} total={total} pageSize={25} href={queueHref} />
    </div>
  );
}
