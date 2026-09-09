import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";
import { runDataRetention } from "../src/lib/data-retention";
import { emailMessageId, emailRecipientHash, readEmailBudget, reserveEmailAttempt } from "../src/lib/email-budget";
import { receiveEmailProviderEvent, recordEmailAcceptance } from "../src/lib/email-events";
import { reopenSupportTicketRecord } from "../src/lib/support-service";
import { createSupportFixture } from "./helpers/support-fixture";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const DAY = 86_400_000;
describe.skipIf(!local)("bounded private-data retention on PostgreSQL", () => {
  let f: Awaited<ReturnType<typeof createSupportFixture>>, now: Date, prefix: string;
  let state: Awaited<ReturnType<typeof prisma.dataRetentionState.findUnique>>;
  let priorAuditIds: string[];
  const messages: string[] = [], grants: string[] = [], staffInvites: string[] = [], events: string[] = [];
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  beforeEach(async () => {
    now = new Date(); prefix = `retention-${randomUUID()}`;
    state = await prisma.dataRetentionState.findUnique({ where: { id: "primary" } });
    priorAuditIds = (await prisma.platformAuditEvent.findMany({ where: { action: "privacy.retention.complete" }, select: { id: true } })).map(row => row.id);
    f = await createSupportFixture();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.referralAccessInvite.deleteMany({ where: { id: { in: grants } } });
    await prisma.staffInvitation.deleteMany({ where: { id: { in: staffInvites } } });
    await prisma.emailMessage.deleteMany({ where: { id: { in: messages } } });
    await prisma.emailProviderEvent.deleteMany({ where: { id: { in: events } } });
    await prisma.emailSuppression.deleteMany({ where: { email: f.customer.user.email } });
    await prisma.waitlistEntry.deleteMany({ where: { email: { startsWith: prefix } } });
    await prisma.verificationToken.deleteMany({ where: { email: { startsWith: prefix } } });
    await prisma.platformAuditEvent.deleteMany({ where: { OR: [
      { action: "privacy.retention.complete", id: { notIn: priorAuditIds } },
      { entityType: "SupportTicket", entityId: f.ticket.id }, { entityType: "EmailProviderEvent", entityId: { in: events } }, { entityId: prefix }
    ] } });
    await prisma.dataRetentionState.deleteMany(); if (state) await prisma.dataRetentionState.create({ data: { ...state, counts: state.counts ?? Prisma.DbNull } });
    await f.cleanup(); messages.length = 0; grants.length = 0; staffInvites.length = 0; events.length = 0;
  });
  async function ledger(name: string, age: number, accepted = false) {
    const key = `${prefix}-${name}`, id = emailMessageId(key); messages.push(id);
    const row = await prisma.emailMessage.create({ data: { id, category: "INVITATION", recipientHash: emailRecipientHash(f.customer.user.email), payloadHash: "frozen-payload-hash", firstAttemptAt: ago(age), createdAt: ago(age), ...(accepted ? { providerId: randomUUID(), acceptedAt: ago(age), deliveredAt: ago(age) } : {}) } });
    return { ...row, key };
  }
  async function invitation(name: string, age: number, closed = false, status: "SENT" | "REVIEW" | "SENDING" = "SENT", messageId?: string) {
    const invite = await prisma.referralAccessInvite.create({ data: { inviterUserId: f.customer.user.id, workspaceId: f.workspace.id, recipientEmail: `${prefix}-${name}@example.test`, tokenHash: randomUUID(), tokenCiphertext: "PRIVATE_INVITATION_TOKEN", createdAt: ago(age), ...(closed ? { revokedAt: ago(age) } : {}) } }); grants.push(invite.id);
    const delivery = await prisma.waitlistDelivery.create({ data: { inviteId: invite.id, messageCiphertext: "PRIVATE_INVITATION_BODY", emailMessageId: messageId, status, createdAt: ago(age), updatedAt: ago(age), generationStartedAt: ago(age), ...(status === "SENDING" ? { leaseId: randomUUID(), lockedAt: now } : {}) } });
    return { invite, delivery };
  }
  async function event(name: string, age: number, providerId = randomUUID()) {
    const id = `${prefix}-${name}`; events.push(id);
    return prisma.emailProviderEvent.create({ data: { id, type: "email.delivered", providerId, recipientHashes: [emailRecipientHash(f.customer.user.email)], occurredAt: ago(age), receivedAt: ago(age) } });
  }
  async function oldTicket(age: number, status: "RESOLVED" | "CLOSED" | "OPEN" = "RESOLVED") {
    await prisma.supportTicketMessage.updateMany({ where: { ticketId: f.ticket.id }, data: { createdAt: ago(age) } });
    await prisma.supportTicket.update({ where: { id: f.ticket.id }, data: { status, createdAt: ago(age), lastActivityAt: ago(age), updatedAt: ago(age), resolvedAt: status === "OPEN" ? null : ago(age), closedAt: status === "CLOSED" ? ago(age) : null } });
  }
  it("keeps permanent key tombstones and receipt facts while removing old identifiers and preserving rolling budgets", async () => {
    const old = await ledger("old", 401, true), fresh = await ledger("fresh", 0);
    await prisma.emailSendAttempt.createMany({ data: [{ messageId: old.id, category: "INVITATION", createdAt: ago(401) }, { messageId: fresh.id, category: "AUTH", createdAt: ago(0.5) }] });
    const budget = await readEmailBudget(prisma, now);
    expect(await runDataRetention(now)).toMatchObject({ emailDetails: 1, emailAttempts: 1 });
    expect(await prisma.emailMessage.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ id: old.id, recipientHash: null, providerId: null, detailsRetiredAt: now, payloadHash: old.payloadHash, firstAttemptAt: old.firstAttemptAt, acceptedAt: old.acceptedAt, deliveredAt: old.deliveredAt });
    expect(await readEmailBudget(prisma, now)).toEqual(budget);
    const input = { key: old.key, email: f.customer.user.email, category: "INVITATION" as const, payloadHash: old.payloadHash };
    await expect(reserveEmailAttempt(input, new Date(old.firstAttemptAt.getTime() + 1000))).rejects.toThrow("retired");
    await expect(reserveEmailAttempt({ ...input, payloadHash: "changed" })).rejects.toThrow("changed content");
    await expect(recordEmailAcceptance(old.id, randomUUID())).rejects.toThrow("retired");
    expect(await prisma.emailSendAttempt.count({ where: { messageId: old.id } })).toBe(0);
  });
  it("preserves current and archived receipts for an active invitation, along with its secret URL and lifetime slot", async () => {
    const current = await ledger("current", 501, true), previous = await ledger("previous", 502, true);
    const { invite, delivery } = await invitation("active", 500, false, "SENT", current.id);
    await prisma.waitlistDelivery.update({ where: { id: delivery.id }, data: { generation: 2, updatedAt: ago(500) } });
    await prisma.invitationDeliveryHistory.create({ data: { deliveryId: delivery.id, generation: 1, emailMessageId: previous.id, status: "SENT", attempts: 1, generationStartedAt: ago(502), archivedAt: ago(500), providerId: previous.providerId } });
    expect(await runDataRetention(now)).toMatchObject({ invitationPayloads: 0, invitationTokens: 0, emailDetails: 0 });
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).tokenCiphertext).toBe("PRIVATE_INVITATION_TOKEN");
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).messageCiphertext).toBe("PRIVATE_INVITATION_BODY");
    expect(await prisma.referralAccessInvite.count({ where: { inviterUserId: f.customer.user.id } })).toBe(1);
    expect(await prisma.emailMessage.count({ where: { id: { in: [current.id, previous.id] }, detailsRetiredAt: null } })).toBe(2);
  });
  it("purges only unusable old invitation payloads and cannot revive a purged token or sending record", async () => {
    const old = await invitation("revoked", 31, true, "REVIEW"), edge = await invitation("edge", 30, true), leased = await invitation("leased", 31, true, "SENDING");
    expect(await runDataRetention(now)).toMatchObject({ invitationPayloads: 1, invitationTokens: 2 });
    expect(await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: old.delivery.id } })).toMatchObject({ status: "CANCELED", payloadPurgedAt: now, messageCiphertext: "" });
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: edge.delivery.id } })).payloadPurgedAt).toBeNull();
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: leased.delivery.id } })).payloadPurgedAt).toBeNull();
    expect(await prisma.referralAccessInvite.count({ where: { inviterUserId: f.customer.user.id } })).toBe(3);
    await expect(prisma.referralAccessInvite.update({ where: { id: old.invite.id }, data: { revokedAt: null } })).rejects.toThrow();
    await expect(prisma.waitlistDelivery.update({ where: { id: old.delivery.id }, data: { status: "QUEUED" } })).rejects.toThrow();
  });
  it("expires an old revoked staff payload even if its original expiry is later", async () => {
    const invite = await prisma.staffInvitation.create({ data: { email: `${prefix}@example.test`, role: "SUPPORT", issuerUserId: f.admin.user.id, issuerRevision: 1, tokenHash: randomUUID(), expiresAt: new Date(now.getTime() + DAY), revokedAt: ago(31), createdAt: ago(40) } }); staffInvites.push(invite.id);
    const delivery = await prisma.waitlistDelivery.create({ data: { staffInvitationId: invite.id, messageCiphertext: "PRIVATE_STAFF_INVITE", status: "CANCELED", createdAt: ago(40), updatedAt: ago(31), generationStartedAt: ago(40) } });
    expect((await runDataRetention(now)).invitationPayloads).toBe(1);
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).messageCiphertext).toBe("");
  });
  it("retains unassociated provider evidence for receipt recovery, then redacts it without permitting replay", async () => {
    const message = await ledger("uncertain", 45), receipt = await event("late", 31);
    expect((await runDataRetention(now)).providerDetails).toBe(0);
    await recordEmailAcceptance(message.id, receipt.providerId!);
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } })).deliveredAt).toEqual(receipt.occurredAt);
    expect((await runDataRetention(now)).providerDetails).toBe(1);
    expect(await prisma.emailProviderEvent.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({ detailsRetiredAt: now, providerId: null, recipientHashes: [] });
    expect(await receiveEmailProviderEvent(receipt.id, { type: "email.bounced", created_at: now.toISOString(), data: { email_id: receipt.providerId, to: [f.customer.user.email] } }, now)).toEqual({ duplicate: true });
    expect(await prisma.emailSuppression.count({ where: { email: f.customer.user.email } })).toBe(0);
    const freshId = `${prefix}-new-adverse`; events.push(freshId);
    await receiveEmailProviderEvent(freshId, { type: "email.bounced", created_at: now.toISOString(), data: { email_id: receipt.providerId, to: [f.customer.user.email] } }, now);
    expect(await prisma.emailSuppression.count({ where: { email: f.customer.user.email, clearedAt: null } })).toBe(1);
  });
  it("removes old legacy provider references even when their ledger no longer exists", async () => {
    const { delivery } = await invitation("legacy", 500, true);
    await prisma.waitlistDelivery.update({ where: { id: delivery.id }, data: { generation: 2, payloadPurgedAt: ago(401), messageCiphertext: "", updatedAt: ago(401), providerId: "PRIVATE_LEGACY_CURRENT" } });
    const history = await prisma.invitationDeliveryHistory.create({ data: { deliveryId: delivery.id, generation: 1, emailMessageId: `${prefix}-missing-ledger`, status: "SENT", attempts: 1, generationStartedAt: ago(500), archivedAt: ago(450), providerId: "PRIVATE_LEGACY_HISTORY" } });
    expect((await runDataRetention(now)).providerReferences).toBe(2);
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).providerId).toBeNull();
    expect((await prisma.invitationDeliveryHistory.findUniqueOrThrow({ where: { id: history.id } })).providerId).toBeNull();
  });
  it("bounds each batch and keeps exact age boundaries and recent activity", async () => {
    for (let i = 0; i < 5; i++) await event(`old-${i}`, 31);
    const edge = await event("edge", 30);
    const message = await ledger("recent-attempt", 401);
    // A different recipient avoids preserving these unrelated events for this uncertain send.
    await prisma.emailMessage.update({ where: { id: message.id }, data: { recipientHash: emailRecipientHash("different@example.test") } });
    await prisma.emailSendAttempt.create({ data: { messageId: message.id, category: "INVITATION", createdAt: ago(1) } });
    expect((await runDataRetention(now, 2)).providerDetails).toBe(2);
    expect((await runDataRetention(now, 2)).providerDetails).toBe(2);
    expect((await prisma.emailProviderEvent.findUniqueOrThrow({ where: { id: edge.id } })).detailsRetiredAt).toBeNull();
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } })).detailsRetiredAt).toBeNull();
    await expect(runDataRetention(now, 0)).rejects.toThrow("Invalid");
  });
  it("expires unconfirmed requests only after their last confirmation opportunity has expired", async () => {
    const rows = [];
    for (const kind of ["old", "live-token", "confirmed"] as const) rows.push(await prisma.waitlistEntry.create({ data: { email: `${prefix}-${kind}@example.test`, createdAt: ago(31), updatedAt: ago(31), verifiedAt: kind === "confirmed" ? ago(31) : null } }));
    await prisma.verificationToken.create({ data: { email: rows[1].email, tokenHash: randomUUID(), purpose: "waitlist", expiresAt: new Date(now.getTime() + DAY) } });
    await prisma.verificationToken.create({ data: { email: rows[0].email, tokenHash: randomUUID(), purpose: "waitlist", expiresAt: ago(31) } });
    expect(await runDataRetention(now)).toMatchObject({ unconfirmedWaitlist: 1, expiredVerification: 1 });
    expect(await prisma.waitlistEntry.findUnique({ where: { id: rows[0].id } })).toBeNull();
    expect(await prisma.waitlistEntry.count({ where: { id: { in: [rows[1].id, rows[2].id] } } })).toBe(2);
  });
  it("removes an inactive resolved conversation and its private view records while retaining a content-free purge audit", async () => {
    await oldTicket(181);
    await prisma.adminImpersonation.create({ data: { actorUserId: f.admin.user.id, actorSessionId: f.admin.session.id, targetUserId: f.customer.user.id, workspaceId: f.workspace.id, ticketId: f.ticket.id, tokenHash: randomUUID(), reason: "PRIVATE_SUPPORT_REASON", expiresAt: ago(180), endedAt: ago(180), lastSeenAt: ago(180), createdAt: ago(181) } });
    expect(await runDataRetention(now)).toMatchObject({ supportConversations: 1, supportMessages: 1 });
    expect(await prisma.supportTicket.findUnique({ where: { id: f.ticket.id } })).toBeNull();
    expect(await prisma.adminImpersonation.count({ where: { actorUserId: f.admin.user.id } })).toBe(0);
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { action: "privacy.support.purge", entityId: f.ticket.id } });
    expect(JSON.stringify(audit)).not.toContain("PRIVATE_SUPPORT");
    await expect(reopenSupportTicketRecord({ ticketId: f.ticket.id, workspaceId: f.workspace.id, requesterUserId: f.customer.user.id })).rejects.toThrow("not found");
  });
  it("keeps uncertain support receipts while the case exists and cascades private notifications when the old case expires", async () => {
    const record = await ledger("support-review", 401);
    const message = await prisma.supportTicketMessage.create({ data: { ticketId: f.ticket.id, authorUserId: f.admin.user.id, authorType: "ADMIN", body: "PRIVATE_OLD_SUPPORT_REPLY", emailStatus: "FAILED", createdAt: ago(181) } });
    const delivery = await prisma.supportEmailDelivery.create({ data: { messageId: message.id, issuerUserId: f.admin.user.id, status: "REVIEW", emailMessageId: record.id, messageCiphertext: "PRIVATE_OLD_SUPPORT_EMAIL", createdAt: ago(181), updatedAt: ago(181) } });
    await runDataRetention(now);
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: record.id } })).detailsRetiredAt).toBeNull();
    await oldTicket(181);
    expect((await runDataRetention(now)).supportConversations).toBe(1);
    expect(await prisma.supportEmailDelivery.findUnique({ where: { id: delivery.id } })).toBeNull();
    await runDataRetention(now);
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: record.id } })).detailsRetiredAt).not.toBeNull();
  });
  it.each(["open", "boundary", "pending-email", "recent-message", "recent-change", "active-view"])("protects a %s support case", async kind => {
    await oldTicket(kind === "boundary" ? 180 : 181, kind === "open" ? "OPEN" : "RESOLVED");
    if (kind === "pending-email") await prisma.supportTicketMessage.updateMany({ where: { ticketId: f.ticket.id }, data: { emailStatus: "PENDING" } });
    if (kind === "recent-message") await prisma.supportTicketMessage.updateMany({ where: { ticketId: f.ticket.id }, data: { createdAt: now } });
    if (kind === "recent-change") await prisma.supportTicket.update({ where: { id: f.ticket.id }, data: { updatedAt: now } });
    if (kind === "active-view") await prisma.adminImpersonation.create({ data: { actorUserId: f.admin.user.id, actorSessionId: f.admin.session.id, targetUserId: f.customer.user.id, workspaceId: f.workspace.id, ticketId: f.ticket.id, tokenHash: randomUUID(), reason: "Existing review", expiresAt: new Date(now.getTime() + 60_000) } });
    expect((await runDataRetention(now)).supportConversations).toBe(0);
    expect(await prisma.supportTicket.findUnique({ where: { id: f.ticket.id } })).not.toBeNull();
  });
  it("serializes reopening against purging without leaving a reopened case with a deleted thread", async () => {
    await oldTicket(181);
    const [reopened, retained] = await Promise.allSettled([reopenSupportTicketRecord({ ticketId: f.ticket.id, workspaceId: f.workspace.id, requesterUserId: f.customer.user.id }), runDataRetention(now)]);
    expect(retained.status).toBe("fulfilled");
    const ticket = await prisma.supportTicket.findUnique({ where: { id: f.ticket.id }, include: { messages: true } });
    if (reopened.status === "fulfilled") { expect(ticket?.status).toBe("WAITING_ON_SUPPORT"); expect(ticket?.messages.length).toBe(2); }
    else expect(ticket).toBeNull();
  });
  it("records a failed pass without replacing the last success or exposing raw errors, then recovers", async () => {
    await runDataRetention(now); const success = await prisma.dataRetentionState.findUniqueOrThrow({ where: { id: "primary" } });
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("PRIVATE_SQL_AND_CREDENTIALS"));
    await expect(runDataRetention(now)).rejects.toThrow("did not finish"); vi.restoreAllMocks();
    const failed = await prisma.dataRetentionState.findUniqueOrThrow({ where: { id: "primary" } });
    expect(failed.completedAt).toEqual(success.completedAt); expect(failed.failedAt).not.toBeNull(); expect(JSON.stringify(failed)).not.toContain("PRIVATE_SQL");
    await runDataRetention(now); expect((await prisma.dataRetentionState.findUniqueOrThrow({ where: { id: "primary" } })).failedAt).toBeNull();
  });
});
