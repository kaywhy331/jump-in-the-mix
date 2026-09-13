import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { parseAttemptPayload, recordJumpAttempt } from "@/lib/jump-attempts";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Logs one handoff attempt. The page fires this with keepalive and does not wait for it before
 * opening the phone; a retry from the return tray is logging only and never sends anything.
 */
export async function POST(request: Request, { params }: { params: Promise<{ jumpId: string }> }) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });

  const metadata = await getRequestMetadata();
  const limit = await consumeRateLimit({
    scope: "api.jump-attempt",
    identifiers: [membership.workspaceId, session.user.id, metadata.ipAddress],
    limit: 120,
    windowMs: 60 * 1000,
    blockMs: 5 * 60 * 1000
  });
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts at once. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const { jumpId } = await params;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: "The attempt is too large to record." }, { status: 400 });
  let payload;
  try {
    payload = parseAttemptPayload(await request.json().catch(() => null));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The attempt could not be read." }, { status: 400 });
  }
  const result = await recordJumpAttempt({ workspaceId: membership.workspaceId, jumpId, payload });
  if (!result.ok) {
    const status = result.reason === "invalid" ? 400 : result.reason === "unavailable" ? 404 : 409;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }
  return NextResponse.json({ attemptId: result.attemptId, duplicate: result.duplicate }, { headers: { "Cache-Control": "private, no-store" } });
}
