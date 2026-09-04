import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(20).max(500), auth: z.string().min(8).max(500) })
}).passthrough();

export async function POST(request: Request) {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) return NextResponse.json({ error: "View-only session." }, { status: 403 });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  await prisma.$transaction([
    prisma.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      create: { workspaceId: workspace.id, userId: user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent: request.headers.get("user-agent")?.slice(0, 500) },
      update: { workspaceId: workspace.id, userId: user.id, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent: request.headers.get("user-agent")?.slice(0, 500), lastUsedAt: new Date() }
    }),
    prisma.notificationPreference.upsert({ where: { workspaceId: workspace.id }, create: { workspaceId: workspace.id, userId: user.id, pushEnabled: true }, update: { userId: user.id, pushEnabled: true } })
  ]);
  return NextResponse.json({ subscribed: true });
}

export async function DELETE(request: Request) {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) return NextResponse.json({ error: "View-only session." }, { status: 403 });
  const payload = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  const endpoint = typeof payload?.endpoint === "string" ? payload.endpoint.slice(0, 2000) : "";
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { workspaceId: workspace.id, userId: user.id, endpoint } });
  const remaining = await prisma.pushSubscription.count({ where: { workspaceId: workspace.id, userId: user.id } });
  if (!remaining) await prisma.notificationPreference.updateMany({ where: { workspaceId: workspace.id, userId: user.id }, data: { pushEnabled: false } });
  return NextResponse.json({ subscribed: false });
}
