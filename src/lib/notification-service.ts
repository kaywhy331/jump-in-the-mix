import { randomUUID } from "node:crypto";
import type { NotificationPreference } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { addLogicalDays, logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendTransactionalEmail } from "@/lib/transactional-email";

export type NotificationPreferenceFlag =
  | "overdueReminders"
  | "upcomingDates"
  | "integrationFailures"
  | "importComplete"
  | "supportReplies"
  | "billingAlerts"
  | "securityAlerts";

export async function enqueueUserNotification(input: {
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
  type: string;
  title: string;
  body: string;
  href?: string | null;
  preferenceFlag?: NotificationPreferenceFlag;
}) {
  const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, select: { id: true } });
  if (!membership) return null;
  const preference = await prisma.notificationPreference.findUnique({ where: { userId_workspaceId: { userId: input.userId, workspaceId: input.workspaceId } } });
  if (input.preferenceFlag && preference && !preference[input.preferenceFlag]) return null;
  if (preference && !preference.inAppEnabled && !preference.emailEnabled) return null;
  const event = await prisma.notificationEvent.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: { id: randomUUID(), workspaceId: input.workspaceId, userId: input.userId, idempotencyKey: input.idempotencyKey, type: input.type, title: input.title.slice(0, 200), body: input.body.slice(0, 2000), href: input.href?.slice(0, 500) ?? null },
    update: {}
  });
  const queued = await prisma.job.findFirst({ where: { workspaceId: input.workspaceId, task: "notification-delivery", payload: { path: ["eventId"], equals: event.id }, completedAt: null, failedAt: null }, select: { id: true } });
  if (!queued) await prisma.job.create({ data: { workspaceId: input.workspaceId, task: "notification-delivery", payload: { eventId: event.id }, maxAttempts: 8 } });
  return event;
}

export async function notifyWorkspaceMembers(input: {
  workspaceId: string;
  idempotencyKey: string;
  type: string;
  title: string;
  body: string;
  href?: string | null;
  preferenceFlag: NotificationPreferenceFlag;
  roles?: Array<"OWNER" | "ADMIN" | "MEMBER">;
}) {
  const memberships = await prisma.workspaceMember.findMany({ where: { workspaceId: input.workspaceId, ...(input.roles?.length ? { role: { in: input.roles } } : {}) }, select: { userId: true } });
  await Promise.all(memberships.map((membership) => enqueueUserNotification({
    workspaceId: input.workspaceId,
    userId: membership.userId,
    idempotencyKey: `${input.idempotencyKey}:${membership.userId}`,
    type: input.type,
    title: input.title,
    body: input.body,
    href: input.href,
    preferenceFlag: input.preferenceFlag
  })));
}

export async function deliverNotificationEvent(eventId: string): Promise<void> {
  const event = await prisma.notificationEvent.findUnique({ where: { id: eventId } });
  if (!event || event.emailDeliveredAt) return;
  const [preference, user, workspace] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId_workspaceId: { userId: event.userId, workspaceId: event.workspaceId } } }),
    prisma.user.findUnique({ where: { id: event.userId }, select: { email: true, name: true } }),
    prisma.workspace.findUnique({ where: { id: event.workspaceId }, select: { name: true } })
  ]);
  if (!user || !workspace || preference?.emailEnabled === false) return;
  try {
    await sendTransactionalEmail({
      to: user.email,
      subject: event.title,
      text: `${event.body}${event.href ? `\n\n${new URL(event.href, env.appUrl).toString()}` : ""}`,
      html: `<p>${escapeHtml(event.body)}</p>${event.href ? `<p><a href="${escapeHtml(new URL(event.href, env.appUrl).toString())}">Open Jump in the Mix</a></p>` : ""}<p><small>${escapeHtml(workspace.name)}</small></p>`,
      idempotencyKey: `notification-${event.id}`
    });
    await prisma.notificationEvent.updateMany({ where: { id: event.id, emailDeliveredAt: null }, data: { emailDeliveredAt: new Date(), deliveryError: null } });
  } catch (error) {
    await prisma.notificationEvent.updateMany({ where: { id: event.id, emailDeliveredAt: null }, data: { deliveryError: error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed." } });
    throw error;
  }
}

function localClock(now: Date, timezone: string): { dateKey: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { dateKey: `${values.year}-${String(values.month).padStart(2, "0")}-${String(values.day).padStart(2, "0")}`, minute: values.hour * 60 + values.minute };
}

function digestDue(preference: NotificationPreference, timezone: string, now: Date): boolean {
  const current = localClock(now, timezone);
  if (current.minute < preference.digestMinutes || current.minute >= preference.digestMinutes + 10) return false;
  if (!preference.lastDigestAt) return true;
  return localClock(preference.lastDigestAt, timezone).dateKey !== current.dateKey;
}

export async function enqueueDueDailyDigests(now = new Date()): Promise<number> {
  const preferences = await prisma.notificationPreference.findMany({ where: { dailyDigest: true, OR: [{ emailEnabled: true }, { inAppEnabled: true }] }, take: 500 });
  let queued = 0;
  for (const preference of preferences) {
    const [workspace, userPreference] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: preference.workspaceId }, include: { profile: true } }),
      prisma.userPreference.findUnique({ where: { userId: preference.userId }, select: { timezone: true } })
    ]);
    if (!workspace) continue;
    const timezone = userPreference?.timezone || workspace.profile?.timezone || "UTC";
    if (!digestDue(preference, timezone, now)) continue;
    const today = logicalDateInTimezone(now, timezone);
    const start = zonedDateTimeToUtc(today, 0, timezone);
    const end = zonedDateTimeToUtc(addLogicalDays(today, 1), 0, timezone);
    const weekEnd = zonedDateTimeToUtc(addLogicalDays(today, 7), 0, timezone);
    const [due, overdue, upcomingDates] = await Promise.all([
      prisma.jump.count({ where: { workspaceId: preference.workspaceId, status: { in: ["PENDING", "COPIED"] }, scheduledAt: { gte: start, lt: end } } }),
      prisma.jump.count({ where: { workspaceId: preference.workspaceId, status: { in: ["PENDING", "COPIED"] }, scheduledAt: { lt: start } } }),
      prisma.jumpDate.count({ where: { workspaceId: preference.workspaceId, isActive: true, jumps: { some: { scheduledAt: { gte: start, lt: weekEnd }, status: { in: ["PENDING", "COPIED"] } } } } })
    ]);
    const dateKey = logicalDateKey(today);
    await enqueueUserNotification({
      workspaceId: preference.workspaceId,
      userId: preference.userId,
      idempotencyKey: `daily-digest:${preference.id}:${dateKey}`,
      type: "DAILY_DIGEST",
      title: `${due + overdue} relationship action${due + overdue === 1 ? "" : "s"} need attention`,
      body: `${overdue} overdue, ${due} due today, and ${upcomingDates} upcoming Important Date${upcomingDates === 1 ? "" : "s"} represented in the next seven days.`,
      href: "/jumps?range=due&status=pending"
    });
    await prisma.notificationPreference.update({ where: { id: preference.id }, data: { lastDigestAt: now } });
    queued += 1;
  }
  return queued;
}
