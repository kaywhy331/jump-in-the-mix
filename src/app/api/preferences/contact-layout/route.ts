import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const payloadSchema = z.object({
  order: z.array(z.string().trim().min(1).max(120)).max(40),
  collapsed: z.array(z.string().trim().min(1).max(120)).max(40)
}).strict();

export async function PUT(request: Request) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The layout preference is invalid." }, { status: 400 });
  const order = [...new Set(parsed.data.order)];
  const collapsed = [...new Set(parsed.data.collapsed.filter((id) => order.includes(id)))];
  await prisma.userContactLayout.upsert({
    where: { userId_workspaceId: { userId: session.user.id, workspaceId: membership.workspaceId } },
    create: { userId: session.user.id, workspaceId: membership.workspaceId, cardOrder: order, collapsedCards: collapsed },
    update: { cardOrder: order, collapsedCards: collapsed }
  });
  return new NextResponse(null, { status: 204 });
}

export async function DELETE() {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });
  await prisma.userContactLayout.deleteMany({ where: { userId: session.user.id, workspaceId: membership.workspaceId } });
  return new NextResponse(null, { status: 204 });
}
