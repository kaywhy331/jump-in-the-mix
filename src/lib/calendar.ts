import { prisma } from "@/lib/prisma";
import { applyJourneyEvent } from "@/lib/journey";
import { calendarRange } from "@/lib/calendar-time";
import { parseCalendarFile } from "@/lib/calendar-ical";
import { fetchCalendarFeed } from "@/lib/calendar-feed-fetch";
import { decryptIntegrationCredentials } from "@/lib/integration-crypto";

export async function saveCalendarEntry(input: { workspaceId: string; actorUserId?: string; id?: string; version?: number; title: string; kind: string; contactId?: string; startsAt: Date; endsAt: Date; timezone: string; allowOverlap?: boolean }) {
  calendarRange(input.startsAt, input.endsAt);
  if (!input.title.trim() || input.title.trim().length > 160) throw new Error("Give this event a title of up to 160 characters.");
  if (!["MEETING", "BLOCK"].includes(input.kind)) throw new Error("Choose a meeting or time block.");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${input.workspaceId} FOR NO KEY UPDATE`;
    const existing = input.id ? await tx.calendarEntry.findFirst({ where: { id: input.id, workspaceId: input.workspaceId, connectionId: null, canceledAt: null } }) : null;
    if (input.id && (!existing || existing.version !== input.version)) throw new Error("This event changed. Refresh the calendar before editing it.");
    if (input.contactId && !await tx.contact.findFirst({ where: { id: input.contactId, workspaceId: input.workspaceId, archivedAt: null } })) throw new Error("Choose a contact in this business.");
    const conflict = await tx.calendarEntry.findFirst({ where: { workspaceId: input.workspaceId, canceledAt: null, ...(existing ? { id: { not: existing.id } } : {}), startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } }, orderBy: { startsAt: "asc" } });
    if (conflict && !input.allowOverlap) throw new Error(`This overlaps “${conflict.title}”. Choose another time, or allow an overlap if it is intentional.`);
    const data = { title: input.title.trim(), kind: input.kind, contactId: input.contactId || null, startsAt: input.startsAt, endsAt: input.endsAt, timezone: input.timezone };
    const entry = existing ? await tx.calendarEntry.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } }) : await tx.calendarEntry.create({ data: { ...data, workspaceId: input.workspaceId } });
    if (entry.contactId) {
      await tx.contactActivity.create({ data: { workspaceId: input.workspaceId, contactId: entry.contactId, actorUserId: input.actorUserId, kind: "SYSTEM", visibility: "WORKSPACE", summary: `${existing ? "Updated" : "Scheduled"} ${entry.kind === "MEETING" ? "meeting" : "time block"}: ${entry.title}.`, metadata: { calendarEntryId: entry.id, startsAt: entry.startsAt.toISOString(), endsAt: entry.endsAt.toISOString(), timezone: entry.timezone } } });
      if (entry.kind === "MEETING" && (!existing || existing.contactId !== entry.contactId || existing.kind !== "MEETING")) await applyJourneyEvent(tx, { workspaceId: input.workspaceId, contactId: entry.contactId, actorUserId: input.actorUserId, eventType: "MEETING_SCHEDULED", eventKey: `calendar:${entry.id}:${entry.version}`, source: "Calendar" });
    }
    return entry;
  }, { timeout: 15_000 });
}

export async function importCalendar(workspaceId: string, connectionId: string, body: string, timezone: string, now = new Date()) {
  const entries = parseCalendarFile(body, timezone, now);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
    const connection = await tx.calendarConnection.findFirst({ where: { id: connectionId, workspaceId, enabled: true } });
    if (!connection) throw new Error("This calendar connection is unavailable.");
    await tx.calendarEntry.deleteMany({ where: { workspaceId, connectionId } });
    // Incoming calendars only mark availability. They never create customers or
    // trigger a sale/meeting milestone from an unverified attendee address.
    if (entries.length) await tx.calendarEntry.createMany({ data: entries.map(entry => ({ ...entry, workspaceId, connectionId })) });
    await tx.calendarConnection.update({ where: { id: connectionId }, data: { lastSyncedAt: now, lastAttemptAt: now, lastError: null } });
    return entries.length;
  }, { timeout: 30_000 });
}

export async function syncCalendarConnection(workspaceId: string, id: string, now = new Date()) {
  const connection = await prisma.calendarConnection.findFirst({ where: { workspaceId, id, enabled: true, urlEncrypted: { not: null } } });
  if (!connection?.urlEncrypted) throw new Error("This calendar has no subscription URL.");
  // Claim before fetching, so concurrent workers do not repeatedly fetch a feed.
  const claimed = await prisma.calendarConnection.updateMany({ where: { id, enabled: true, OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(now.getTime() - 60_000) } }] }, data: { lastAttemptAt: now } });
  if (!claimed.count) throw new Error("This calendar was just refreshed. Try again in a minute.");
  try {
    const { url, timezone } = decryptIntegrationCredentials<{ url: string; timezone: string }>(connection.urlEncrypted);
    return await importCalendar(workspaceId, id, await fetchCalendarFeed(url), timezone, now);
  } catch {
    const message = "Could not refresh this calendar. Previous availability is kept. Check the provider’s sharing URL or reconnect.";
    await prisma.calendarConnection.updateMany({ where: { id, workspaceId }, data: { lastError: message } });
    throw new Error(message);
  }
}

export async function runCalendarSync(now = new Date()) {
  const connections = await prisma.calendarConnection.findMany({ where: { enabled: true, urlEncrypted: { not: null }, OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(now.getTime() - 15 * 60_000) } }] }, orderBy: [{ lastAttemptAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 3 });
  for (const connection of connections) { try { await syncCalendarConnection(connection.workspaceId, connection.id, now); } catch { /* Per-connection status is shown in Calendar. */ } }
}
