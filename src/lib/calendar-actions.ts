"use server";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCalendarTime } from "@/lib/calendar-time";
import { importCalendar, saveCalendarEntry, syncCalendarConnection } from "@/lib/calendar";
import { calendarFeedUrl } from "@/lib/calendar-feed-fetch";
import { encryptIntegrationCredentials } from "@/lib/integration-crypto";
import { createConnectionToken } from "@/lib/connection-tokens";
import { isValidTimezone } from "@/lib/mix-broadcast";

const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
async function context() { const ctx = await requireWorkspace(); if (ctx.impersonation) throw new Error("Support sessions are view-only."); return ctx; }
export async function saveCalendarAction(_state: { error: string }, data: FormData): Promise<{ error: string }> {
  const { workspace, user } = await context(); const timezone = value(data, "timezone");
  try {
    await saveCalendarEntry({ workspaceId: workspace.id, actorUserId: user.id, id: value(data, "id") || undefined, version: Number(value(data, "version")), title: value(data, "title"), kind: value(data, "kind"), contactId: value(data, "contactId"), startsAt: parseCalendarTime(value(data, "startsAt"), timezone), endsAt: parseCalendarTime(value(data, "endsAt"), timezone), timezone, allowOverlap: data.get("allowOverlap") === "on" });
  } catch (error) { return { error: error instanceof Error ? error.message : "This event could not be saved." }; }
  redirect(`/calendar?date=${encodeURIComponent(value(data, "startsAt").slice(0, 10))}&saved=1`);
}

export async function cancelCalendarAction(data: FormData) {
  const { workspace, user } = await context();
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR NO KEY UPDATE`;
    const entry = await tx.calendarEntry.findFirst({ where: { id: value(data, "id"), workspaceId: workspace.id, connectionId: null, canceledAt: null, version: Number(value(data, "version")) } });
    if (!entry) return;
    await tx.calendarEntry.update({ where: { id: entry.id }, data: { canceledAt: new Date(), version: { increment: 1 } } });
    if (entry.contactId) await tx.contactActivity.create({ data: { workspaceId: workspace.id, contactId: entry.contactId, actorUserId: user.id, kind: "SYSTEM", visibility: "WORKSPACE", summary: `Canceled calendar event: ${entry.title}. The customer’s stage was kept.`, metadata: { calendarEntryId: entry.id } } });
  });
  redirect("/calendar?saved=1");
}

export async function calendarConnectionAction(data: FormData) {
  const { workspace } = await context(); const intent = value(data, "intent"), id = value(data, "id");
  try {
    if (intent === "rotate" || intent === "subscribe") await prisma.calendarPreference.upsert({ where: { workspaceId: workspace.id }, create: { workspaceId: workspace.id, ...createConnectionToken() }, update: createConnectionToken() });
    else if (intent === "revoke") await prisma.calendarPreference.deleteMany({ where: { workspaceId: workspace.id } });
    else if (intent === "disconnect") await prisma.calendarConnection.deleteMany({ where: { id, workspaceId: workspace.id } });
    else if (intent === "sync") await syncCalendarConnection(workspace.id, id);
    else {
      const name = value(data, "name"), timezone = value(data, "timezone");
      if (!name || name.length > 100) throw new Error("Give this calendar a name of up to 100 characters.");
      if (!timezone || !isValidTimezone(timezone)) throw new Error("Choose a valid timezone.");
      if (await prisma.calendarConnection.count({ where: { workspaceId: workspace.id } }) >= 20) throw new Error("Connect up to 20 calendars. Disconnect one before adding another.");
      if (intent === "connect") {
        const url = calendarFeedUrl(value(data, "url")).href;
        const connection = await prisma.calendarConnection.create({ data: { workspaceId: workspace.id, name, urlEncrypted: encryptIntegrationCredentials({ url, timezone }) } });
        await syncCalendarConnection(workspace.id, connection.id);
      } else if (intent === "import") {
        const file = data.get("file");
        if (!(file instanceof File) || !file.size || file.size > 900_000) throw new Error("Choose an .ics file of up to 900 KB.");
        const connection = await prisma.calendarConnection.create({ data: { workspaceId: workspace.id, name } });
        try { await importCalendar(workspace.id, connection.id, await file.text(), timezone); }
        catch (error) { await prisma.calendarConnection.delete({ where: { id: connection.id } }); throw error; }
      } else throw new Error("Choose a calendar action.");
    }
  } catch (error) { redirect(`/calendar?error=${encodeURIComponent(error instanceof Error ? error.message : "The calendar could not be updated.")}#calendar-connections`); }
  redirect("/calendar?saved=1#calendar-connections");
}
