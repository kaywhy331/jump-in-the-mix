import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { automaticDeliveryEligibleAt, automaticEmailConfigured, automaticSmsConfigured, preparedDelivery } from "@/lib/automatic-delivery";
import { timezoneForWorkspace } from "@/lib/display-preferences";
import { notificationClock, isQuietTime } from "@/lib/notification-delivery";
import { addLogicalDays, logicalDateInTimezone, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import type { Channel, Prisma } from "@/generated/prisma/client";
export async function GET(request: Request) {
  const session = await getCurrentSession(); const workspaceId = session?.user.memberships[0]?.workspaceId;
  const headers = { "Cache-Control": "private, no-store" };
  if (!workspaceId) return NextResponse.json({ error: "Sign in again to review sending." }, { status: 401, headers });
  const query = new URL(request.url).searchParams;
  const minutes = Number(query.get("minutes"));
  if (![15, 30, 60, 240, 1440].includes(minutes)) return NextResponse.json({ error: "Choose a listed review window." }, { status: 400, headers });
  const channels: Channel[] = [...(query.get("email") === "1" ? ["EMAIL" as const] : []), ...(query.get("sms") === "1" ? ["SMS" as const] : [])];
  const now = new Date(); const horizon = new Date(now.getTime() + 24 * 3600_000);
  const latestBase = new Date(horizon.getTime() - minutes * 60_000);
  const where: Prisma.JumpWhereInput = { workspaceId, status: "PENDING", accessInviteId: null, scheduledAt: { lte: latestBase }, createdAt: { lte: latestBase }, drafts: { none: {} }, contact: { archivedAt: null, OR: [{ relationshipState: null }, { relationshipState: { doNotContact: false } }] }, stepVersion: { stepTemplate: { channel: { in: channels } } }, AND: [{ OR: [{ appointmentBindingId: null }, { appointmentBinding: { automaticDelivery: true } }] }, { OR: [{ selectedFamily: null }, { selectedFamily: "EMAIL", stepVersion: { stepTemplate: { channel: "EMAIL" } } }, { selectedFamily: "TEXT", stepVersion: { stepTemplate: { channel: "SMS" } } }] }] };
  const count = await prisma.jump.count({ where }); const pages = Math.max(1, Math.ceil(count / 25)); const page = Math.min(pages, Math.max(1, Number.parseInt(query.get("page") ?? "1", 10) || 1));
  const [rows, scheduling, timezone] = await Promise.all([
    prisma.jump.findMany({ where, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 25, skip: (page - 1) * 25, select: { id: true, renderedSnapshot: true, scheduledAt: true, createdAt: true, reason: true, contact: { select: { displayName: true, emails: { select: { email: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 }, phones: { select: { phone: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } } }, stepVersion: { select: { stepTemplate: { select: { channel: true } } } } } }),
    prisma.workspacePreference.findUnique({ where: { workspaceId } }), timezoneForWorkspace(workspaceId)
  ]);
  const attempted = new Set((await prisma.automatedDelivery.findMany({ where: { workspaceId, jumpId: { in: rows.map(row => row.id) } }, select: { jumpId: true } })).map(row => row.jumpId));
  const items = rows.map(row => {
    let eligible = new Date(Math.max(now.getTime(), automaticDeliveryEligibleAt(row.scheduledAt, row.createdAt, minutes).getTime()));
    if (scheduling) { const clock = notificationClock(eligible, timezone); const time = clock.hour * 60 + clock.minute;
      if (isQuietTime(time, scheduling.quietHoursStart, scheduling.quietHoursEnd)) { let day = logicalDateInTimezone(eligible, timezone); if (scheduling.quietHoursStart > scheduling.quietHoursEnd && time >= scheduling.quietHoursStart) day = addLogicalDays(day, 1); eligible = zonedDateTimeToUtc(day, scheduling.quietHoursEnd, timezone); }
    }
    const channel = row.stepVersion.stepTemplate.channel; const recipient = channel === "EMAIL" ? row.contact.emails[0]?.email : row.contact.phones[0]?.phone;
    const blockedReason = attempted.has(row.id) ? "An earlier delivery attempt is recorded. Review its status; this message will not be sent again automatically." : !recipient ? "Missing recipient" : !preparedDelivery(row.renderedSnapshot, channel) ? "Prepared message is missing or incomplete" : channel === "EMAIL" ? (!automaticEmailConfigured() ? "Automatic email is unavailable" : null) : (!automaticSmsConfigured() ? "Automatic text is unavailable" : null);
    return { blockedReason, id: row.id, name: row.contact.displayName, reason: row.reason, channel, recipient: recipient ?? null, earliestAt: blockedReason ? null : eligible.toISOString() };
  });
  return NextResponse.json({ items, count, page, pages, timezone, observedAt: now.toISOString() }, { headers });
}
