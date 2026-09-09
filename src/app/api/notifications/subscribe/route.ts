import { z } from "zod";
import { pushRequestContext, pushResponse } from "@/lib/push-request-context";
import { prisma } from "@/lib/prisma";
import { pushConfigured, validPushEndpoint } from "@/lib/follow-up-push";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000).refine(validPushEndpoint),
  keys: z.object({ p256dh: z.string().min(20).max(500), auth: z.string().min(8).max(500) })
}).passthrough();

export async function GET(request: Request) {
  const ctx = await pushRequestContext(request);
  if (ctx.error) return ctx.error;
  const { workspaceId, userId, session } = ctx;
  const subscriptionId = new URL(request.url).searchParams.get("subscriptionId");
  if (subscriptionId !== null) {
    if (!subscriptionId || subscriptionId.length > 200) return pushResponse({ error: "Invalid device." }, 400);
    const subscription = await prisma.pushSubscription.findFirst({ where: { id: subscriptionId, workspaceId, userId, sessionId: session.id }, select: { id: true } });
    const preference = await prisma.notificationPreference.findUnique({ where: { workspaceId }, select: { userId: true, pushEnabled: true } });
    return pushResponse({ active: Boolean(subscription && preference?.pushEnabled && preference.userId === userId) });
  }
  const subscriptions = await prisma.pushSubscription.findMany({ where: { workspaceId, userId, sessionId: session.id }, select: { endpoint: true } });
  return pushResponse({ endpoints: subscriptions.map(item => item.endpoint) });
}

export async function POST(request: Request) {
  const ctx = await pushRequestContext(request);
  if (ctx.error) return ctx.error;
  const { workspaceId, userId, session } = ctx;
  if (!pushConfigured()) return pushResponse({ error: "Push reminders are not configured." }, 503);
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return pushResponse({ error: "Invalid push subscription." }, 400);
  const saved = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${session.id} FOR UPDATE`;
    if (!await tx.session.count({ where: { id: session.id, userId, expiresAt: { gt: new Date() } } })) return false;
    await tx.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      create: { workspaceId, userId, sessionId: session.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent: request.headers.get("user-agent")?.slice(0, 500) },
      update: { workspaceId, userId, sessionId: session.id, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent: request.headers.get("user-agent")?.slice(0, 500), lastUsedAt: new Date() }
    });
    await tx.notificationPreference.upsert({ where: { workspaceId }, create: { workspaceId, userId, pushEnabled: true }, update: { userId, pushEnabled: true } });
    return true;
  });
  return saved ? pushResponse({ subscribed: true }) : pushResponse({ error: "Your session ended. Sign in before turning on reminders." }, 409);
}

export async function DELETE(request: Request) {
  const ctx = await pushRequestContext(request);
  if (ctx.error) return ctx.error;
  const { workspaceId, userId, session } = ctx;
  const payload = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  const endpoint = typeof payload?.endpoint === "string" ? payload.endpoint.slice(0, 2000) : "";
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { workspaceId, userId, sessionId: session.id, endpoint } });
  const remaining = await prisma.pushSubscription.count({ where: { workspaceId, userId, session: { expiresAt: { gt: new Date() }, userId } } });
  if (!remaining) await prisma.notificationPreference.updateMany({ where: { workspaceId, userId }, data: { pushEnabled: false } });
  return pushResponse({ subscribed: false });
}
