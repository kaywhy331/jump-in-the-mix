import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import type { Channel, JumpActionType } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata, type RequestMetadata } from "@/lib/request-context";

const ACTIONS: JumpActionType[] = ["OPENED", "COPIED", "COMPOSED", "CALLED", "VOICEMAIL_STARTED"];

function actionMatchesChannel(action: JumpActionType, channel: Channel): boolean {
  if (action === "CALLED") return channel === "PHONE_CALL";
  if (action === "VOICEMAIL_STARTED") return channel === "VOICEMAIL";
  if (action === "COMPOSED") return ["SMS", "EMAIL", "WHATSAPP"].includes(channel);
  return true;
}

function privacySafeMetadata(input: RequestMetadata): { ipHash: string | null; userAgent: string | null } {
  return {
    ipHash: input.ipAddress
      ? createHmac("sha256", env.authRateLimitSecret).update(input.ipAddress).digest("hex").slice(0, 24)
      : null,
    userAgent: input.userAgent?.slice(0, 300) ?? null
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ jumpId: string }> }) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });

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
    where: { id: jumpId, workspaceId: membership.workspaceId, status: { in: ["PENDING", "COPIED"] } },
    include: { stepVersion: { include: { stepTemplate: true } } }
  });
  if (!jump) return NextResponse.json({ error: "This Jump is no longer pending." }, { status: 409 });
  const channel = jump.stepVersion.stepTemplate.channel;
  if (!actionMatchesChannel(action, channel)) return NextResponse.json({ error: "That action does not match this Jump channel." }, { status: 400 });

  await prisma.jumpActionEvent.create({
    data: {
      workspaceId: membership.workspaceId,
      jumpId: jump.id,
      actorUserId: session.user.id,
      action,
      channel,
      metadata: privacySafeMetadata(metadata)
    }
  });
  return new NextResponse(null, { status: 204 });
}
