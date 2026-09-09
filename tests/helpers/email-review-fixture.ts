import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/prisma";
import { emailMessageId, emailRecipientHash } from "../../src/lib/email-budget";
import { encryptIntegrationCredentials } from "../../src/lib/integration-crypto";
import type { TransactionalEmail } from "../../src/lib/transactional-email";

export async function createEmailReviewFixture() {
  const id = `email-review-${randomUUID()}`, email = `${id}@example.test`, password = "Email-review-fixture-strong-42";
  const user = await prisma.user.create({ data: { email: `actor-${email}`, name: "Email operator", passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date(), staffMembership: { create: { role: "OWNER" } } } });
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaCredential.create({ data: { userId: user.id, enabledAt: new Date(), secretCiphertext: "test-only-email-review" } });
  await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  const eventIds: string[] = [];
  async function invitation(accepted = true) {
    const invite = await prisma.referralAccessInvite.create({ data: { recipientEmail: email, source: "WAITLIST_MANUAL", tokenHash: randomUUID(), tokenCiphertext: "test-token-not-for-redemption" } });
    const message: TransactionalEmail = { from: "sender@example.test", replyTo: null, to: email, subject: "SECRET_INVITATION_SUBJECT", text: "SECRET_ACCESS_URL_DO_NOT_EXPOSE", html: "<p>SECRET_ACCESS_URL_DO_NOT_EXPOSE</p>", idempotencyKey: `waitlist-invite-${invite.id}`, category: "INVITATION" };
    const body = JSON.stringify({ from: message.from, to: [email], subject: message.subject, text: message.text, html: message.html });
    const firstAttemptAt = new Date(Date.now() - 48 * 3600_000), acceptedAt = accepted ? new Date(firstAttemptAt.getTime() + 1000) : null;
    const record = await prisma.emailMessage.create({ data: { id: emailMessageId(message.idempotencyKey!), recipientHash: emailRecipientHash(email), payloadHash: createHash("sha256").update(body).digest("hex"), category: "INVITATION", firstAttemptAt, acceptedAt, providerId: accepted ? randomUUID() : null } });
    const delivery = await prisma.waitlistDelivery.create({ data: { inviteId: invite.id, status: "REVIEW", attempts: 8, firstAttemptAt, createdAt: firstAttemptAt, generationStartedAt: firstAttemptAt, messageCiphertext: encryptIntegrationCredentials(message), lastError: "Retry window expired." } });
    return { invite, delivery, record, message };
  }
  return { user, session, token, email, password, eventIds, invitation, actor: { actorUserId: user.id, actorSessionId: session.id }, async cleanup() {
    const entries = await prisma.waitlistEntry.findMany({ where: { email }, select: { id: true } });
    await prisma.waitlistAudit.deleteMany({ where: { entryId: { in: entries.map(row => row.id) } } });
    await prisma.referralAccessInvite.deleteMany({ where: { recipientEmail: email } });
    await prisma.staffInvitation.deleteMany({ where: { email } });
    await prisma.emailSuppression.deleteMany({ where: { email } });
    await prisma.waitlistEntry.deleteMany({ where: { email } });
    await prisma.verificationToken.deleteMany({ where: { email } });
    await prisma.emailMessage.deleteMany({ where: { recipientHash: emailRecipientHash(email) } });
    await prisma.emailProviderEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.platformAuditEvent.deleteMany({ where: { OR: [{ actorUserId: user.id }, { entityId: { in: eventIds } }] } });
    await prisma.adminMfaSession.deleteMany({ where: { userId: user.id } });
    await prisma.adminMfaCredential.deleteMany({ where: { userId: user.id } });
    await prisma.userPreference.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  } };
}
