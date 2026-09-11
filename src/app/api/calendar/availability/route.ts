import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { normalizeBufferMinutes } from "@/lib/calendar-availability";
import { localCalendarTime } from "@/lib/calendar-time";
import { addLogicalDays, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { isValidTimezone } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { parseDateKey } from "@/lib/when-picker";

export type CalendarAvailabilityResponse = {
  date: string;
  timezone: string;
  bufferMinutes: number;
  entries: Array<{ id: string; title: string; kind: string; startsAt: string; endsAt: string }>;
};

// What is already on the calendar for one local day, so the appointment picker can
// gray out taken slots (with their names) and the buffer kept around them.
export async function GET(request: Request) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const requestMetadata = await getRequestMetadata();
  const limit = await consumeRateLimit({ scope: "api.calendar-availability", identifiers: [membership.workspaceId, session.user.id, requestMetadata.ipAddress], limit: 120, windowMs: 60 * 1000, blockMs: 5 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  const timezone = (url.searchParams.get("timezone") ?? "").trim().slice(0, 160);
  const parsed = parseDateKey(date);
  if (!parsed || parsed.year < 2000 || parsed.year > 2100) return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
  if (!timezone || !isValidTimezone(timezone)) return NextResponse.json({ error: "Choose a valid timezone." }, { status: 400 });

  const dayStart = zonedDateTimeToUtc(parsed, 0, timezone);
  const dayEnd = zonedDateTimeToUtc(addLogicalDays(parsed, 1), 0, timezone);
  const [entries, preference] = await Promise.all([
    prisma.calendarEntry.findMany({ where: { workspaceId: membership.workspaceId, canceledAt: null, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } }, select: { id: true, title: true, kind: true, startsAt: true, endsAt: true }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 200 }),
    prisma.workspacePreference.findUnique({ where: { workspaceId: membership.workspaceId }, select: { appointmentBufferMinutes: true } })
  ]);
  const payload: CalendarAvailabilityResponse = {
    date,
    timezone,
    bufferMinutes: normalizeBufferMinutes(preference?.appointmentBufferMinutes),
    entries: entries.map(entry => ({ id: entry.id, title: entry.title, kind: entry.kind, startsAt: localCalendarTime(entry.startsAt, timezone), endsAt: localCalendarTime(entry.endsAt, timezone) }))
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
