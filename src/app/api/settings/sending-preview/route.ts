import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { automaticEmailConfigured, automaticSmsConfigured, preparedDelivery } from "@/lib/automatic-delivery";
import { automaticSendWindow, type AutomaticSendingRule } from "@/lib/automatic-delivery-window";
import { timezoneForWorkspace } from "@/lib/display-preferences";
import { readJourneyPreferences } from "@/lib/journey-preferences";
import type { Channel, Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 25;
// Appointments are read well past the 24-hour horizon so a time pushed over a weekend still avoids them.
const APPOINTMENT_LOOKAHEAD_MS = 8 * 24 * 3600_000;
const APPOINTMENT_LOOKBACK_MS = 240 * 60_000;

type HoldRow = { manualOnly: boolean; appointmentBindingId: string | null; mix: { status: string }; workflowInstance: { status: string; state: Prisma.JsonValue } | null };

/** The holds the worker applies before sending that the query cannot express, in the order it checks them. */
function holdReason(row: HoldRow, stop: { reason: string | null } | undefined): string | null {
  if (row.mix.status !== "ACTIVE") return row.mix.status === "PAUSED" ? "Its Mix is paused" : row.mix.status === "ARCHIVED" ? "Its Mix is archived" : "Its Mix is not active";
  if (row.manualOnly) return "Quick Add capture waits for you";
  // A Journey stage exit stops the Mix for the person, but a follow-up bound to an appointment still goes out.
  if (stop && !(row.appointmentBindingId && stop.reason === "journey.stage.exit")) return "Stopped for this person";
  if (row.workflowInstance) {
    if (row.workflowInstance.status !== "ACTIVE") return "Its path is paused or finished";
    if ((row.workflowInstance.state as { pendingBusinessUpdate?: unknown }).pendingBusinessUpdate) return "Waiting for an already-processing message";
  }
  return null;
}

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
  // The worker's candidate query, minus the holds listed below with a reason.
  const where: Prisma.JumpWhereInput = { workspaceId, status: "PENDING", accessInviteId: null, scheduledAt: { lte: latestBase }, createdAt: { lte: latestBase }, drafts: { none: {} }, contact: { archivedAt: null, OR: [{ relationshipState: null }, { relationshipState: { doNotContact: false } }] }, stepVersion: { stepTemplate: { channel: { in: channels } } }, AND: [{ OR: [{ appointmentBindingId: null }, { appointmentBinding: { automaticDelivery: true } }] }, { OR: [{ selectedFamily: null }, { selectedFamily: "EMAIL", stepVersion: { stepTemplate: { channel: "EMAIL" } } }, { selectedFamily: "TEXT", stepVersion: { stepTemplate: { channel: "SMS" } } }] }] };
  const count = await prisma.jump.count({ where }); const pages = Math.max(1, Math.ceil(count / PAGE_SIZE)); const page = Math.min(pages, Math.max(1, Number.parseInt(query.get("page") ?? "1", 10) || 1));
  const [rows, scheduling, timezone] = await Promise.all([
    prisma.jump.findMany({ where, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE, select: { id: true, renderedSnapshot: true, scheduledAt: true, createdAt: true, reason: true, manualOnly: true, mixId: true, contactId: true, appointmentBindingId: true, mix: { select: { status: true } }, workflowInstance: { select: { status: true, state: true } }, contact: { select: { displayName: true, emails: { select: { email: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 }, phones: { select: { phone: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } } }, stepVersion: { select: { stepTemplate: { select: { channel: true } } } } } }),
    prisma.workspacePreference.findUnique({ where: { workspaceId } }), timezoneForWorkspace(workspaceId)
  ]);
  const avoidAppointments = Boolean(scheduling && readJourneyPreferences(scheduling.journeyPreferences)?.avoidAppointments);
  const [attempted, stops, appointmentGaps] = await Promise.all([
    prisma.automatedDelivery.findMany({ where: { workspaceId, jumpId: { in: rows.map(row => row.id) } }, select: { jumpId: true } }).then(list => new Set(list.map(row => row.jumpId))),
    rows.length ? prisma.mixStop.findMany({ where: { workspaceId, OR: rows.map(row => ({ mixId: row.mixId, contactId: row.contactId })) }, select: { mixId: true, contactId: true, reason: true } }) : [],
    avoidAppointments ? prisma.calendarEntry.findMany({ where: { workspaceId, canceledAt: null, startsAt: { lte: new Date(now.getTime() + APPOINTMENT_LOOKAHEAD_MS) }, endsAt: { gte: new Date(now.getTime() - APPOINTMENT_LOOKBACK_MS) } }, select: { startsAt: true, endsAt: true, kind: true }, orderBy: { startsAt: "asc" }, take: 200 }) : []
  ]);
  // The earliest time is the worker's own rule: review window, quiet hours, working hours and appointments.
  const rule: AutomaticSendingRule = { timezone, quietHours: scheduling ? { start: scheduling.quietHoursStart, end: scheduling.quietHoursEnd } : null, workingHours: scheduling, appointmentGaps };
  const items = rows.map(row => {
    const channel = row.stepVersion.stepTemplate.channel; const recipient = channel === "EMAIL" ? row.contact.emails[0]?.email : row.contact.phones[0]?.phone;
    const window = automaticSendWindow({ ...rule, scheduledAt: row.scheduledAt, createdAt: row.createdAt, reviewWindowMinutes: minutes, now });
    const stop = stops.find(item => item.mixId === row.mixId && item.contactId === row.contactId);
    const blockedReason = holdReason(row, stop)
      ?? (attempted.has(row.id) ? "An earlier delivery attempt is recorded. Review its status; this message will not be sent again automatically." : !recipient ? "Missing recipient" : !preparedDelivery(row.renderedSnapshot, channel) ? "Prepared message is missing or incomplete" : channel === "EMAIL" ? (!automaticEmailConfigured() ? "Automatic email is unavailable" : null) : (!automaticSmsConfigured() ? "Automatic text is unavailable" : null))
      ?? (!window.opensAt ? "No time inside your working hours was found" : null);
    return { blockedReason, id: row.id, name: row.contact.displayName, reason: row.reason, channel, recipient: recipient ?? null, earliestAt: blockedReason || !window.opensAt ? null : window.opensAt.toISOString() };
  });
  return NextResponse.json({ items, count, page, pages, timezone, observedAt: now.toISOString() }, { headers });
}
