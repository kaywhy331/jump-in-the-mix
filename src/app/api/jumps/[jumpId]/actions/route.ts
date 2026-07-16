import { NextResponse } from "next/server";
import type { JumpActionType } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ACTIONS: JumpActionType[] = ["OPENED", "COPIED", "COMPOSED", "CALLED", "VOICEMAIL_STARTED"];

export async function POST(request: Request, { params }: { params: Promise<{ jumpId: string }> }) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

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
      metadata: { userAgent: request.headers.get("user-agent")?.slice(0, 240) ?? null }
    }
  });
  return new NextResponse(null, { status: 204 });
}
