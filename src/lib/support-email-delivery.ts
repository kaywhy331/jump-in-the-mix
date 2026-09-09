import { randomUUID } from "node:crypto";
import type { Prisma, SupportEmailDelivery, SupportTicket, SupportTicketMessage } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { lockStaff } from "@/lib/staff-access";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { lockSupportTicket, SupportAccessError } from "@/lib/support-case-access";
import { buildSupportReplyEmail } from "@/lib/support-email";
import { decryptIntegrationCredentials, encryptIntegrationCredentials } from "@/lib/integration-crypto";
import { EMAIL_RETRY_WINDOW_MS, emailMessageId } from "@/lib/email-budget";
import { EmailDeliveryError } from "@/lib/email-errors";
import { recordedEmailAcceptance, sendTransactionalEmail, transactionalEmailConfigured, type TransactionalEmail } from "@/lib/transactional-email";

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
export const SUPPORT_EMAIL_REVIEW = "Email acceptance is uncertain. Review the saved receipt or provider history before another send.";
export const supportDeliveryKey = (messageId: string, generation: number) => `support-reply-${messageId}-${generation}`;

export function frozenSupportEmail(delivery: SupportEmailDelivery): TransactionalEmail {
  const email = decryptIntegrationCredentials<TransactionalEmail>(delivery.messageCiphertext);
  if (email.idempotencyKey !== supportDeliveryKey(delivery.messageId, delivery.generation) || emailMessageId(email.idempotencyKey) !== delivery.emailMessageId || email.category !== "PRODUCT" || typeof email.from !== "string" || !email.from || typeof email.to !== "string" || !email.to || typeof email.subject !== "string" || typeof email.text !== "string" || typeof email.html !== "string" || !(email.replyTo === null || typeof email.replyTo === "string")) throw new SupportAccessError("This saved email cannot be verified. Keep it in review.");
  return email;
}

export async function currentSupportRecipient(tx: Prisma.TransactionClient, ticket: SupportTicket) {
  const user = await tx.user.findUnique({ where: { id: ticket.requesterUserId }, select: { email: true, name: true, emailVerifiedAt: true, suspendedAt: true } });
  if (!user?.emailVerifiedAt || user.suspendedAt || !await tx.workspaceMember.findFirst({ where: { workspaceId: ticket.workspaceId, userId: ticket.requesterUserId }, select: { id: true } })) throw new SupportAccessError("The requester needs an active account, confirmed email, and access to this workspace before receiving a notification.");
  return user;
}

// The caller holds the staff and ticket locks. The reply and this outbox entry
// commit together; neither web actions nor this preparation function send mail.
export async function queueSupportReplyEmail(tx: Prisma.TransactionClient, ticket: SupportTicket, message: SupportTicketMessage, issuerUserId: string, generation = 1, previous?: TransactionalEmail) {
  const issuer = await tx.staffMembership.findUniqueOrThrow({ where: { userId: issuerUserId } });
  let email: TransactionalEmail | null = null;
  let problem: string | null = null;
  try {
    const recipient = await currentSupportRecipient(tx, ticket);
    if (!env.emailFrom) throw new SupportAccessError("Configure the support email sender, then review this notification. The reply is available in the ticket.");
    if (previous && previous.to !== recipient.email.trim().toLowerCase()) throw new SupportAccessError("The requester’s email changed. Add a new response after reviewing their current address.");
    email = { ...(previous ?? buildSupportReplyEmail({ to: recipient.email.trim().toLowerCase(), recipientName: recipient.name, ticketId: ticket.id, reference: ticket.reference, title: ticket.title, responseBody: message.body })), from: previous?.from ?? env.emailFrom, replyTo: previous ? previous.replyTo : env.emailReplyTo || null, category: "PRODUCT", idempotencyKey: supportDeliveryKey(message.id, generation) };
  } catch (error) {
    if (!(error instanceof SupportAccessError)) throw error;
    problem = error.message;
  }
  // Encryption failure aborts the transaction rather than committing plaintext.
  const delivery = await tx.supportEmailDelivery.create({ data: {
    messageId: message.id, generation, issuerUserId, issuerRevision: issuer.revision,
    messageCiphertext: email ? encryptIntegrationCredentials(email) : "",
    emailMessageId: emailMessageId(supportDeliveryKey(message.id, generation)),
    status: email ? "QUEUED" : "REVIEW", lastError: problem
  } });
  await tx.supportTicketMessage.update({ where: { id: message.id }, data: { emailStatus: email ? "PENDING" : "FAILED", emailError: problem, emailProviderId: null, emailSentAt: null } });
  return delivery;
}

export async function setSupportDeliveryState(tx: Prisma.TransactionClient, delivery: SupportEmailDelivery, data: Prisma.SupportEmailDeliveryUpdateInput) {
  const updated = await tx.supportEmailDelivery.update({ where: { id: delivery.id }, data: { ...data, leaseId: null, leaseUntil: null } });
  const latest = await tx.supportEmailDelivery.findFirst({ where: { messageId: delivery.messageId }, orderBy: { generation: "desc" }, select: { id: true } });
  if (latest?.id === delivery.id) await tx.supportTicketMessage.update({ where: { id: delivery.messageId }, data: {
    emailStatus: updated.status === "SENT" ? "SENT" : updated.status === "QUEUED" ? "PENDING" : updated.status === "CANCELED" ? "NOT_REQUESTED" : "FAILED",
    emailProviderId: updated.providerId, emailSentAt: updated.acceptedAt, emailError: updated.lastError
  } });
  return updated;
}

async function claim(deliveryId: string) {
  return prisma.$transaction(async tx => {
    await lockStaff(tx);
    const selected = await tx.supportEmailDelivery.findUnique({ where: { id: deliveryId }, include: { message: { select: { ticketId: true } } } });
    if (!selected) return null;
    const ticket = await lockSupportTicket(tx, selected.message.ticketId);
    const delivery = await tx.supportEmailDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    const now = new Date();
    if (!(delivery.status === "QUEUED" && delivery.availableAt <= now || delivery.status === "SENDING" && delivery.leaseUntil && delivery.leaseUntil <= now)) return null;
    const latest = await tx.supportEmailDelivery.findFirst({ where: { messageId: delivery.messageId }, orderBy: { generation: "desc" }, select: { id: true } });
    if (latest?.id !== delivery.id) { await setSupportDeliveryState(tx, delivery, { status: "CANCELED", lastError: "A reviewed replacement notification exists." }); return null; }
    let email: TransactionalEmail;
    try { email = frozenSupportEmail(delivery); }
    catch { await setSupportDeliveryState(tx, delivery, { status: "REVIEW", lastError: "The saved email could not be decrypted or verified. Check the encryption configuration before recovery." }); return null; }
    // Acceptance is a recorded fact even if account access changed afterwards.
    const receipt = await recordedEmailAcceptance(email, tx);
    if (receipt) { await setSupportDeliveryState(tx, delivery, { status: "SENT", providerId: receipt.providerId, acceptedAt: receipt.acceptedAt, firstAttemptAt: receipt.firstAttemptAt, lastError: null }); return null; }
    const record = await tx.emailMessage.findUnique({ where: { id: delivery.emailMessageId } });
    const firstAttemptAt = record?.firstAttemptAt ?? delivery.firstAttemptAt;
    if (record?.detailsRetiredAt || firstAttemptAt && now.getTime() >= firstAttemptAt.getTime() + EMAIL_RETRY_WINDOW_MS || delivery.attempts >= MAX_ATTEMPTS) { await setSupportDeliveryState(tx, delivery, { status: "REVIEW", firstAttemptAt, lastError: SUPPORT_EMAIL_REVIEW }); return null; }
    try {
      const recipient = await currentSupportRecipient(tx, ticket);
      if (recipient.email.trim().toLowerCase() !== email.to) throw new SupportAccessError("The requester’s address changed. This saved notification will not be sent to the old address.");
      const issuer = await tx.user.findUnique({ where: { id: delivery.issuerUserId }, select: { emailVerifiedAt: true, suspendedAt: true, staffMembership: true } });
      if (!issuer?.emailVerifiedAt || issuer.suspendedAt || !hasAdminPermission(issuer.staffMembership, "support.manage") || issuer.staffMembership?.revision !== delivery.issuerRevision) throw new SupportAccessError("The approving staff member’s access changed. A current administrator must review this notification.");
    } catch (error) {
      if (!(error instanceof SupportAccessError)) throw error;
      await setSupportDeliveryState(tx, delivery, { status: "REVIEW", firstAttemptAt, lastError: error.message }); return null;
    }
    if (!transactionalEmailConfigured()) { await setSupportDeliveryState(tx, delivery, { status: "REVIEW", firstAttemptAt, lastError: "Email is not configured. No provider request was made; configure the sender and review this notification." }); return null; }
    const claimed = await tx.supportEmailDelivery.update({ where: { id: delivery.id }, data: { status: "SENDING", leaseId: randomUUID(), leaseUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 }, firstAttemptAt, lastError: null } });
    return { delivery: claimed, email, ticketId: ticket.id, retryBefore: new Date((firstAttemptAt ?? now).getTime() + EMAIL_RETRY_WINDOW_MS) };
  });
}

async function finish(claimed: NonNullable<Awaited<ReturnType<typeof claim>>>, result: Awaited<ReturnType<typeof sendTransactionalEmail>> | null, failure: unknown) {
  await prisma.$transaction(async tx => {
    await lockStaff(tx);
    if (!await tx.supportTicket.findUnique({ where: { id: claimed.ticketId }, select: { id: true } })) return;
    await lockSupportTicket(tx, claimed.ticketId);
    const delivery = await tx.supportEmailDelivery.findUnique({ where: { id: claimed.delivery.id } });
    // An expired worker can record provider acceptance in the shared ledger, but
    // cannot finish a successor's lease or change a reviewed generation.
    if (!delivery || delivery.status !== "SENDING" || delivery.leaseId !== claimed.delivery.leaseId) return;
    const receipt = await recordedEmailAcceptance(claimed.email, tx);
    if (receipt) { await setSupportDeliveryState(tx, delivery, { status: "SENT", providerId: receipt.providerId, acceptedAt: receipt.acceptedAt, firstAttemptAt: receipt.firstAttemptAt, lastError: null }); return; }
    const ledger = await tx.emailMessage.findUnique({ where: { id: delivery.emailMessageId }, select: { firstAttemptAt: true } });
    const firstAttemptAt = ledger?.firstAttemptAt ?? delivery.firstAttemptAt;
    const now = new Date();
    const outOfWindow = firstAttemptAt && now.getTime() >= firstAttemptAt.getTime() + EMAIL_RETRY_WINDOW_MS;
    const budget = failure instanceof EmailDeliveryError && failure.code === "BUDGET";
    const attempts = budget && !failure.attempted ? Math.max(0, delivery.attempts - 1) : delivery.attempts;
    const needsReview = outOfWindow || attempts >= MAX_ATTEMPTS || result?.delivered === false || failure instanceof EmailDeliveryError && ["SUPPRESSED", "REVIEW", "MISMATCH"].includes(failure.code);
    await setSupportDeliveryState(tx, delivery, {
      status: needsReview ? "REVIEW" : "QUEUED", firstAttemptAt, attempts,
      availableAt: budget && failure.retryAt ? failure.retryAt : new Date(now.getTime() + Math.min(3600_000, 60_000 * 2 ** attempts)),
      lastError: needsReview ? failure instanceof EmailDeliveryError && failure.code === "SUPPRESSED" ? "The recipient has a provider block. Review Email operations before another send." : SUPPORT_EMAIL_REVIEW : budget ? "Waiting for shared email capacity. The worker will retry." : "Provider acceptance was not confirmed. The worker will retry the same saved email and key."
    });
  });
}

export async function deliverSupportEmails(limit = 10) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new Error("Invalid support email batch size.");
  const now = new Date();
  const candidates = await prisma.supportEmailDelivery.findMany({ where: { OR: [{ status: "QUEUED", availableAt: { lte: now } }, { status: "SENDING", leaseUntil: { lte: now } }] }, orderBy: [{ availableAt: "asc" }, { id: "asc" }], select: { id: true }, take: limit });
  let attempted = 0;
  for (const candidate of candidates) {
    const claimed = await claim(candidate.id);
    if (!claimed) continue;
    let result: Awaited<ReturnType<typeof sendTransactionalEmail>> | null = null;
    let failure: unknown;
    try { result = await sendTransactionalEmail(claimed.email, { retryBefore: claimed.retryBefore }); }
    catch (error) { failure = error; }
    await finish(claimed, result, failure);
    attempted++;
  }
  return attempted;
}
