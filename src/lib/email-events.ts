import { z } from "zod";
import type { EmailMessage, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockAccess } from "@/lib/access-lock";
import { emailRecipientHash } from "@/lib/email-budget";
import { revokeStaffInvitations } from "@/lib/staff-invitation-state";
import { EmailDeliveryError } from "@/lib/email-errors";

const types = ["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.failed", "email.suppressed", "suppression.added"] as const;
const envelope = z.object({ type: z.enum(types), created_at: z.string().datetime({ offset: true }), data: z.object({
  email_id: z.string().min(1).max(200).optional(),
  to: z.array(z.string().email().max(254)).min(1).max(50).optional(),
  email: z.string().email().max(254).optional(),
  origin: z.string().max(100).optional(),
  bounce: z.object({ type: z.string().max(50).optional() }).optional()
}) });

type EventField = "deliveredAt" | "delayedAt" | "bouncedAt" | "complainedAt" | "suppressedAt" | "failedAt";
const eventFields: Record<string, EventField> = { "email.delivered": "deliveredAt", "email.delivery_delayed": "delayedAt", "email.bounced": "bouncedAt", "email.complained": "complainedAt", "email.suppressed": "suppressedAt", "email.failed": "failedAt" };

export async function reconcileEmailEvents(tx: Prisma.TransactionClient, message: EmailMessage) {
  if (!message.providerId || !message.recipientHash || message.detailsRetiredAt) return;
  const events = await tx.emailProviderEvent.findMany({ where: { detailsRetiredAt: null, providerId: message.providerId, recipientHashes: { has: message.recipientHash } }, orderBy: { occurredAt: "asc" } });
  const data: Partial<Record<EventField, Date>> = {};
  for (const event of events) {
    const field = eventFields[event.type];
    if (field && (!message[field] || event.occurredAt > message[field]) && (!data[field] || event.occurredAt > data[field]!)) data[field] = event.occurredAt;
  }
  if (Object.keys(data).length) await tx.emailMessage.update({ where: { id: message.id }, data });
}

export async function recordEmailAcceptance(messageId: string, providerId: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    // Same order as incoming events: never acquire the access lock while holding a message row.
    await lockAccess(tx);
    const existing = await tx.emailMessage.findUniqueOrThrow({ where: { id: messageId } });
    if (existing.detailsRetiredAt) throw new EmailDeliveryError("REVIEW", "This delivery key has been retired and cannot accept new provider details.", existing.firstAttemptAt);
    const message = await tx.emailMessage.update({ where: { id: messageId }, data: { providerId, acceptedAt: now } });
    await reconcileEmailEvents(tx, message);
  });
}

export async function receiveEmailProviderEvent(id: string, raw: unknown, now = new Date()) {
  if (!id || id.length > 200) throw new Error("Invalid event ID.");
  if (raw && typeof raw === "object" && "type" in raw && typeof raw.type === "string" && !types.includes(raw.type as typeof types[number])) return { ignored: true };
  const parsed = envelope.parse(raw);
  const occurredAt = new Date(parsed.created_at);
  if (occurredAt.getTime() > now.getTime() + 5 * 60_000) throw new Error("Invalid event time.");
  const recipients = [...new Set((parsed.type === "suppression.added" ? [parsed.data.email ?? ""] : parsed.data.to ?? []).map(email => email.trim().toLowerCase()))];
  if (!recipients.length || recipients.some(email => !email) || parsed.type !== "suppression.added" && !parsed.data.email_id) throw new Error("Invalid event recipients.");
  return prisma.$transaction(async tx => {
    await lockAccess(tx);
    if (await tx.emailProviderEvent.findUnique({ where: { id }, select: { id: true } })) return { duplicate: true };
    await tx.emailProviderEvent.create({ data: { id, type: parsed.type, providerId: parsed.data.email_id, recipientHashes: recipients.map(emailRecipientHash), occurredAt, receivedAt: now } });
    const reason = parsed.type === "email.complained" ? "COMPLAINT" :
      parsed.type === "email.bounced" && (!parsed.data.bounce?.type || parsed.data.bounce.type === "Permanent") ? "HARD_BOUNCE" :
      parsed.type === "email.suppressed" || parsed.type === "suppression.added" ? "PROVIDER_SUPPRESSION" : null;
    let suppressionApplied = false;
    if (reason) for (const email of recipients) {
      const existing = await tx.emailSuppression.findUnique({ where: { email_reason: { email, reason } } });
      // A delayed event for the cleared reason cannot undo the operator's newer
      // review. A genuinely later event reopens the block and advances revision.
      if (existing?.clearedAt && occurredAt <= existing.clearedAt) continue;
      suppressionApplied = true;
      await tx.emailSuppression.upsert({ where: { email_reason: { email, reason } }, create: { email, reason, lastTriggeredAt: occurredAt }, update: { clearedAt: null, lastTriggeredAt: existing?.lastTriggeredAt && existing.lastTriggeredAt > occurredAt ? existing.lastTriggeredAt : occurredAt, revision: { increment: 1 } } });
      await tx.waitlistEntry.updateMany({ where: { email, status: { in: ["WAITING", "ACCESS_GRANTED"] } }, data: { status: "SUPPRESSED" } });
      await tx.referralAccessInvite.updateMany({ where: { recipientEmail: email, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
      await revokeStaffInvitations(tx, { email }, now);
      await tx.waitlistDelivery.updateMany({ where: { invite: { recipientEmail: email, acceptedAt: null }, status: { in: ["QUEUED", "SENDING", "REVIEW"] } }, data: { status: "CANCELED", leaseId: null, lockedAt: null, lastError: "Recipient email is suppressed." } });
      await tx.verificationToken.updateMany({ where: { email, purpose: "waitlist", usedAt: null }, data: { usedAt: now } });
    }
    if (parsed.data.email_id) {
      const message = await tx.emailMessage.findUnique({ where: { providerId: parsed.data.email_id } });
      if (message) await reconcileEmailEvents(tx, message);
    }
    await tx.platformAuditEvent.create({ data: { action: "email.provider.event", entityType: "EmailProviderEvent", entityId: id, afterData: { event: parsed.type, recipientCount: recipients.length, suppressionApplied } } });
    return { received: true };
  });
}
