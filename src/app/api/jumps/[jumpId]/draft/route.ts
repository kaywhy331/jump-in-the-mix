import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { discardJumpDraft, saveJumpDraft, type DraftFailure } from "@/lib/jump-drafts";
import { isPreparationFamily } from "@/lib/preparation-family";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

const MAX_BODY_BYTES = 64 * 1024;

type Authorized = { workspaceId: string; userId: string };

async function authorize(): Promise<Authorized | NextResponse> {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });
  const metadata = await getRequestMetadata();
  // Autosave is debounced on the client; this bound covers a runaway tab, not normal typing.
  const limit = await consumeRateLimit({
    scope: "api.jump-draft",
    identifiers: [membership.workspaceId, session.user.id, metadata.ipAddress],
    limit: 240,
    windowMs: 60 * 1000,
    blockMs: 60 * 1000
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many edits at once. Your text is still on screen; try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  return { workspaceId: membership.workspaceId, userId: session.user.id };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return null;
  const payload = await request.json().catch(() => null) as unknown;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
}

function failure(result: DraftFailure): NextResponse {
  const status = result.reason === "invalid" ? 400 : result.reason === "unavailable" ? 404 : 409;
  return NextResponse.json({ error: result.message, reason: result.reason, draft: result.draft }, { status });
}

export async function GET(request: Request, { params }: { params: Promise<{ jumpId: string }> }) {
  const auth = await authorize();
  if (auth instanceof NextResponse) return auth;
  const { jumpId } = await params;
  const family = new URL(request.url).searchParams.get("family");
  if (!isPreparationFamily(family)) return NextResponse.json({ error: "Choose a valid message type." }, { status: 400 });
  const jump = await prisma.jump.findFirst({ where: { id: jumpId, workspaceId: auth.workspaceId }, select: { id: true } });
  if (!jump) return NextResponse.json({ error: "Follow-up not found." }, { status: 404 });
  const draft = await prisma.jumpDraft.findFirst({
    where: { jumpId, family, workspaceId: auth.workspaceId },
    select: { family: true, subject: true, body: true, script: true, revision: true, stepVersionId: true, detached: true, updatedAt: true }
  });
  return NextResponse.json({ draft }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ jumpId: string }> }) {
  const auth = await authorize();
  if (auth instanceof NextResponse) return auth;
  const { jumpId } = await params;
  const payload = await readJson(request);
  if (!payload) return NextResponse.json({ error: "The draft could not be read." }, { status: 400 });
  const result = await saveJumpDraft({
    workspaceId: auth.workspaceId,
    jumpId,
    family: payload.family,
    subject: payload.subject,
    body: payload.body,
    script: payload.script,
    revision: payload.revision
  });
  if (!result.ok) return failure(result);
  return NextResponse.json({ draft: result.draft }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ jumpId: string }> }) {
  const auth = await authorize();
  if (auth instanceof NextResponse) return auth;
  const { jumpId } = await params;
  const payload = await readJson(request);
  if (!payload) return NextResponse.json({ error: "The draft could not be read." }, { status: 400 });
  const result = await discardJumpDraft({ workspaceId: auth.workspaceId, jumpId, family: payload.family, revision: payload.revision });
  if (!result.ok) return failure(result);
  return new NextResponse(null, { status: 204 });
}
