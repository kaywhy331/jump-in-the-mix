import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { readPreparationStatus, retryPreparation } from "@/lib/preparation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { wakeWorkerAfterResponse } from "@/lib/worker-dispatch-after";

const headers = { "Cache-Control": "private, no-store" };
const failure = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

async function context(request: Request) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return { error: failure("Sign in again to check your follow-ups.", 401) };
  if (!session.impersonation && env.requireEmailVerification && !session.user.emailVerifiedAt) return { error: failure("Verify your email before checking follow-ups.", 403) };
  const param = new URL(request.url).searchParams.get("contactId");
  if (param !== null && (!param || param.length > 128)) return { error: failure("Choose a valid contact.", 400) };
  const contactId = param ?? undefined;
  if (contactId && !await prisma.contact.findFirst({ where: { id: contactId, workspaceId: membership.workspaceId, archivedAt: null }, select: { id: true } })) return { error: failure("Contact not found.", 404) };
  return { session, workspaceId: membership.workspaceId, contactId };
}

export async function GET(request: Request) {
  const ctx = await context(request);
  if (ctx.error) return ctx.error;
  const status = await readPreparationStatus(ctx.workspaceId, ctx.contactId);
  if (!ctx.session.impersonation) wakeWorkerAfterResponse(ctx.workspaceId);
  return NextResponse.json(status, { headers });
}

export async function POST(request: Request) {
  const ctx = await context(request);
  if (ctx.error) return ctx.error;
  if (ctx.session.impersonation) return failure("Support sessions are view-only.", 403);
  const limit = await consumeRateLimit({ scope: "follow-up.preparation.retry", identifiers: [ctx.workspaceId], limit: 3, windowMs: 300_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Please wait a few minutes before trying preparation again." }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds) } });
  await retryPreparation(ctx.workspaceId, ctx.session.user.id);
  const status = await readPreparationStatus(ctx.workspaceId, ctx.contactId);
  wakeWorkerAfterResponse(ctx.workspaceId);
  return NextResponse.json(status, { headers });
}
