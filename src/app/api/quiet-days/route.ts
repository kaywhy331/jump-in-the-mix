import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { timezoneForUser } from "@/lib/display-preferences";
import { QuietDayError, readQuietDays, resolveQuietDay } from "@/lib/quiet-days";
import { consumeRateLimit } from "@/lib/rate-limit";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const session = await getCurrentSession(); const workspaceId = session?.user.memberships[0]?.workspaceId;
  if (!workspaceId || !session) return NextResponse.json({ error: "Sign in to view check-ins." }, { status: 401, headers });
  const q = new URL(request.url).searchParams;
  return NextResponse.json(await readQuietDays({ workspaceId, timezone: await timezoneForUser(session.user.id), query: q.get("q") ?? "", page: Number(q.get("page")) || 1 }), { headers });
}
export async function POST(request: Request) {
  const session = await getCurrentSession(); const workspaceId = session?.user.memberships[0]?.workspaceId;
  if (!workspaceId || !session) return NextResponse.json({ error: "Sign in to resolve a check-in." }, { status: 401, headers });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403, headers });
  const limit = await consumeRateLimit({ scope: "api.quiet-days", identifiers: [workspaceId, session.user.id], limit: 60, windowMs: 60_000, blockMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many updates. Try again shortly." }, { status: 429, headers });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.contactId !== "string" || body.contactId.length > 100 || typeof body.cycle !== "string" || !["COMPLETED", "SKIPPED"].includes(body.resolution)) return NextResponse.json({ error: "Choose a check-in and outcome." }, { status: 400, headers });
  try {
    return NextResponse.json(await resolveQuietDay({ workspaceId, userId: session.user.id, timezone: await timezoneForUser(session.user.id), contactId: body.contactId, cycle: body.cycle, resolution: body.resolution }), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof QuietDayError ? error.message : "Could not save this outcome. Try again." }, { status: error instanceof QuietDayError ? 400 : 500, headers });
  }
}
