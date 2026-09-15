import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { selectJumpVariant } from "@/lib/jump-variants";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

const MAX_BODY_BYTES = 4 * 1024;

/** Chooses the channel family for one follow-up on Today. A choice, not an action: nothing is scheduled or sent. */
export async function PATCH(request: Request, { params }: { params: Promise<{ jumpId: string }> }) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });
  const metadata = await getRequestMetadata();
  const limit = await consumeRateLimit({ scope: "api.jump-variant", identifiers: [membership.workspaceId, session.user.id, metadata.ipAddress], limit: 120, windowMs: 60 * 1000, blockMs: 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many changes at once. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const { jumpId } = await params;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: "The request is too large." }, { status: 400 });
  const payload = await request.json().catch(() => null) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("family" in payload)) return NextResponse.json({ error: "Say which message type to use." }, { status: 400 });
  const result = await selectJumpVariant({ workspaceId: membership.workspaceId, jumpId, family: (payload as { family: unknown }).family });
  if (!result.ok) return NextResponse.json({ error: result.message, reason: result.reason }, { status: result.reason === "invalid" ? 400 : 404 });
  return NextResponse.json({ selectedFamily: result.selectedFamily }, { headers: { "Cache-Control": "private, no-store" } });
}
