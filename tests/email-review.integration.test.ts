import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/env", async original => { const mod = await original<typeof import("../src/lib/env")>(); return { ...mod, env: { ...mod.env, requireAdminMfa: true, pilotMode: false, dataEncryptionKey: "email-review-test-key", emailDailyLimit: 90, emailMonthlyLimit: 2700, emailDailyAuthReserve: 20, emailMonthlyAuthReserve: 300 } }; });
import { prisma } from "../src/lib/prisma";
import { createEmailReviewFixture } from "./helpers/email-review-fixture";
import { clearRecipientSuppression, suppressionReviewState } from "../src/lib/email-suppression-admin";
import { receiveEmailProviderEvent } from "../src/lib/email-events";
import { recoverInvitationReceipt } from "../src/lib/invitation-receipt-recovery";
import { recordedEmailAcceptance } from "../src/lib/transactional-email";
import { reserveEmailAttempt } from "../src/lib/email-budget";
import { requestWaitlistEntry, confirmWaitlistEntry } from "../src/lib/waitlist";
import { invitationEmailSuppressed } from "../src/lib/invitation-preferences";
import { encryptIntegrationCredentials } from "../src/lib/integration-crypto";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("operator email recovery", () => {
  let f: Awaited<ReturnType<typeof createEmailReviewFixture>>;
  beforeEach(async () => { f = await createEmailReviewFixture(); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No provider requests are allowed in receipt or suppression review."); })); });
  afterEach(async () => { await f.cleanup(); vi.unstubAllGlobals(); });
  async function input() {
    const rows = await prisma.emailSuppression.findMany({ where: { email: f.email } });
    return { ...f.actor, suppressionId: rows[0].id, expectedState: suppressionReviewState(rows), password: f.password, reason: "Recipient requested account email after correcting the cause", providerReference: "Provider review CASE-100", requestReference: "Support CASE-101", providerReviewed: true, recipientRequested: true };
  }
  async function adverse(type = "email.bounced", occurredAt = new Date(Date.now() - 3600_000)) {
    const id = `event-${randomUUID()}`; f.eventIds.push(id);
    await receiveEmailProviderEvent(id, { type, created_at: occurredAt.toISOString(), data: { email_id: randomUUID(), to: [f.email], bounce: { type: "Permanent" } } }, new Date(Math.max(Date.now(), occurredAt.getTime())));
  }
  it("preserves block history, revoked grants and canceled delivery, and requires fresh confirmation before rejoining", async () => {
    const { invite, delivery } = await f.invitation();
    const entry = await prisma.waitlistEntry.create({ data: { email: f.email, verifiedAt: new Date(0), status: "ACCESS_GRANTED", createdAt: new Date(0) } });
    await adverse(); await adverse("email.complained");
    const result = await clearRecipientSuppression(await input()); expect(result.cleared).toBe(2);
    const rows = await prisma.emailSuppression.findMany({ where: { email: f.email } }); expect(rows).toHaveLength(2); expect(rows.every(row => row.clearedAt && row.revision === 2)).toBe(true);
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).revokedAt).not.toBeNull();
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe("CANCELED");
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("SUPPRESSED");
    const token = await requestWaitlistEntry(f.email); expect(token).toBeTruthy();
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("SUPPRESSED");
    expect(await confirmWaitlistEntry(token!)).toBe(true);
    const rejoined = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } }); expect(rejoined.status).toBe("WAITING"); expect(rejoined.createdAt.getTime()).toBeGreaterThan(Date.now() - 5000);
    expect(await invitationEmailSuppressed(prisma, f.email)).toBe(false);
    const reservation = await reserveEmailAttempt({ key: randomUUID(), email: f.email, category: "AUTH", payloadHash: createHash("sha256").update("test").digest("hex") }); expect(reservation.cached).toBe(false);
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { actorUserId: f.user.id, action: "email.suppression.clear" } });
    expect(JSON.stringify(audit)).not.toContain(f.email); expect(audit.afterData).toMatchObject({ providerReviewed: true, recipientRequested: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never lets administrators clear invitation opt-out, including when provider blocks are cleared", async () => {
    await prisma.emailSuppression.create({ data: { email: f.email, reason: "INVITATION_OPTOUT" } });
    await expect(clearRecipientSuppression(await input())).rejects.toThrow("Only the recipient");
    await adverse(); await clearRecipientSuppression(await input());
    expect(await invitationEmailSuppressed(prisma, f.email)).toBe(true);
    expect(await prisma.emailSuppression.findFirst({ where: { email: f.email, reason: "INVITATION_OPTOUT", clearedAt: null } })).not.toBeNull();
    await expect(reserveEmailAttempt({ key: randomUUID(), email: f.email, category: "INVITATION", payloadHash: "test" })).rejects.toMatchObject({ code: "SUPPRESSED" });
    await expect(prisma.emailSuppression.updateMany({ where: { email: f.email, reason: "INVITATION_OPTOUT" }, data: { clearedAt: new Date() } })).rejects.toThrow();
  });
  it("ignores delayed events for a cleared reason, but applies later adverse events and rejects stale review", async () => {
    await adverse(); const initial = await input(); await clearRecipientSuppression(initial);
    await adverse("email.bounced", new Date(Date.now() - 600_000));
    expect(await invitationEmailSuppressed(prisma, f.email)).toBe(false);
    const prior = await input(); await adverse("email.bounced", new Date(Date.now() + 1000));
    expect(await invitationEmailSuppressed(prisma, f.email)).toBe(true);
    await expect(clearRecipientSuppression(prior)).rejects.toThrow("changed");
    const active = await prisma.emailSuppression.findFirstOrThrow({ where: { email: f.email } }); expect(active.revision).toBe(3); expect(active.clearedAt).toBeNull();
  });
  it("serializes competing clearances and invalidates a form when another suppression reason arrives", async () => {
    await adverse(); const original = await input(); await adverse("email.complained");
    await expect(clearRecipientSuppression(original)).rejects.toThrow("changed");
    const current = await input(); const results = await Promise.allSettled([clearRecipientSuppression(current), clearRecipientSuppression(current)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.platformAuditEvent.count({ where: { actorUserId: f.user.id, action: "email.suppression.clear" } })).toBe(1);
  });
  it.each(["permission", "mfa", "credential", "old-mfa", "session", "suspended", "unverified", "password", "provider-review", "recipient-request"])("requires current authority and review evidence: %s", async condition => {
    await adverse(); const request = await input();
    if (condition === "permission") await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: ["email.manage"] } });
    if (condition === "mfa") await prisma.adminMfaSession.deleteMany({ where: { userId: f.user.id } });
    if (condition === "credential") await prisma.adminMfaCredential.update({ where: { userId: f.user.id }, data: { enabledAt: null } });
    if (condition === "old-mfa") await prisma.adminMfaSession.update({ where: { sessionId: f.session.id }, data: { verifiedAt: new Date(Date.now() - 11 * 60_000) } });
    if (condition === "session") await prisma.session.delete({ where: { id: f.session.id } });
    if (condition === "suspended") await prisma.user.update({ where: { id: f.user.id }, data: { suspendedAt: new Date() } });
    if (condition === "unverified") await prisma.user.update({ where: { id: f.user.id }, data: { emailVerifiedAt: null } });
    if (condition === "password") request.password = "wrong-password";
    if (condition === "provider-review") request.providerReviewed = false;
    if (condition === "recipient-request") request.recipientRequested = false;
    await expect(clearRecipientSuppression(request)).rejects.toThrow(); expect(await invitationEmailSuppressed(prisma, f.email)).toBe(true);
  });
  it("recovers an expired-window acceptance atomically without a provider call, quota change or new send", async () => {
    const { delivery, record, invite } = await f.invitation();
    const input = { ...f.actor, deliveryId: delivery.id, expectedUpdatedAt: delivery.updatedAt.toISOString(), reason: "Recover the original recorded provider acceptance" };
    const results = await Promise.allSettled([recoverInvitationReceipt(input), recoverInvitationReceipt(input)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const row = await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: delivery.id } }); expect(row).toMatchObject({ status: "SENT", attempts: 8, emailMessageId: record.id, providerId: record.providerId, firstAttemptAt: delivery.firstAttemptAt }); expect(row.messageCiphertext).toBe(delivery.messageCiphertext);
    const restored = await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } }); expect(restored.lastSentAt).toEqual(record.acceptedAt); expect(restored.tokenHash).toBe(invite.tokenHash);
    expect(await prisma.emailSendAttempt.count({ where: { messageId: record.id } })).toBe(0); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects missing, mismatched and canceled receipts rather than inventing acceptance", async () => {
    const { delivery, message } = await f.invitation(false);
    const input = { ...f.actor, deliveryId: delivery.id, expectedUpdatedAt: delivery.updatedAt.toISOString(), reason: "Investigate a missing provider acceptance receipt" };
    await expect(recoverInvitationReceipt(input)).rejects.toThrow("No matching");
    expect(await recordedEmailAcceptance({ ...message, subject: "Changed subject" })).toBeNull();
    await prisma.waitlistDelivery.update({ where: { id: delivery.id }, data: { status: "CANCELED" } });
    await expect(recoverInvitationReceipt(input)).rejects.toThrow("changed");
  });
  it("does not use a receipt for changed content, recipient, category or key", async () => {
    const { delivery, message } = await f.invitation();
    for (const changed of [{ ...message, text: "different" }, { ...message, to: "different@example.test" }, { ...message, category: "AUTH" as const }, { ...message, idempotencyKey: "unrelated" }]) expect(await recordedEmailAcceptance(changed)).toBeNull();
    const altered = await prisma.waitlistDelivery.update({ where: { id: delivery.id }, data: { messageCiphertext: encryptIntegrationCredentials({ ...message, subject: "Changed subject" }) } });
    await expect(recoverInvitationReceipt({ ...f.actor, deliveryId: altered.id, expectedUpdatedAt: altered.updatedAt.toISOString(), reason: "Reject modified invitation content during recovery" })).rejects.toThrow("does not match its send ledger");
  });
  it("requires the invitation's separate data permission and a live staff session for recovery", async () => {
    const { delivery } = await f.invitation(); const input = { ...f.actor, deliveryId: delivery.id, expectedUpdatedAt: delivery.updatedAt.toISOString(), reason: "Recover the original recorded provider acceptance" };
    await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: ["access.read"] } }); await expect(recoverInvitationReceipt(input)).rejects.toThrow("invitation operation");
    await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: ["email.manage"] } }); await expect(recoverInvitationReceipt(input)).rejects.toThrow("cannot review");
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe("REVIEW");
  });
});
