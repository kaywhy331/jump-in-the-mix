import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockStaff } from "@/lib/staff-access";
import { lockAccess } from "@/lib/access-lock";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { assertEmailReviewer, EmailReviewError } from "@/lib/email-suppression-admin";
import { decryptIntegrationCredentials, encryptIntegrationCredentials } from "@/lib/integration-crypto";
import { recordedEmailAcceptance, preparedEmail, type TransactionalEmail } from "@/lib/transactional-email";
import { emailMessageId, emailRecipientHash } from "@/lib/email-budget";
import { verifyProviderInvitation, validProviderEmailId } from "@/lib/email-provider-recovery";
import { reconcileEmailEvents } from "@/lib/email-events";
import { invitationEmailSuppressed } from "@/lib/invitation-preferences";
import { staffInvitationAvailable } from "@/lib/staff-invitation-state";
import { waitlistSendingReady } from "@/lib/waitlist";

type Review = { actorUserId: string; actorSessionId: string; deliveryId: string; expectedUpdatedAt: string; reason: string };
function validate(input: Review) {
  const expected = new Date(input.expectedUpdatedAt), reason = input.reason.trim();
  if (!input.deliveryId || input.deliveryId.length > 100 || !Number.isFinite(expected.getTime()) || expected.toISOString() !== input.expectedUpdatedAt || reason.length < 10 || reason.length > 500) throw new EmailReviewError("Choose a current review record and give a reason of 10–500 characters.");
  return { expected, reason };
}
async function review(tx: Prisma.TransactionClient, input: Review, password?: string) {
  await lockStaff(tx); await lockAccess(tx); await assertEmailReviewer(tx, input, password);
  const { expected } = validate(input);
  const delivery = await tx.waitlistDelivery.findUnique({ where: { id: input.deliveryId } });
  if (!delivery || !(password === undefined ? ["REVIEW"] : ["REVIEW", "SENT"]).includes(delivery.status) || delivery.leaseId || delivery.lockedAt || delivery.updatedAt.getTime() !== expected.getTime()) throw new EmailReviewError("This delivery changed. Reload its review before continuing.");
  const staff = await tx.staffMembership.findUnique({ where: { userId: input.actorUserId } });
  if (!hasAdminPermission(staff, delivery.staffInvitationId ? "staff.manage" : "access.read") || password !== undefined && !delivery.staffInvitationId && !hasAdminPermission(staff, "jobs.retry")) throw new EmailReviewError("Your current staff access does not include this invitation operation.");
  if (delivery.payloadPurgedAt) throw new EmailReviewError("This invitation is no longer usable and its private email content has expired.");
  let message: TransactionalEmail;
  try { message = decryptIntegrationCredentials<TransactionalEmail>(delivery.messageCiphertext); }
  catch { throw new EmailReviewError("The frozen invitation could not be read. Keep this delivery in review."); }
  if (!message.idempotencyKey || message.idempotencyKey.length > 256 || typeof message.from !== "string" || message.replyTo === undefined || typeof message.to !== "string" || typeof message.subject !== "string" || typeof message.html !== "string" || typeof message.text !== "string") throw new EmailReviewError("The frozen invitation is incomplete. Keep this delivery in review.");
  const prepared = preparedEmail({ ...message, category: "INVITATION" });
  const messageId = emailMessageId(message.idempotencyKey);
  const record = await tx.emailMessage.findUnique({ where: { id: messageId } });
  if (record?.detailsRetiredAt) throw new EmailReviewError("This delivery’s private details have expired and cannot be restored through receipt recovery.");
  if (record && (record.payloadHash !== prepared.payloadHash || record.recipientHash !== emailRecipientHash(prepared.email) || record.category !== "INVITATION")) throw new EmailReviewError("The frozen invitation does not match its send ledger. Keep this delivery in review.");
  if (delivery.emailMessageId && delivery.emailMessageId !== messageId || delivery.providerId && record?.providerId !== delivery.providerId) throw new EmailReviewError("The invitation’s recorded receipts conflict. Keep this delivery in review.");
  return { delivery, message, messageId, record, prepared };
}

export async function recoverInvitationReceipt(input: Review & { providerId?: string }) {
  const { expected, reason } = validate(input);
  let verified: Awaited<ReturnType<typeof verifyProviderInvitation>> | undefined;
  if (input.providerId !== undefined) {
    if (!validProviderEmailId(input.providerId)) throw new EmailReviewError("Enter the provider’s email record ID, not a URL.");
    const snapshot = await prisma.$transaction(async tx => {
      const state = await review(tx, input);
      if (!state.record) throw new EmailReviewError("No matching send ledger exists. Keep this delivery in review.");
      await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "email.invitation.provider-check", entityType: "WaitlistDelivery", entityId: input.deliveryId, reason, afterData: { providerId: input.providerId!, generation: state.delivery.generation } } });
      return { message: state.message, firstAttemptAt: state.record.firstAttemptAt };
    });
    // Do not hold database locks during provider I/O. Review authority and the
    // exact outbox version again before importing anything from the response.
    verified = await verifyProviderInvitation(input.providerId, snapshot.message, snapshot.firstAttemptAt);
  }
  return prisma.$transaction(async tx => {
    const { delivery, message, record } = await review(tx, input);
    if (verified) {
      if (!record || record.providerId && record.providerId !== verified.providerId) throw new EmailReviewError("The provider receipt conflicts with the current send ledger.");
      const other = await tx.emailMessage.findUnique({ where: { providerId: verified.providerId }, select: { id: true } });
      if (other && other.id !== record.id) throw new EmailReviewError("This provider receipt already belongs to a different delivery.");
      const imported = await tx.emailMessage.update({ where: { id: record.id }, data: { providerId: verified.providerId, acceptedAt: record.acceptedAt ?? verified.acceptedAt } });
      await reconcileEmailEvents(tx, imported);
    }
    const receipt = await recordedEmailAcceptance({ ...message, category: "INVITATION" }, tx);
    if (!receipt?.providerId || !receipt.messageId) throw new EmailReviewError("No matching local acceptance receipt exists. Check the provider before deciding whether to send again.");
    const changed = await tx.waitlistDelivery.updateMany({ where: { id: delivery.id, generation: delivery.generation, status: "REVIEW", leaseId: null, lockedAt: null, updatedAt: expected }, data: { status: "SENT", providerId: receipt.providerId, emailMessageId: receipt.messageId, firstAttemptAt: receipt.firstAttemptAt, lastError: null } });
    if (!changed.count) throw new EmailReviewError("This delivery changed. Reload its review.");
    if (delivery.inviteId) await tx.referralAccessInvite.updateMany({ where: { id: delivery.inviteId, lastSentAt: null }, data: { lastSentAt: receipt.acceptedAt } });
    if (delivery.staffInvitationId) await tx.staffInvitation.updateMany({ where: { id: delivery.staffInvitationId, lastSentAt: null }, data: { lastSentAt: receipt.acceptedAt } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "email.invitation.receipt-recovered", entityType: "WaitlistDelivery", entityId: delivery.id, reason, afterData: { emailMessageId: receipt.messageId, providerId: receipt.providerId, generation: delivery.generation, providerVerified: Boolean(verified), sentAgain: false } } });
    return { recovered: true };
  });
}

export async function repeatInvitationDelivery(input: Review & { password: string; providerReference: string; requestReference: string; providerReviewed: boolean; recipientRequested: boolean; duplicateRiskAccepted: boolean }) {
  const { expected, reason } = validate(input);
  if (typeof input.password !== "string" || !input.password || input.password.length > 72) throw new EmailReviewError("Enter your current administrator password.");
  const providerReference = input.providerReference.trim(), requestReference = input.requestReference.trim();
  if (providerReference.length < 5 || providerReference.length > 200 || requestReference.length < 5 || requestReference.length > 200 || input.providerReviewed !== true || input.recipientRequested !== true || input.duplicateRiskAccepted !== true) throw new EmailReviewError("Record the provider investigation and recipient request, and acknowledge that another email may arrive.");
  if (!waitlistSendingReady()) throw new EmailReviewError("Invitation sending is not configured for this environment.");
  return prisma.$transaction(async tx => {
    const { delivery, message, messageId, record, prepared } = await review(tx, input, input.password);
    const now = new Date();
    const since = Math.max(delivery.generationStartedAt.getTime(), delivery.firstAttemptAt?.getTime() ?? 0, record?.firstAttemptAt.getTime() ?? 0);
    if (now.getTime() - since < 24 * 3600_000) throw new EmailReviewError("Wait at least 24 hours after this delivery began. Use the existing safe retry within its original window.");
    const staffInvite = delivery.staffInvitationId ? await tx.staffInvitation.findUnique({ where: { id: delivery.staffInvitationId } }) : null;
    const invite = delivery.inviteId ? await tx.referralAccessInvite.findUnique({ where: { id: delivery.inviteId }, include: { inviter: { select: { suspendedAt: true, emailVerifiedAt: true } } } }) : null;
    const available = staffInvite ? staffInvite.email === prepared.email && await staffInvitationAvailable(tx, staffInvite, now)
      : invite && invite.recipientEmail === prepared.email && !invite.acceptedAt && !invite.revokedAt && (!invite.inviterUserId || invite.inviter?.emailVerifiedAt && !invite.inviter.suspendedAt) && !await tx.user.findUnique({ where: { email: invite.recipientEmail }, select: { id: true } }) && !await invitationEmailSuppressed(tx, invite.recipientEmail);
    if (!available || record && (record.bouncedAt || record.complainedAt || record.suppressedAt || record.failedAt)) throw new EmailReviewError("This invitation is no longer eligible to send. Resolve the recipient or account issue first.");
    // Archive metadata before changing the current generation. Actual API attempts
    // and receipts remain in the email ledger and continue consuming the budget.
    await tx.invitationDeliveryHistory.create({ data: { deliveryId: delivery.id, generation: delivery.generation, emailMessageId: messageId, status: delivery.status, attempts: delivery.attempts, firstAttemptAt: delivery.firstAttemptAt ?? record?.firstAttemptAt, generationStartedAt: delivery.generationStartedAt, providerId: delivery.providerId ?? record?.providerId } });
    const nextMessage = { ...message, idempotencyKey: `invitation-repeat-${randomUUID()}` };
    const changed = await tx.waitlistDelivery.updateMany({ where: { id: delivery.id, generation: delivery.generation, updatedAt: expected, status: delivery.status, leaseId: null, lockedAt: null }, data: { generation: { increment: 1 }, generationStartedAt: now, status: "QUEUED", nextAttemptAt: now, attempts: 0, firstAttemptAt: null, providerId: null, emailMessageId: null, lastError: null, messageCiphertext: encryptIntegrationCredentials(nextMessage) } });
    if (!changed.count) throw new EmailReviewError("This delivery changed. Reload its review.");
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "email.invitation.repeat-approved", entityType: "WaitlistDelivery", entityId: delivery.id, reason, beforeData: { generation: delivery.generation, emailMessageId: messageId }, afterData: { generation: delivery.generation + 1, emailMessageId: emailMessageId(nextMessage.idempotencyKey), providerReference, requestReference, providerReviewed: true, recipientRequested: true, duplicateRiskAccepted: true, additionalInviteSlots: 0 } } });
    return { queued: true };
  });
}
