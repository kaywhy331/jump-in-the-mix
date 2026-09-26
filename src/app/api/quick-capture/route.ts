import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { timezoneForUser } from "@/lib/display-preferences";
import { QuickCaptureError, saveQuickCapture, searchQuickCaptureContacts } from "@/lib/quick-capture";
import { consumeRateLimit } from "@/lib/rate-limit";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const session = await getCurrentSession();
  const workspaceId = session?.user.memberships[0]?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Sign in again to find a person." }, { status: 401, headers });
  const contacts = await searchQuickCaptureContacts(workspaceId, new URL(request.url).searchParams.get("q") ?? "");
  return NextResponse.json({ contacts }, { headers });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  const workspaceId = session?.user.memberships[0]?.workspaceId;
  if (!session || !workspaceId) return NextResponse.json({ error: "Sign in again before saving. Your capture is still here." }, { status: 401, headers });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403, headers });
  const limit = await consumeRateLimit({ scope: "api.quick-capture", identifiers: [workspaceId, session.authUser.id], limit: 60, windowMs: 3_600_000, blockMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many captures. Try again shortly." }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds) } });
  try {
    const receipt = await saveQuickCapture({ workspaceId, actorUserId: session.user.id, timezone: await timezoneForUser(session.user.id) }, await request.json().catch(() => null));
    return NextResponse.json({ receipt }, { headers });
  } catch (error) {
    if (error instanceof QuickCaptureError) return NextResponse.json({ error: error.message, contacts: error.contacts, receipt: error.receipt }, { status: error.receipt ? 409 : 400, headers });
    console.error("Quick capture save failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Your capture could not be saved. Keep these details and try again." }, { status: 500, headers });
  }
}
