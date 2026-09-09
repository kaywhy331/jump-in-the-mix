import { randomUUID } from "node:crypto";
import { decryptIntegrationCredentials } from "@/lib/integration-crypto";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail, type TransactionalEmail } from "@/lib/transactional-email";
import { waitlistSendingReady } from "@/lib/waitlist";
import { invitationEmailSuppressed } from "@/lib/invitation-preferences";
import { EmailDeliveryError } from "@/lib/email-errors";
import { EMAIL_RETRY_WINDOW_MS } from "@/lib/email-budget";
import { staffInvitationAvailable } from "@/lib/staff-invitation-state";
import { lockStaff } from "@/lib/staff-access";
import { lockAccess } from "@/lib/access-lock";

// Leave an hour of margin inside the provider's 24-hour idempotency window.
export const WAITLIST_RETRY_WINDOW_MS = EMAIL_RETRY_WINDOW_MS;
const LEASE_MS = 5 * 60_000;

export async function deliverWaitlistInvitations(now = new Date(), limit = 10): Promise<number> {
  if (!waitlistSendingReady()) return 0;
  const startedAt = Date.now();
  const startTime = now.getTime();
  let sent = 0;
  for (let i = 0; i < limit; i++) {
    now = new Date(startTime + Date.now() - startedAt);
    const due = { OR: [
      { status: "QUEUED" as const, nextAttemptAt: { lte: now } },
      { status: "SENDING" as const, lockedAt: { lt: new Date(now.getTime() - LEASE_MS) } }
    ] };
    const candidate = await prisma.waitlistDelivery.findFirst({ where: due, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }] });
    if (!candidate) break;
    const leaseId = randomUUID();
    const claimed = await prisma.waitlistDelivery.updateMany({ where: { id: candidate.id, generation: candidate.generation, ...due }, data: {
      status: "SENDING", leaseId, lockedAt: now, attempts: { increment: 1 }
    } });
    if (claimed.count !== 1) continue;
    const owned = { id: candidate.id, generation: candidate.generation, leaseId, status: "SENDING" as const };
    if (candidate.firstAttemptAt && now.getTime() - candidate.firstAttemptAt.getTime() >= WAITLIST_RETRY_WINDOW_MS) {
      await prisma.waitlistDelivery.updateMany({ where: owned, data: { status: "REVIEW", leaseId: null, lockedAt: null, lastError: "Retry window expired. Check the email provider before any further send." } });
      continue;
    }
    const invite = candidate.inviteId ? await prisma.referralAccessInvite.findUnique({ where: { id: candidate.inviteId } }) : null;
    const staffInvite = candidate.staffInvitationId ? await prisma.staffInvitation.findUnique({ where: { id: candidate.staffInvitationId } }) : null;
    const available = staffInvite ? await staffInvitationAvailable(prisma, staffInvite, now)
      : Boolean(invite && !invite.acceptedAt && !invite.revokedAt && !await invitationEmailSuppressed(prisma, invite.recipientEmail));
    if (!available) {
      await prisma.waitlistDelivery.updateMany({ where: owned, data: { status: "CANCELED", leaseId: null, lockedAt: null } });
      continue;
    }
    try {
      const message = decryptIntegrationCredentials<TransactionalEmail>(candidate.messageCiphertext);
      const result = await sendTransactionalEmail({ ...message, category: "INVITATION" }, { retryBefore: candidate.firstAttemptAt ? new Date(candidate.firstAttemptAt.getTime() + WAITLIST_RETRY_WINDOW_MS) : undefined });
      if (!result.delivered) throw new Error("Email was not accepted.");
      await prisma.$transaction(async tx => {
        // Grant changes lock before touching grant/outbox rows. Match that order
        // so a concurrent revocation cannot deadlock receipt recording.
        await lockStaff(tx); await lockAccess(tx);
        const recorded = await tx.waitlistDelivery.updateMany({ where: owned, data: { status: "SENT", providerId: result.providerId, emailMessageId: result.messageId, firstAttemptAt: candidate.firstAttemptAt ?? result.firstAttemptAt ?? now, lastError: null, leaseId: null, lockedAt: null } });
        if (recorded.count !== 1) {
          // A stop/bounce event can cancel the item while the provider is accepting it.
          // Preserve that cancellation while retaining the provider's acceptance receipt.
          await tx.waitlistDelivery.updateMany({ where: { id: candidate.id, generation: candidate.generation, messageCiphertext: candidate.messageCiphertext, status: "CANCELED" }, data: { providerId: result.providerId, emailMessageId: result.messageId, firstAttemptAt: candidate.firstAttemptAt ?? result.firstAttemptAt ?? now } });
          return;
        }
        if (candidate.inviteId) await tx.referralAccessInvite.updateMany({ where: { id: candidate.inviteId }, data: { lastSentAt: new Date() } });
        if (candidate.staffInvitationId) await tx.staffInvitation.updateMany({ where: { id: candidate.staffInvitationId }, data: { lastSentAt: new Date() } });
      });
      sent++;
    } catch (error) {
      if (error instanceof EmailDeliveryError && ["BUDGET", "SUPPRESSED", "REVIEW", "MISMATCH"].includes(error.code)) {
        await prisma.waitlistDelivery.updateMany({ where: owned, data: {
          status: error.code === "BUDGET" ? "QUEUED" : error.code === "SUPPRESSED" ? "CANCELED" : "REVIEW",
          nextAttemptAt: error.retryAt ?? now, leaseId: null, lockedAt: null,
          firstAttemptAt: candidate.firstAttemptAt ?? error.firstAttemptAt,
          ...(!error.attempted ? { attempts: { decrement: 1 } } : {}),
          lastError: error.message
        } });
        continue;
      }
      // Provider errors can contain recipient data. Keep only this safe operational summary.
      await prisma.waitlistDelivery.updateMany({ where: owned, data: {
        status: candidate.attempts + 1 >= 8 ? "REVIEW" : "QUEUED", leaseId: null, lockedAt: null,
        firstAttemptAt: candidate.firstAttemptAt ?? (error instanceof EmailDeliveryError ? error.firstAttemptAt : null) ?? now,
        nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** candidate.attempts) * 60_000),
        lastError: "Email acceptance could not be confirmed. Retries use the same invitation and delivery key."
      } });
    }
  }
  return sent;
}
