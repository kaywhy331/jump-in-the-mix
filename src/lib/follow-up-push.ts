import { createHash, randomUUID } from "node:crypto";
import webPush from "web-push";
import { Prisma, type NotificationDeliveryStatus, type PushSubscription } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { browserScope } from "@/lib/browser-scope";

const leaseMs = 15 * 60_000;
const maximumAttempts = 3;
const batchSize = 100;
// More than one batch due at once (a first-time backlog) is claimed in one statement pair,
// up to this many rows per pass, and becomes one summary push.
const backlogCap = 1_000;
const recheckChunk = 500; // follow-up ids per recheck query

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
    sessionId: subscription.sessionId, session: { userId: subscription.userId, user: { suspendedAt: null }, expiresAt: { gt: new Date() } }
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

type DueSubscription = Pick<PushSubscription, "id" | "workspaceId">;
type DueRow = { id: string; scheduledAt: Date };
type ClaimedRow = { id: string; jumpId: string; scheduledAt: Date };

const reachableContact = { archivedAt: null, OR: [{ relationshipState: null }, { relationshipState: { doNotContact: false } }] } satisfies Prisma.ContactWhereInput;

function utc(value: Date): Prisma.Sql {
  return Prisma.sql`(${value.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

// needsPushReminder in SQL, over the rows the pass used to load: pending follow-ups of reachable people that are due,
// whose receipt for this device and this scheduled time (unique, so one row at most) is missing, or is PENDING or FAILED
// below the attempt limit without a live lease. A rescheduled occurrence has no receipt yet. The integration suite
// compares this selection with needsPushReminder on a fixture; change both together.
function dueRows(subscription: DueSubscription, now: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT j.id, j."scheduledAt", receipt.id AS "receiptId"
    FROM "Jump" j
    JOIN "Contact" c ON c.id = j."contactId"
    LEFT JOIN "ContactRelationshipState" r ON r."contactId" = c.id
    LEFT JOIN "FollowUpPushDelivery" receipt
      ON receipt."subscriptionId" = ${subscription.id} AND receipt."jumpId" = j.id AND receipt."scheduledAt" = j."scheduledAt"
    WHERE j."workspaceId" = ${subscription.workspaceId} AND j.status = 'PENDING' AND j."scheduledAt" <= ${utc(now)}
      AND c."archivedAt" IS NULL AND (r.id IS NULL OR r."doNotContact" = false)
      AND (receipt.id IS NULL OR (receipt.status IN ('PENDING', 'FAILED') AND receipt.attempts < ${maximumAttempts}
        AND (receipt."lockedAt" IS NULL OR receipt."lockedAt" < ${utc(new Date(now.getTime() - leaseMs))})))`;
}

/** How many reminders are due for one device, counted up to the backlog cap; with one batch or less, all of them oldest first. */
export async function readDueReminders(subscription: DueSubscription, now: Date): Promise<{ due: number; rows: DueRow[] }> {
  const rows = await prisma.$queryRaw<Array<DueRow & { due: number }>>(Prisma.sql`
    SELECT due.id, due."scheduledAt", (count(*) OVER ())::int AS due
    FROM (${dueRows(subscription, now)} LIMIT ${backlogCap}) due
    ORDER BY due."scheduledAt", due.id
    LIMIT ${batchSize}`);
  return { due: rows[0]?.due ?? 0, rows: rows.map(row => ({ id: row.id, scheduledAt: row.scheduledAt })) };
}

// One batch or less: receipts per row with the deterministic id, then one conditional claim.
async function claimRows(subscription: DueSubscription, candidates: DueRow[], now: Date, claim: string): Promise<ClaimedRow[]> {
  const ids = candidates.map(jump => receiptId(subscription.id, jump.id, jump.scheduledAt));
  return prisma.$transaction(async (tx) => {
    await tx.followUpPushDelivery.createMany({ data: candidates.map((jump, index) => ({ id: ids[index], workspaceId: subscription.workspaceId, subscriptionId: subscription.id, jumpId: jump.id, scheduledAt: jump.scheduledAt })), skipDuplicates: true });
    await tx.followUpPushDelivery.updateMany({
      where: { id: { in: ids }, status: { in: ["PENDING", "FAILED"] }, attempts: { lt: maximumAttempts }, OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - leaseMs) } }] },
      data: { status: "PENDING", lockedAt: now, lockedBy: claim, attempts: { increment: 1 }, error: null }
    });
    return tx.followUpPushDelivery.findMany({ where: { id: { in: ids }, lockedBy: claim }, select: { id: true, jumpId: true, scheduledAt: true } });
  });
}

// A backlog: receipts for the oldest due rows up to the cap in one INSERT ... SELECT, then one claim of the same rows.
// The id is receiptId's (sha256 of "subscription:jump:ISO time"), so either path can retry a receipt the other made.
// The claim conditions sit on the updated row so a concurrent claimant's lease is rechecked after its lock.
async function claimBacklog(subscription: DueSubscription, now: Date, claim: string): Promise<ClaimedRow[]> {
  const backlog = Prisma.sql`${dueRows(subscription, now)} ORDER BY j."scheduledAt", j.id LIMIT ${backlogCap}`;
  const written = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "FollowUpPushDelivery" (id, "workspaceId", "subscriptionId", "jumpId", "scheduledAt", "createdAt", "updatedAt")
      SELECT encode(sha256(convert_to(${subscription.id}::text || ':' || due.id || ':' || to_char(due."scheduledAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'UTF8')), 'hex'),
        ${subscription.workspaceId}, ${subscription.id}, due.id, due."scheduledAt", ${utc(written)}, ${utc(written)}
      FROM (${backlog}) due
      WHERE due."receiptId" IS NULL
      ON CONFLICT DO NOTHING`);
    return tx.$queryRaw<ClaimedRow[]>(Prisma.sql`
      UPDATE "FollowUpPushDelivery" d
      SET status = 'PENDING', "lockedAt" = ${utc(now)}, "lockedBy" = ${claim}, attempts = d.attempts + 1, error = NULL, "updatedAt" = ${utc(written)}
      FROM (${backlog}) due
      WHERE d.id = due."receiptId" AND d.status IN ('PENDING', 'FAILED') AND d.attempts < ${maximumAttempts}
        AND (d."lockedAt" IS NULL OR d."lockedAt" < ${utc(new Date(now.getTime() - leaseMs))})
      RETURNING d.id, d."jumpId", d."scheduledAt"`);
  });
}

// Recheck after claiming: completed, canceled, rescheduled and newly unreachable items must not produce a
// notification from an earlier worker snapshot. Ids are read in chunks and the scheduled time compared here.
async function stillDue(workspaceId: string, claimed: ClaimedRow[]): Promise<ClaimedRow[]> {
  const current = new Map<string, number>();
  for (let start = 0; start < claimed.length; start += recheckChunk) {
    const jumps = await prisma.jump.findMany({
      where: { workspaceId, status: "PENDING", id: { in: claimed.slice(start, start + recheckChunk).map(row => row.jumpId) }, contact: reachableContact },
      select: { id: true, scheduledAt: true }
    });
    for (const jump of jumps) current.set(jump.id, jump.scheduledAt.getTime());
  }
  return claimed.filter(row => current.get(row.jumpId) === row.scheduledAt.getTime());
}

export async function sendFollowUpPush(input: { workspaceId: string; userId: string; now: Date }): Promise<number> {
  if (!pushConfigured()) return 0;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { workspaceId: input.workspaceId, userId: input.userId, session: { userId: input.userId, expiresAt: { gt: input.now } } } });
  let sent = 0;
  for (const subscription of subscriptions) {
    if (!validPushEndpoint(subscription.endpoint)) continue;
    const { due, rows } = await readDueReminders(subscription, input.now);
    if (!due) continue;
    const claim = randomUUID();
    const claimed = due > batchSize ? await claimBacklog(subscription, input.now, claim) : await claimRows(subscription, rows, input.now, claim);
    if (!claimed.length) continue;
    try {
      const active = await stillDue(input.workspaceId, claimed);
      const activeIds = new Set(active.map(row => row.id));
      await prisma.followUpPushDelivery.updateMany({ where: { lockedBy: claim, id: { in: claimed.filter(row => !activeIds.has(row.id)).map(row => row.id) } }, data: { status: "SKIPPED", lockedAt: null, lockedBy: null } });
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
