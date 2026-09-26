import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

const MAX_PAST_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

// Lets the person correct when a completed or skipped follow-up actually happened. It changes
// only the recorded time; the outcome, its activity entry and any next commitment stay as saved.
export async function PATCH(request: Request, { params }: { params: Promise<{ jumpId: string }> }) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });
  const requestMetadata = await getRequestMetadata();
  const limit = await consumeRateLimit({ scope: "api.jump-completed-at", identifiers: [membership.workspaceId, session.user.id, requestMetadata.ipAddress], limit: 60, windowMs: 60 * 1000, blockMs: 5 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many updates. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const payload = await request.json().catch(() => null) as { completedAt?: unknown } | null;
  const completedAt = typeof payload?.completedAt === "string" ? new Date(payload.completedAt) : null;
  if (!completedAt || Number.isNaN(completedAt.getTime())) return NextResponse.json({ error: "Choose a valid date and time." }, { status: 400 });
  const now = Date.now();
  if (completedAt.getTime() < now - MAX_PAST_MS || completedAt.getTime() > now + MAX_FUTURE_MS) return NextResponse.json({ error: "Choose a time within the last year." }, { status: 400 });

  const { jumpId } = await params;
  const jump = await prisma.jump.findFirst({ where: { id: jumpId, workspaceId: membership.workspaceId }, select: { id: true, status: true } });
  if (!jump) return NextResponse.json({ error: "Follow-up not found." }, { status: 404 });
  if (jump.status !== "DONE" && jump.status !== "SKIPPED") return NextResponse.json({ error: "Only a completed or skipped follow-up has a time to change." }, { status: 409 });
  const updated = await prisma.jump.update({ where: { id: jump.id }, data: { completedAt }, select: { completedAt: true } });
  return NextResponse.json({ completedAt: updated.completedAt?.toISOString() ?? null }, { headers: { "Cache-Control": "no-store" } });
}
