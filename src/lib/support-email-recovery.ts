import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockStaff } from "@/lib/staff-access";
import { lockAccess } from "@/lib/access-lock";
import { assertSupportActor, lockSupportTicket, type SupportActor } from "@/lib/support-case-access";
import { assertEmailReviewer, EmailReviewError } from "@/lib/email-suppression-admin";
import { EMAIL_RETRY_WINDOW_MS, emailRecipientHash } from "@/lib/email-budget";
import { preparedEmail, recordedEmailAcceptance, transactionalEmailConfigured } from "@/lib/transactional-email";
import { verifyProviderInvitation } from "@/lib/email-provider-recovery";
import { reconcileEmailEvents } from "@/lib/email-events";
import { currentSupportRecipient, frozenSupportEmail, queueSupportReplyEmail, setSupportDeliveryState } from "@/lib/support-email-delivery";

export type SupportEmailReview = SupportActor & { ticketId: string; deliveryId: string; expectedUpdatedAt: string; reason: string };

async function review(tx: Prisma.TransactionClient, input: SupportEmailReview, password?: string, receiptOnly = false) {
  const expected = new Date(input.expectedUpdatedAt), reason = input.reason.trim();
  if (!input.deliveryId || input.deliveryId.length > 100 || !Number.isFinite(expected.getTime()) || expected.toISOString() !== input.expectedUpdatedAt || reason.length < 10 || reason.length > 500) throw new EmailReviewError("Reload this notification and give a reason of 10–500 characters.");
  await lockStaff(tx); await lockAccess(tx); await assertSupportActor(tx, input);
  if (password !== undefined || receiptOnly) await assertEmailReviewer(tx, input, password);
  const ticket = await lockSupportTicket(tx, input.ticketId);
  const delivery = await tx.supportEmailDelivery.findUnique({ where: { id: input.deliveryId }, include: { message: true } });
  if (!delivery || delivery.message.ticketId !== ticket.id || delivery.updatedAt.getTime() !== expected.getTime() || delivery.leaseId || !["REVIEW", ...(password !== undefined ? ["SENT"] : [])].includes(delivery.status)) throw new EmailReviewError("This notification changed. Reload the ticket before continuing.");
  const latest = await tx.supportEmailDelivery.findFirst({ where: { messageId: delivery.messageId }, orderBy: { generation: "desc" }, select: { id: true } });
  if (latest?.id !== delivery.id) throw new EmailReviewError("A newer notification exists. Reload the ticket.");
  return { ticket, delivery, reason };
}

async function saved(tx: Prisma.TransactionClient, delivery: Parameters<typeof frozenSupportEmail>[0]) {
  if (!delivery.messageCiphertext) throw new EmailReviewError("This older notification has no frozen content. Review its history and add a new response if the customer still needs an email.");
  const message = frozenSupportEmail(delivery);
  const prepared = preparedEmail(message);
  const record = await tx.emailMessage.findUnique({ where: { id: delivery.emailMessageId } });
  if (record && (record.detailsRetiredAt || record.payloadHash !== prepared.payloadHash || record.recipientHash !== emailRecipientHash(prepared.email) || record.category !== "PRODUCT" || delivery.providerId && record.providerId !== delivery.providerId)) throw new EmailReviewError("The saved content and delivery ledger do not match. Keep this notification in review.");
  return { message, record };
}

async function eligible(tx: Prisma.TransactionClient, ticket: Parameters<typeof currentSupportRecipient>[1], email: string) {
  const recipient = await currentSupportRecipient(tx, ticket);
  if (recipient.email.trim().toLowerCase() !== email) throw new EmailReviewError("The requester’s email changed. Review their current address and add a new response instead.");
  if (await tx.emailSuppression.findFirst({ where: { email, clearedAt: null, reason: { not: "INVITATION_OPTOUT" } }, select: { id: true } })) throw new EmailReviewError("The recipient has a provider block. Review Email operations before another send.");
  if (!transactionalEmailConfigured()) throw new EmailReviewError("Configure transactional email before queueing a notification.");
}

export async function retrySupportEmail(input: SupportEmailReview) {
  return prisma.$transaction(async tx => {
    const { ticket, delivery, reason } = await review(tx, input);
    const { message, record } = await saved(tx, delivery);
    const receipt = await recordedEmailAcceptance(message, tx);
    if (receipt) {
      await setSupportDeliveryState(tx, delivery, { status: "SENT", providerId: receipt.providerId, acceptedAt: receipt.acceptedAt, firstAttemptAt: receipt.firstAttemptAt, lastError: null });
    } else {
      const first = record?.firstAttemptAt ?? delivery.firstAttemptAt;
      if (delivery.attempts >= 5 || first && Date.now() >= first.getTime() + EMAIL_RETRY_WINDOW_MS) throw new EmailReviewError("The automatic retry limit or safe retry window ended. Check the provider receipt or approve a reviewed replacement.");
      await eligible(tx, ticket, message.to);
      const issuer = await tx.staffMembership.findUniqueOrThrow({ where: { userId: input.actorUserId } });
      await setSupportDeliveryState(tx, delivery, { status: "QUEUED", firstAttemptAt: first, availableAt: new Date(), issuerUserId: input.actorUserId, issuerRevision: issuer.revision, lastError: null });
    }
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: receipt ? "support.email.receipt-recovered" : "support.email.retry-requested", entityType: "SupportEmailDelivery", entityId: delivery.id, reason, afterData: { ticketId: ticket.id, generation: delivery.generation, sentAgain: false } } });
    return { recovered: Boolean(receipt) };
  });
}

export async function recoverSupportEmailReceipt(input: SupportEmailReview & { providerId?: string }) {
  let verified: Awaited<ReturnType<typeof verifyProviderInvitation>> | undefined;
  if (input.providerId) {
    const snapshot = await prisma.$transaction(async tx => {
      const { delivery, reason } = await review(tx, input, undefined, true);
      const state = await saved(tx, delivery);
      if (!state.record) throw new EmailReviewError("There is no original send ledger to match with the provider.");
      await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "support.email.provider-check", entityType: "SupportEmailDelivery", entityId: delivery.id, reason, afterData: { providerId: input.providerId!, generation: delivery.generation } } });
      return { message: state.message, firstAttemptAt: state.record.firstAttemptAt };
    });
    verified = await verifyProviderInvitation(input.providerId, snapshot.message, snapshot.firstAttemptAt);
  }
  // Provider I/O is outside the transaction. Recheck both authority and version.
  return prisma.$transaction(async tx => {
    const { delivery, reason } = await review(tx, input, undefined, Boolean(input.providerId));
    const { message, record } = await saved(tx, delivery);
    if (verified) {
      if (!record || record.providerId && record.providerId !== verified.providerId) throw new EmailReviewError("This provider receipt conflicts with the current ledger.");
      const other = await tx.emailMessage.findUnique({ where: { providerId: verified.providerId }, select: { id: true } });
      if (other && other.id !== record.id) throw new EmailReviewError("This receipt belongs to another email.");
      const imported = await tx.emailMessage.update({ where: { id: record.id }, data: { providerId: verified.providerId, acceptedAt: record.acceptedAt ?? verified.acceptedAt } });
      await reconcileEmailEvents(tx, imported);
    }
    const receipt = await recordedEmailAcceptance(message, tx);
    if (!receipt) throw new EmailReviewError("No matching acceptance receipt was found. No email was sent.");
    await setSupportDeliveryState(tx, delivery, { status: "SENT", providerId: receipt.providerId, acceptedAt: receipt.acceptedAt, firstAttemptAt: receipt.firstAttemptAt, lastError: null });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "support.email.receipt-recovered", entityType: "SupportEmailDelivery", entityId: delivery.id, reason, afterData: { generation: delivery.generation, providerVerified: Boolean(verified), sentAgain: false } } });
  });
}

export async function repeatSupportEmail(input: SupportEmailReview & { password: string; providerReference: string; requestReference: string; providerReviewed: boolean; recipientRequested: boolean; duplicateRiskAccepted: boolean }) {
  const providerReference = input.providerReference.trim(), requestReference = input.requestReference.trim();
  if (!input.password || input.password.length > 72 || providerReference.length < 5 || providerReference.length > 200 || requestReference.length < 5 || requestReference.length > 200 || input.providerReviewed !== true || input.recipientRequested !== true || input.duplicateRiskAccepted !== true) throw new EmailReviewError("Record the provider investigation and customer request, acknowledge a possible duplicate, and enter your current password.");
  return prisma.$transaction(async tx => {
    const { ticket, delivery, reason } = await review(tx, input, input.password);
    const { message, record } = await saved(tx, delivery);
    const since = Math.max(delivery.createdAt.getTime(), delivery.firstAttemptAt?.getTime() ?? 0, record?.firstAttemptAt.getTime() ?? 0);
    if (Date.now() - since < 24 * 3600_000) throw new EmailReviewError("Wait at least 24 hours after this notification began. Use its original safe retry when available.");
    await eligible(tx, ticket, message.to);
    if (record && (record.bouncedAt || record.complainedAt || record.suppressedAt || record.failedAt)) throw new EmailReviewError("The provider recorded a delivery problem. Resolve it before preparing a new customer response.");
    const next = await queueSupportReplyEmail(tx, ticket, delivery.message, input.actorUserId, delivery.generation + 1, message);
    if (next.status !== "QUEUED") throw new EmailReviewError("The notification could not be prepared. Review the current account and sender settings.");
    // Keep the old generation and its ledger untouched; the next queue entry has
    // the identical recipient/content with a deliberately new delivery key.
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "support.email.repeat-approved", entityType: "SupportEmailDelivery", entityId: delivery.id, reason, afterData: { nextDeliveryId: next.id, generation: next.generation, providerReference, requestReference, providerReviewed: true, recipientRequested: true, duplicateRiskAccepted: true } } });
    return next;
  });
}

export async function cancelSupportEmail(input: SupportEmailReview) {
  return prisma.$transaction(async tx => {
    const { delivery, reason } = await review(tx, input);
    await setSupportDeliveryState(tx, delivery, { status: "CANCELED", lastError: "No further notification is queued. The response remains in the ticket; this does not retract an email already accepted by the provider." });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "support.email.cancel", entityType: "SupportEmailDelivery", entityId: delivery.id, reason, afterData: { generation: delivery.generation } } });
  });
}
