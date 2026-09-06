import { NextResponse } from "next/server";
import { pushRequestContext, pushResponse } from "@/lib/push-request-context";
import { forgetPushSubscription, pushConfigured, pushSubscriptionExpired, sendDevicePush } from "@/lib/follow-up-push";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ctx = await pushRequestContext(request);
  if (ctx.error) return ctx.error;
  const { workspaceId, userId, session } = ctx;
  if (!pushConfigured()) return NextResponse.json({ error: "Push reminders are not configured." }, { status: 503 });
  const payload = await request.json().catch(() => null);
  if (typeof payload?.endpoint !== "string" || payload.endpoint.length > 2000) return NextResponse.json({ error: "Turn on reminders on this device first." }, { status: 400 });
  const subscription = await prisma.pushSubscription.findFirst({ where: { workspaceId, userId, sessionId: session.id, endpoint: payload.endpoint } });
  if (!subscription) return NextResponse.json({ error: "Turn on reminders on this device first." }, { status: 404 });
  const limit = await consumeRateLimit({ scope: "notifications.test", identifiers: [workspaceId, userId], limit: 5, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Wait a minute before sending another test." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  try {
    const sent = await sendDevicePush(subscription, { title: "Reminders are connected", body: "This device can receive your follow-up reminders. Tap to open Today.", url: "/jumps", tag: "jitm-push-test" });
    if (!sent) return pushResponse({ error: "This connection expired. Turn reminders on again." }, 409);
    return NextResponse.json({ sent: true });
  } catch (error) {
    if (pushSubscriptionExpired(error)) {
      await forgetPushSubscription(subscription);
      return NextResponse.json({ error: "This connection expired. Turn reminders on again." }, { status: 410 });
    }
    return NextResponse.json({ error: "The notification could not be sent. Please try again." }, { status: 502 });
  }
}
