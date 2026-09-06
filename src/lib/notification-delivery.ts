import type { NotificationDeliveryKind } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { sendFollowUpPush } from "@/lib/follow-up-push";
import { DEFAULT_PERSONAL_SCHEDULING } from "@/lib/personal-scheduling";
import { formatDateTime } from "@/lib/format";
import {
  addLogicalDays,
  logicalDateInTimezone,
  logicalDateKey,
  zonedDateTimeToUtc
} from "@/lib/jump-schedule";
import { isValidTimezone } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendTransactionalEmail, transactionalEmailConfigured } from "@/lib/transactional-email";

const deliveryLeaseMs = 15 * 60_000;
const maximumDeliveryAttempts = 3;

export type NotificationClock = {
  date: string;
  hour: number;
  minute: number;
  weekday: string;
};

export function notificationClock(value: Date, timeZone: string): NotificationClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  }).formatToParts(value);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === name)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
    minute: Number(part("minute")),
    weekday: part("weekday")
  };
}

export function isQuietTime(minutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function digestIsDue(clock: NotificationClock, digestHour: number): boolean {
  return clock.hour * 60 + clock.minute >= digestHour * 60;
}

export function weeklyReportIsDue(clock: NotificationClock, digestHour: number): boolean {
  return clock.weekday === "Mon" && digestIsDue(clock, digestHour);
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s]+/gi, "[database-url-redacted]")
    .slice(0, 1000);
}

async function claimDelivery(input: {
  workspaceId: string;
  userId: string;
  kind: NotificationDeliveryKind;
  localDate: string;
  workerId: string;
  now: Date;
}): Promise<string | null> {
  try {
    const created = await prisma.notificationDelivery.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        kind: input.kind,
        localDate: input.localDate,
        status: "PENDING",
        attempts: 1,
        lockedAt: input.now,
        lockedBy: input.workerId
      },
      select: { id: true }
    });
    return created.id;
  } catch (error) {
    if (errorCode(error) !== "P2002") throw error;
  }

  const reclaimed = await prisma.notificationDelivery.updateMany({
    where: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      localDate: input.localDate,
      attempts: { lt: maximumDeliveryAttempts },
      OR: [
        { status: "FAILED", lockedAt: null },
        { status: "PENDING", lockedAt: { lt: new Date(input.now.getTime() - deliveryLeaseMs) } }
      ]
    },
    data: {
      status: "PENDING",
      attempts: { increment: 1 },
      lockedAt: input.now,
      lockedBy: input.workerId,
      error: null
    }
  });
  if (reclaimed.count !== 1) return null;
  return (await prisma.notificationDelivery.findUnique({
    where: { workspaceId_kind_localDate: { workspaceId: input.workspaceId, kind: input.kind, localDate: input.localDate } },
    select: { id: true }
  }))?.id ?? null;
}

async function finishDelivery(id: string, workerId: string, result: { skipped?: boolean; providerId?: string | null }): Promise<void> {
  await prisma.notificationDelivery.updateMany({
    where: { id, lockedBy: workerId, status: "PENDING" },
    data: {
      status: result.skipped ? "SKIPPED" : "DELIVERED",
      providerId: result.providerId ?? null,
      deliveredAt: result.skipped ? null : new Date(),
      lockedAt: null,
      lockedBy: null,
      error: null
    }
  });
}

async function failDelivery(id: string, workerId: string, error: unknown): Promise<void> {
  await prisma.notificationDelivery.updateMany({
    where: { id, lockedBy: workerId, status: "PENDING" },
    data: { status: "FAILED", error: safeError(error), lockedAt: null, lockedBy: null }
  });
}

type DueFollowUp = {
  scheduledAt: Date;
  reason: string;
  contact: { displayName: string };
};

function digestMessage(input: {
  ownerName: string;
  company: string;
  due: DueFollowUp[];
  overdueCount: number;
  preferences: { locale: string; timeZone: string };
}) {
  const total = input.due.length;
  const headline = total === 1 ? "1 person to reach today" : `${total} people to reach today`;
  const rows = input.due.slice(0, 10).map((item) => {
    const when = formatDateTime(item.scheduledAt, input.preferences);
    return `${item.contact.displayName} — ${item.reason} (${when})`;
  });
  const more = total > rows.length ? [`Plus ${total - rows.length} more in Today.`] : [];
  const overdue = input.overdueCount ? [`${input.overdueCount} ${input.overdueCount === 1 ? "follow-up is" : "follow-ups are"} overdue.`] : [];
  const text = [
    `Good morning ${input.ownerName},`,
    "",
    `${headline} for ${input.company}.`,
    ...overdue,
    "",
    ...rows.map((row) => `• ${row}`),
    ...more,
    "",
    `Open Today: ${env.appUrl.replace(/\/$/, "")}/jumps`
  ].join("\n");
  const htmlRows = rows.map((row) => `<li>${escapeHtml(row)}</li>`).join("");
  const html = `<p>Good morning ${escapeHtml(input.ownerName)},</p><p><strong>${escapeHtml(headline)}</strong> for ${escapeHtml(input.company)}.</p>${input.overdueCount ? `<p>${input.overdueCount} ${input.overdueCount === 1 ? "follow-up is" : "follow-ups are"} overdue.</p>` : ""}<ul>${htmlRows}</ul>${more.length ? `<p>${escapeHtml(more[0])}</p>` : ""}<p><a href="${escapeHtml(env.appUrl.replace(/\/$/, "") + "/jumps")}">Open Today</a></p>`;
  return { subject: headline, text, html };
}

async function dueFollowUps(workspaceId: string, end: Date, now: Date): Promise<{ items: DueFollowUp[]; overdueCount: number }> {
  const [items, overdueCount] = await Promise.all([
    prisma.jump.findMany({
      where: { workspaceId, status: "PENDING", scheduledAt: { lt: end } },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      select: { scheduledAt: true, reason: true, contact: { select: { displayName: true } } },
      take: 100
    }),
    prisma.jump.count({ where: { workspaceId, status: "PENDING", scheduledAt: { lt: now } } })
  ]);
  return { items, overdueCount };
}

async function sendDigest(input: {
  workspaceId: string;
  userId: string;
  email: string;
  ownerName: string;
  company: string;
  localDate: string;
  end: Date;
  now: Date;
  preferences: { locale: string; timeZone: string };
  workerId: string;
}): Promise<boolean> {
  const deliveryId = await claimDelivery({ ...input, kind: "DAILY_DIGEST" });
  if (!deliveryId) return false;
  try {
    if (!transactionalEmailConfigured()) {
      await finishDelivery(deliveryId, input.workerId, { skipped: true });
      return true;
    }
    const due = await dueFollowUps(input.workspaceId, input.end, input.now);
    if (!due.items.length) {
      await finishDelivery(deliveryId, input.workerId, { skipped: true });
      return true;
    }
    const message = digestMessage({ ...input, due: due.items, overdueCount: due.overdueCount });
    const result = await sendTransactionalEmail({
      to: input.email,
      ...message,
      idempotencyKey: `daily-digest:${input.workspaceId}:${input.localDate}`
    });
    await finishDelivery(deliveryId, input.workerId, { providerId: result.providerId });
    return true;
  } catch (error) {
    await failDelivery(deliveryId, input.workerId, error);
    console.error(`Daily digest failed for workspace ${input.workspaceId}`, safeError(error));
    return false;
  }
}

async function weeklyMetrics(workspaceId: string, start: Date) {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);
  const [completed, connected, activeContacts, recentJumps, recentActivities, reviewClicks, referralCounts] = await Promise.all([
    prisma.jump.count({ where: { workspaceId, status: "DONE", completedAt: { gte: start } } }),
    prisma.contactActivity.count({ where: { workspaceId, outcome: "CONNECTED", occurredAt: { gte: start } } }),
    prisma.contact.count({ where: { workspaceId, archivedAt: null } }),
    prisma.jump.findMany({ where: { workspaceId, status: "DONE", completedAt: { gte: sixtyDaysAgo } }, distinct: ["contactId"], select: { contactId: true } }),
    prisma.contactActivity.findMany({ where: { workspaceId, occurredAt: { gte: sixtyDaysAgo } }, distinct: ["contactId"], select: { contactId: true } }),
    prisma.reviewRequest.count({ where: { workspaceId, reviewClickedAt: { gte: start } } }),
    prisma.contact.groupBy({ where: { workspaceId, referredByContactId: { not: null } }, by: ["referredByContactId"], _count: { _all: true }, orderBy: { _count: { referredByContactId: "desc" } }, take: 1 })
  ]);
  const touched = new Set([...recentJumps, ...recentActivities].map((item) => item.contactId));
  const best = referralCounts[0];
  const topReferrer = best?.referredByContactId
    ? await prisma.contact.findFirst({ where: { id: best.referredByContactId, workspaceId }, select: { displayName: true } })
    : null;
  return {
    completed,
    connected,
    quiet: Math.max(0, activeContacts - touched.size),
    reviewClicks,
    topReferrer: topReferrer ? `${topReferrer.displayName} (${best._count._all})` : "No referrals recorded yet"
  };
}

async function sendWeeklyReport(input: {
  workspaceId: string;
  userId: string;
  email: string;
  ownerName: string;
  company: string;
  localDate: string;
  start: Date;
  workerId: string;
}): Promise<boolean> {
  const deliveryId = await claimDelivery({ ...input, kind: "WEEKLY_REPORT", now: new Date() });
  if (!deliveryId) return false;
  try {
    if (!transactionalEmailConfigured()) {
      await finishDelivery(deliveryId, input.workerId, { skipped: true });
      return true;
    }
    const metrics = await weeklyMetrics(input.workspaceId, input.start);
    const lines = [
      `${metrics.completed} follow-ups completed`,
      `${metrics.connected} conversations connected`,
      `${metrics.quiet} customers quiet for 60+ days`,
      `${metrics.reviewClicks} review-link visits`,
      `Top referrer: ${metrics.topReferrer}`
    ];
    const text = [`Hi ${input.ownerName},`, "", `Here’s last week at ${input.company}:`, ...lines.map((line) => `• ${line}`), "", `Open Today: ${env.appUrl.replace(/\/$/, "")}/jumps`].join("\n");
    const html = `<p>Hi ${escapeHtml(input.ownerName)},</p><p>Here’s last week at ${escapeHtml(input.company)}:</p><ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul><p><a href="${escapeHtml(env.appUrl.replace(/\/$/, "") + "/jumps")}">Open Today</a></p>`;
    const result = await sendTransactionalEmail({ to: input.email, subject: `Your week at ${input.company}`, text, html, idempotencyKey: `weekly-report:${input.workspaceId}:${input.localDate}` });
    await finishDelivery(deliveryId, input.workerId, { providerId: result.providerId });
    return true;
  } catch (error) {
    await failDelivery(deliveryId, input.workerId, error);
    console.error(`Weekly report failed for workspace ${input.workspaceId}`, safeError(error));
    return false;
  }
}

export async function runScheduledNotifications(workerId: string, now = new Date()): Promise<{ attempted: number }> {
  const notificationPreferences = await prisma.notificationPreference.findMany({
    where: { OR: [{ emailDigestEnabled: true }, { pushEnabled: true }, { weeklyReportEnabled: true }] }
  });
  if (!notificationPreferences.length) return { attempted: 0 };
  const workspaceIds = notificationPreferences.map((item) => item.workspaceId);
  const userIds = notificationPreferences.map((item) => item.userId);
  const [workspaces, userPreferences, schedulingPreferences] = await Promise.all([
    prisma.workspace.findMany({ where: { id: { in: workspaceIds } }, select: { id: true, name: true, owner: { select: { id: true, name: true, email: true } }, profile: { select: { company: true } } } }),
    prisma.userPreference.findMany({ where: { userId: { in: userIds } } }),
    prisma.workspacePreference.findMany({ where: { workspaceId: { in: workspaceIds } } })
  ]);
  const workspaceById = new Map(workspaces.map((item) => [item.id, item]));
  const displayByUser = new Map(userPreferences.map((item) => [item.userId, item]));
  const schedulingByWorkspace = new Map(schedulingPreferences.map((item) => [item.workspaceId, item]));
  let attempted = 0;

  for (const preference of notificationPreferences) {
    const workspace = workspaceById.get(preference.workspaceId);
    if (!workspace) continue;
    const display = displayByUser.get(preference.userId);
    const timeZone = isValidTimezone(display?.timezone ?? "") ? display!.timezone : "UTC";
    let clock: NotificationClock;
    try { clock = notificationClock(now, timeZone); } catch { clock = notificationClock(now, "UTC"); }
    const effectiveDisplay = { locale: display?.locale || "en-US", timeZone };
    const logicalToday = logicalDateInTimezone(now, effectiveDisplay.timeZone);
    const start = zonedDateTimeToUtc(logicalToday, 0, effectiveDisplay.timeZone);
    const end = zonedDateTimeToUtc(addLogicalDays(logicalToday, 1), 0, effectiveDisplay.timeZone);
    const company = workspace.profile?.company || workspace.name;
    const common = { workspaceId: workspace.id, userId: preference.userId, email: workspace.owner.email, ownerName: workspace.owner.name, company, localDate: logicalDateKey(logicalToday), workerId };

    if (preference.emailDigestEnabled && digestIsDue(clock, preference.digestHour)) {
      if (await sendDigest({ ...common, end, now, preferences: effectiveDisplay })) attempted += 1;
    }
    if (preference.weeklyReportEnabled && weeklyReportIsDue(clock, preference.digestHour)) {
      if (await sendWeeklyReport({ ...common, start: zonedDateTimeToUtc(addLogicalDays(logicalToday, -7), 0, effectiveDisplay.timeZone) })) attempted += 1;
    }
    const scheduling = schedulingByWorkspace.get(workspace.id) ?? DEFAULT_PERSONAL_SCHEDULING;
    const localMinutes = clock.hour * 60 + clock.minute;
    const quiet = isQuietTime(localMinutes, scheduling.quietHoursStart, scheduling.quietHoursEnd);
    if (preference.pushEnabled && !quiet) {
      attempted += await sendFollowUpPush({ workspaceId: workspace.id, userId: preference.userId, now });
    }
  }
  return { attempted };
}
