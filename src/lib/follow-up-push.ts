import { createHash, randomUUID } from "node:crypto";
import webPush from "web-push";
import type { NotificationDeliveryStatus, PushSubscription } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { browserScope } from "@/lib/browser-scope";

const leaseMs = 15 * 60_000;
const maximumAttempts = 3;
const batchSize = 100;

export function pushConfigured(): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey);
}

export function validPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && (url.hostname === "fcm.googleapis.com"
        || url.hostname === "updates.push.services.mozilla.com"
        || url.hostname.endsWith(".push.apple.com")
        || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}

export function pushSubscriptionExpired(error: unknown): boolean {
  const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
  return status === 404 || status === 410;
}

export async function forgetPushSubscription(subscription: Pick<PushSubscription, "id" | "workspaceId" | "userId">): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.pushSubscription.deleteMany({ where: { id: subscription.id, workspaceId: subscription.workspaceId, userId: subscription.userId } });
    const remaining = await tx.pushSubscription.count({ where: { workspaceId: subscription.workspaceId, userId: subscription.userId, session: { userId: subscription.userId, expiresAt: { gt: new Date() } } } });
    if (!remaining) await tx.notificationPreference.updateMany({ where: { workspaceId: subscription.workspaceId, userId: subscription.userId }, data: { pushEnabled: false } });
  });
}

export async function sendDevicePush(subscription: PushSubscription, payload: { title: string; body: string; url: string; tag: string }): Promise<boolean> {
  if (!pushConfigured()) throw new Error("Push reminders are not configured.");
  if (!validPushEndpoint(subscription.endpoint)) throw new Error("Unsupported push service.");
  // Recheck the exact binding immediately before handing off to a provider.
  if (!subscription.sessionId || !await prisma.pushSubscription.count({ where: {
    id: subscription.id, workspaceId: subscription.workspaceId, userId: subscription.userId,
    sessionId: subscription.sessionId, session: { userId: subscription.userId, expiresAt: { gt: new Date() } }
  } })) return false;
  const scope = browserScope({ authUser: { id: subscription.userId }, user: { id: subscription.userId, memberships: [{ workspaceId: subscription.workspaceId }] }, impersonation: null });
  webPush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ ...payload, scope, subscriptionId: subscription.id }), { TTL: 60 * 60, urgency: "normal", timeout: 10_000 });
  return true;
}

type Receipt = { scheduledAt: Date; status: NotificationDeliveryStatus; attempts: number; lockedAt: Date | null };

export function needsPushReminder(scheduledAt: Date, receipts: Receipt[], now: Date): boolean {
  if (scheduledAt > now) return false;
  const receipt = receipts.find(item => item.scheduledAt.getTime() === scheduledAt.getTime());
  if (!receipt) return true;
  return (receipt.status === "PENDING" || receipt.status === "FAILED")
    && receipt.attempts < maximumAttempts
    && (!receipt.lockedAt || receipt.lockedAt.getTime() < now.getTime() - leaseMs);
}

function receiptId(subscriptionId: string, jumpId: string, scheduledAt: Date): string {
  return createHash("sha256").update(`${subscriptionId}:${jumpId}:${scheduledAt.toISOString()}`).digest("hex");
}

export async function sendFollowUpPush(input: { workspaceId: string; userId: string; now: Date }): Promise<number> {
  if (!pushConfigured()) return 0;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { workspaceId: input.workspaceId, userId: input.userId, session: { userId: input.userId, expiresAt: { gt: input.now } } } });
  let sent = 0;
  for (const subscription of subscriptions) {
    if (!validPushEndpoint(subscription.endpoint)) continue;
    const due = await prisma.jump.findMany({
      where: { workspaceId: input.workspaceId, status: "PENDING", scheduledAt: { lte: input.now }, contact: { archivedAt: null, OR: [{ relationshipState: null }, { relationshipState: { doNotContact: false } }] } },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      select: { id: true, scheduledAt: true, pushDeliveries: { where: { subscriptionId: subscription.id }, select: { scheduledAt: true, status: true, attempts: true, lockedAt: true } } }
    });
    const candidates = due.filter(jump => needsPushReminder(jump.scheduledAt, jump.pushDeliveries, input.now)).slice(0, batchSize);
    if (!candidates.length) continue;
    const claim = randomUUID();
    const ids = candidates.map(jump => receiptId(subscription.id, jump.id, jump.scheduledAt));
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.followUpPushDelivery.createMany({ data: candidates.map((jump, index) => ({ id: ids[index], workspaceId: input.workspaceId, subscriptionId: subscription.id, jumpId: jump.id, scheduledAt: jump.scheduledAt })), skipDuplicates: true });
      await tx.followUpPushDelivery.updateMany({
        where: { id: { in: ids }, status: { in: ["PENDING", "FAILED"] }, attempts: { lt: maximumAttempts }, OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(input.now.getTime() - leaseMs) } }] },
        data: { status: "PENDING", lockedAt: input.now, lockedBy: claim, attempts: { increment: 1 }, error: null }
      });
      return tx.followUpPushDelivery.findMany({ where: { id: { in: ids }, lockedBy: claim }, select: { id: true, jumpId: true, scheduledAt: true } });
    });
    if (!claimed.length) continue;
    try {
      // Recheck after claiming: completed, canceled, and rescheduled items must
      // not produce a notification from an earlier worker snapshot.
      const pending = await prisma.jump.findMany({
        where: { workspaceId: input.workspaceId, status: "PENDING", OR: claimed.map(row => ({ id: row.jumpId, scheduledAt: row.scheduledAt })), contact: { archivedAt: null, OR: [{ relationshipState: null }, { relationshipState: { doNotContact: false } }] } },
        select: { id: true }
      });
      const pendingIds = new Set(pending.map(jump => jump.id));
      const active = claimed.filter(row => pendingIds.has(row.jumpId));
      await prisma.followUpPushDelivery.updateMany({ where: { lockedBy: claim, id: { in: claimed.filter(row => !pendingIds.has(row.jumpId)).map(row => row.id) } }, data: { status: "SKIPPED", lockedAt: null, lockedBy: null } });
      if (!active.length) continue;
      const stillSubscribed = await prisma.pushSubscription.count({ where: { id: subscription.id, workspaceId: input.workspaceId, userId: input.userId } });
      const preference = await prisma.notificationPreference.findUnique({ where: { workspaceId: input.workspaceId } });
      if (!stillSubscribed || !preference?.pushEnabled || preference.userId !== input.userId) {
        await prisma.followUpPushDelivery.updateMany({ where: { lockedBy: claim }, data: { lockedAt: null, lockedBy: null, attempts: { decrement: 1 } } });
        continue;
      }
      const tag = createHash("sha256").update(active.map(row => row.id).sort().join(":")).digest("hex").slice(0, 24);
      const delivered = await sendDevicePush(subscription, { title: "Follow-up reminder", body: active.length === 1 ? "1 follow-up is ready. Open Today to take care of it." : `${active.length} follow-ups are ready. Open Today to take care of them.`, url: "/jumps", tag: `jitm-due-${tag}` });
      if (!delivered) {
        await prisma.followUpPushDelivery.updateMany({ where: { lockedBy: claim }, data: { lockedAt: null, lockedBy: null, attempts: { decrement: 1 } } });
        continue;
      }
      await prisma.followUpPushDelivery.updateMany({ where: { lockedBy: claim }, data: { status: "DELIVERED", deliveredAt: input.now, lockedAt: null, lockedBy: null } });
      await prisma.pushSubscription.updateMany({ where: { id: subscription.id }, data: { lastUsedAt: input.now } });
      sent += 1;
    } catch (error) {
      if (pushSubscriptionExpired(error)) await forgetPushSubscription(subscription);
      else {
        // Store only the provider status; endpoints and encryption keys are private.
        const status = error && typeof error === "object" && "statusCode" in error ? String(error.statusCode) : "unavailable";
        await prisma.followUpPushDelivery.updateMany({ where: { lockedBy: claim }, data: { status: "FAILED", error: `Push provider ${status}`, lockedAt: null, lockedBy: null } });
      }
    }
  }
  return sent;
}
