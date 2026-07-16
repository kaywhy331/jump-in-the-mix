import { NextResponse } from "next/server";
import type { JumpActionType } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

const ACTIONS: JumpActionType[] = ["OPENED", "COPIED", "COMPOSED", "CALLED", "VOICEMAIL_STARTED"];

export async function POST(request: Request, { params }: { params: Promise<{ jumpId: string }> }) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const metadata = await getRequestMetadata();
  const rateLimit = await consumeRateLimit({
    scope: "api.jump-action",
    identifiers: [membership.workspaceId, session.user.id, metadata.ipAddress],
    limit: 120,
    windowMs: 60 * 1000,
    blockMs: 5 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many actions. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { jumpId } = await params;
  const payload = await request.json().catch(() => null) as { action?: string } | null;
  const action = payload?.action as JumpActionType | undefined;
  if (!action || !ACTIONS.includes(action)) return NextResponse.json({ error: "Invalid Jump action." }, { status: 400 });

  const jump = await prisma.jump.findFirst({
    where: { id: jumpId, workspaceId: membership.workspaceId },
    include: { stepVersion: { include: { stepTemplate: true } } }
  });
  if (!jump) return NextResponse.json({ error: "Jump not found." }, { status: 404 });

  await prisma.jumpActionEvent.create({
    data: {
      workspaceId: membership.workspaceId,
      jumpId: jump.id,
      actorUserId: session.user.id,
      action,
      channel: jump.stepVersion.stepTemplate.channel,
      metadata: { userAgent: metadata.userAgent, ipAddress: metadata.ipAddress }
    }
  });
  return new NextResponse(null, { status: 204 });
}
