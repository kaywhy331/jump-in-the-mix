import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Notifications" };

type SearchParams = { readAll?: string };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { user, workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const notifications = await prisma.notificationEvent.findMany({ where: { userId: user.id, workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = notifications.filter((item) => !item.readAt).length;
  return (
    <div className="page notifications-page">
      {query.readAll && <Notice type="success">All notifications marked read.</Notice>}
      <header className="page-header"><div><h1>Notifications</h1><p>Operational, relationship, billing, security, and support updates for {workspace.name}.</p></div>{unread > 0 && <form action={markAllNotificationsReadAction}><button className="button" type="submit">Mark all read</button></form>}</header>
      {notifications.length ? <div className="notification-inbox">{notifications.map((notification) => <article className={`card notification-row ${notification.readAt ? "read" : "unread"}`} key={notification.id}><div><span className="status-pill">{notification.type.replaceAll("_", " ").toLowerCase()}</span><h2>{notification.title}</h2><p>{notification.body}</p><small>{notification.createdAt.toLocaleString()}{notification.deliveryError ? " · Email delivery pending retry" : notification.emailDeliveredAt ? " · Email delivered" : ""}</small></div><div className="page-actions">{notification.href && <Link className="button small primary" href={notification.href}>Open</Link>}{!notification.readAt && <form action={markNotificationReadAction}><input type="hidden" name="notificationId" value={notification.id} /><button className="button small" type="submit">Mark read</button></form>}</div></article>)}</div> : <EmptyState title="No notifications yet" description="Important operational and relationship updates will appear here." actionHref="/jumps" actionLabel="Return to Today" />}
    </div>
  );
}
