import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCalendarIcs } from "@/lib/calendar-ical";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const { workspace, impersonation } = await requireWorkspace();
  if (impersonation) return new Response("Support sessions are view-only.", { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  const entries = await prisma.calendarEntry.findMany({ where: { workspaceId: workspace.id, connectionId: null, ...(id ? { id } : {}) }, orderBy: { startsAt: "asc" } });
  if (id && !entries.length) return new Response("Event not found.", { status: 404 });
  return new Response(createCalendarIcs(entries), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "attachment; filename=jump-in-the-mix.ics", "Cache-Control": "private, no-store" } });
}
