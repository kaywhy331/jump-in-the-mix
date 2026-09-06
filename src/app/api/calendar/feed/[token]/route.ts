import { hashConnectionToken } from "@/lib/connection-tokens";
import { createCalendarIcs } from "@/lib/calendar-ical";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response("Calendar unavailable.", { status: 404 });
  const preference = await prisma.calendarPreference.findUnique({ where: { tokenHash: hashConnectionToken(token) } });
  if (!preference) return new Response("Calendar unavailable.", { status: 404 });
  const entries = await prisma.calendarEntry.findMany({ where: { workspaceId: preference.workspaceId, connectionId: null }, orderBy: { startsAt: "asc" } });
  return new Response(createCalendarIcs(entries), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
