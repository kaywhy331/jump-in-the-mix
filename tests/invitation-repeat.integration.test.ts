import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/env", async original => { const mod = await original<typeof import("../src/lib/env")>(); return { ...mod, env: { ...mod.env, requireAdminMfa: true, pilotMode: false, dataEncryptionKey: "email-repeat-test-key", resendApiKey: "test-sending-key", resendRecoveryApiKey: "test-recovery-key", emailFrom: "sender@example.test", emailDailyLimit: 90, emailMonthlyLimit: 2700, emailDailyAuthReserve: 20, emailMonthlyAuthReserve: 300 } }; });
const actionAuth = vi.hoisted(() => ({ require: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: actionAuth.require }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { retryWaitlistDeliveryAction } from "../src/lib/waitlist-admin-actions";
import { manageAccessInvitationAction } from "../src/lib/access-admin-actions";
import { prisma } from "../src/lib/prisma";
import { createEmailReviewFixture } from "./helpers/email-review-fixture";
import { recoverInvitationReceipt, repeatInvitationDelivery } from "../src/lib/invitation-receipt-recovery";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { emailMessageId } from "../src/lib/email-budget";
import { deliverWaitlistInvitations } from "../src/lib/waitlist-delivery";
import { receiveEmailProviderEvent } from "../src/lib/email-events";
import type { TransactionalEmail } from "../src/lib/transactional-email";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("verified receipts and deliberate invitation repeats", () => {
  let f: Awaited<ReturnType<typeof createEmailReviewFixture>>;
  beforeEach(async () => { f = await createEmailReviewFixture(); actionAuth.require.mockResolvedValue({ user: f.user, session: f.session }); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected provider operation"); })); });
  afterEach(async () => { await f.cleanup(); vi.unstubAllGlobals(); });
  const reason = "Recipient requested another copy after provider investigation";
  function input(delivery: { id: string; updatedAt: Date }) { return { ...f.actor, deliveryId: delivery.id, expectedUpdatedAt: delivery.updatedAt.toISOString(), reason }; }
  function repeat(delivery: { id: string; updatedAt: Date }) { return { ...input(delivery), password: f.password, providerReference: "Provider investigation OP-200", requestReference: "Support case OP-201", providerReviewed: true, recipientRequested: true, duplicateRiskAccepted: true }; }
  function provider(item: Awaited<ReturnType<typeof f.invitation>>, id: string = randomUUID()) {
    return { object: "email", id, from: item.message.from, to: [f.email], subject: item.message.subject, text: item.message.text, html: item.message.html, cc: [], bcc: [], reply_to: [], scheduled_at: null, last_event: "delivered", created_at: new Date(item.record.firstAttemptAt.getTime() + 1000).toISOString().replace("T", " ").replace("Z", "000+00") };
  }
  it("verifies the frozen email through a GET and recovers original acceptance without inventing delivery or reserving capacity", async () => {
    const item = await f.invitation(false), response = provider(item);
    const request = vi.fn(async () => Response.json(response)); vi.stubGlobal("fetch", request);
    await recoverInvitationReceipt({ ...input(item.delivery), providerId: response.id });
    expect(request).toHaveBeenCalledExactlyOnceWith(`https://api.resend.com/emails/${response.id}`, expect.objectContaining({ method: "GET", cache: "no-store", redirect: "error", headers: { Authorization: "Bearer test-recovery-key" } }));
    const row = await prisma.emailMessage.findUniqueOrThrow({ where: { id: item.record.id } });
    expect(row.providerId).toBe(response.id); expect(row.acceptedAt!.getTime()).toBe(item.record.firstAttemptAt.getTime() + 1000); expect(row.deliveredAt).toBeNull();
    expect(await prisma.emailSendAttempt.count({ where: { messageId: row.id } })).toBe(0);
    const audits = await prisma.platformAuditEvent.findMany({ where: { actorUserId: f.user.id } });
    expect(audits.map(a => a.action).sort()).toEqual(["email.invitation.provider-check", "email.invitation.receipt-recovered"]);
    expect(JSON.stringify(audits)).not.toMatch(/SECRET_ACCESS_URL|SECRET_INVITATION_SUBJECT|test-recovery-key/);
  });
  it.each(["to", "from", "subject", "text", "html", "cc", "bcc", "reply_to", "id", "old-time", "future-time", "no-zone", "scheduled", "adverse", "unsupported"])("rejects mismatched or unqualified provider evidence: %s", async field => {
    const item = await f.invitation(false), response = provider(item), requestedId = response.id;
    if (["from", "subject", "text", "html", "id"].includes(field)) Object.assign(response, { [field]: "unrelated" });
    if (["to", "cc", "bcc", "reply_to"].includes(field)) Object.assign(response, { [field]: ["other@example.test"] });
    if (field === "old-time") response.created_at = new Date(item.record.firstAttemptAt.getTime() - 3600_000).toISOString();
    if (field === "future-time") response.created_at = new Date(Date.now() + 3600_000).toISOString();
    if (field === "no-zone") response.created_at = "2026-09-01 12:00:00";
    if (field === "scheduled") Object.assign(response, { scheduled_at: new Date().toISOString() });
    if (field === "adverse") response.last_event = "bounced";
    if (field === "unsupported") response.last_event = "new-provider-status";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(response)));
    await expect(recoverInvitationReceipt({ ...input(item.delivery), providerId: requestedId })).rejects.toThrow();
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: item.record.id } })).acceptedAt).toBeNull();
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: item.delivery.id } })).status).toBe("REVIEW");
  });
  it.each(["404", "403", "429", "timeout", "invalid-json", "oversize"])("fails safely for provider lookup failure: %s", async failure => {
    const item = await f.invitation(false);
    vi.stubGlobal("fetch", vi.fn(async () => { if (failure === "timeout") throw new Error("secret provider error"); return new Response(failure === "oversize" ? "a".repeat(256 * 1024 + 1) : "secret provider error", { status: /^\d+$/.test(failure) ? Number(failure) : 200 }); }));
    await expect(recoverInvitationReceipt({ ...input(item.delivery), providerId: randomUUID() })).rejects.toThrow("could not be verified");
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: item.record.id } })).providerId).toBeNull();
  });
  it("checks authority before provider I/O and refuses arbitrary URLs", async () => {
    const item = await f.invitation(false);
    await expect(recoverInvitationReceipt({ ...input(item.delivery), providerId: "https://attacker.test/secret" })).rejects.toThrow("not a URL");
    await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: ["email.manage"] } });
    await expect(recoverInvitationReceipt({ ...input(item.delivery), providerId: randomUUID() })).rejects.toThrow("cannot review"); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["permission", "session", "mfa", "canceled", "changed"])("rechecks current state after provider I/O: %s", async change => {
    const item = await f.invitation(false), response = provider(item);
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (change === "permission") await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: ["access.read"] } });
      if (change === "session") await prisma.session.delete({ where: { id: f.session.id } });
      if (change === "mfa") await prisma.adminMfaSession.deleteMany({ where: { userId: f.user.id } });
      if (change === "canceled") await prisma.waitlistDelivery.update({ where: { id: item.delivery.id }, data: { status: "CANCELED" } });
      if (change === "changed") await prisma.waitlistDelivery.update({ where: { id: item.delivery.id }, data: { lastError: "New review evidence" } });
      return Response.json(response);
    }));
    await expect(recoverInvitationReceipt({ ...input(item.delivery), providerId: response.id })).rejects.toThrow();
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: item.record.id } })).providerId).toBeNull();
  });
  it("rejects a provider record already linked to another message and reconciles previously signed events", async () => {
    const item = await f.invitation(false), other = await f.invitation(), response = provider(item, other.record.providerId!);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(response)));
    await expect(recoverInvitationReceipt({ ...input(item.delivery), providerId: response.id })).rejects.toThrow("different delivery");
    response.id = randomUUID(); const eventId = randomUUID(); f.eventIds.push(eventId);
    const occurredAt = new Date(item.record.firstAttemptAt.getTime() + 3000);
    await receiveEmailProviderEvent(eventId, { type: "email.delivered", created_at: occurredAt.toISOString(), data: { email_id: response.id, to: [f.email] } });
    await recoverInvitationReceipt({ ...input(item.delivery), providerId: response.id });
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: item.record.id } })).deliveredAt).toEqual(occurredAt);
  });
  it("archives a generation, keeps the same unique URL and slot, then sends through the normal budgeted worker with a new stable key", async () => {
    const item = await f.invitation(false);
    await prisma.user.update({ where: { id: f.user.id }, data: { referralInvitesIssued: 5 } });
    await prisma.referralAccessInvite.update({ where: { id: item.invite.id }, data: { source: "REFERRAL", inviterUserId: f.user.id } });
    await prisma.emailSendAttempt.create({ data: { messageId: item.record.id, category: "INVITATION" } });
    const results = await Promise.allSettled([repeatInvitationDelivery(repeat(item.delivery)), repeatInvitationDelivery(repeat(item.delivery))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(fetch).not.toHaveBeenCalled();
    const queued = await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: item.delivery.id } });
    const message = decryptIntegrationCredentials<TransactionalEmail>(queued.messageCiphertext);
    expect(message).toEqual({ ...item.message, idempotencyKey: expect.stringMatching(/^invitation-repeat-/) }); expect(message.idempotencyKey).not.toBe(item.message.idempotencyKey);
    expect(queued).toMatchObject({ status: "QUEUED", generation: 2, attempts: 0, firstAttemptAt: null, providerId: null, emailMessageId: null });
    const history = await prisma.invitationDeliveryHistory.findMany({ where: { deliveryId: queued.id } });
    expect(history).toHaveLength(1); expect(history[0]).toMatchObject({ generation: 1, attempts: 8, firstAttemptAt: item.record.firstAttemptAt, emailMessageId: item.record.id });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } })).referralInvitesIssued).toBe(5);
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: f.email } })).toBe(1);
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: item.invite.id } })).tokenHash).toBe(item.invite.tokenHash);
    const request = vi.fn(async () => Response.json({ id: randomUUID() })); vi.stubGlobal("fetch", request);
    expect(await deliverWaitlistInvitations(new Date(), 1)).toBe(1);
    expect(request).toHaveBeenCalledOnce(); expect(request.mock.calls[0]).toEqual(["https://api.resend.com/emails", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": message.idempotencyKey }), body: expect.stringContaining(item.message.text) })]);
    const sent = await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: queued.id } }); expect(sent.status).toBe("SENT"); expect(sent.emailMessageId).toBe(emailMessageId(message.idempotencyKey!));
    expect(sent.firstAttemptAt!.getTime()).toBeGreaterThan(item.record.firstAttemptAt.getTime());
    expect(await prisma.emailSendAttempt.count({ where: { messageId: { in: [item.record.id, sent.emailMessageId!] } } })).toBe(2);
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: item.record.id } })).firstAttemptAt).toEqual(item.record.firstAttemptAt);
    await expect(repeatInvitationDelivery(repeat(sent))).rejects.toThrow("24 hours");
  });
  it.each(["password", "missing-password", "mfa", "credential", "old-mfa", "session", "email-permission", "source-permission", "retry-permission", "suspended", "unverified", "revoked", "accepted", "optout", "bounce", "adverse-receipt", "leased", "recent", "provider-review", "recipient-request", "duplicate-risk"])("cannot repeat an invitation without current eligibility and evidence: %s", async failure => {
    const item = await f.invitation(false), request = repeat(item.delivery);
    if (failure === "password") request.password = "incorrect";
    if (failure === "missing-password") Object.assign(request, { password: undefined });
    if (failure === "mfa") await prisma.adminMfaSession.deleteMany({ where: { userId: f.user.id } });
    if (failure === "credential") await prisma.adminMfaCredential.update({ where: { userId: f.user.id }, data: { enabledAt: null } });
    if (failure === "old-mfa") await prisma.adminMfaSession.update({ where: { sessionId: f.session.id }, data: { verifiedAt: new Date(Date.now() - 11 * 60_000) } });
    if (failure === "session") await prisma.session.delete({ where: { id: f.session.id } });
    const denies = { "email-permission": "email.manage", "source-permission": "access.read", "retry-permission": "jobs.retry" };
    if (failure in denies) await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: [denies[failure as keyof typeof denies]] } });
    if (failure === "suspended") await prisma.user.update({ where: { id: f.user.id }, data: { suspendedAt: new Date() } });
    if (failure === "unverified") await prisma.user.update({ where: { id: f.user.id }, data: { emailVerifiedAt: null } });
    if (failure === "revoked" || failure === "accepted") await prisma.referralAccessInvite.update({ where: { id: item.invite.id }, data: failure === "revoked" ? { revokedAt: new Date() } : { acceptedAt: new Date() } });
    if (failure === "optout" || failure === "bounce") await prisma.emailSuppression.create({ data: { email: f.email, reason: failure === "optout" ? "INVITATION_OPTOUT" : "HARD_BOUNCE" } });
    if (failure === "adverse-receipt") await prisma.emailMessage.update({ where: { id: item.record.id }, data: { bouncedAt: new Date() } });
    if (failure === "leased" || failure === "recent") { const changed = await prisma.waitlistDelivery.update({ where: { id: item.delivery.id }, data: failure === "leased" ? { leaseId: randomUUID(), lockedAt: new Date() } : { generationStartedAt: new Date() } }); request.expectedUpdatedAt = changed.updatedAt.toISOString(); }
    if (failure === "provider-review") request.providerReviewed = false;
    if (failure === "recipient-request") request.recipientRequested = false;
    if (failure === "duplicate-risk") request.duplicateRiskAccepted = false;
    await expect(repeatInvitationDelivery(request)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
    expect(await prisma.invitationDeliveryHistory.count({ where: { deliveryId: item.delivery.id } })).toBe(0);
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: item.delivery.id } })).generation).toBe(1);
  });
  it.each(["valid", "expired", "issuer-revision", "issuer-suspended", "permission"])("checks staff invitation eligibility separately from customer access: %s", async condition => {
    const item = await f.invitation(false);
    const staffInvite = await prisma.staffInvitation.create({ data: { email: f.email, role: "SUPPORT", issuerUserId: f.user.id, issuerRevision: 1, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + (condition === "expired" ? -1 : 3600_000)) } });
    const delivery = await prisma.waitlistDelivery.update({ where: { id: item.delivery.id }, data: { inviteId: null, staffInvitationId: staffInvite.id } });
    await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: condition === "permission" ? ["staff.manage"] : ["access.read", "jobs.retry"], ...(condition === "issuer-revision" ? { revision: 2 } : {}) } });
    if (condition === "issuer-suspended") await prisma.user.update({ where: { id: f.user.id }, data: { suspendedAt: new Date() } });
    if (condition === "valid") await expect(repeatInvitationDelivery(repeat(delivery))).resolves.toEqual({ queued: true });
    else await expect(repeatInvitationDelivery(repeat(delivery))).rejects.toThrow();
    expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id: staffInvite.id } })).expiresAt).toEqual(staffInvite.expiresAt);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("defers a newly approved repeat when sending capacity is reserved without touching the archived attempts", async () => {
    const item = await f.invitation(false);
    await prisma.emailSendAttempt.createMany({ data: Array.from({ length: 70 }, () => ({ messageId: item.record.id, category: "INVITATION" as const })) });
    await repeatInvitationDelivery(repeat(item.delivery));
    expect(await deliverWaitlistInvitations(new Date(), 1)).toBe(0); expect(fetch).not.toHaveBeenCalled();
    const deferred = await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: item.delivery.id } });
    expect(deferred).toMatchObject({ generation: 2, status: "QUEUED", attempts: 0, firstAttemptAt: null });
    expect(await prisma.emailSendAttempt.count({ where: { messageId: item.record.id } })).toBe(70);
  });
  it.each(["waitlist", "access"].flatMap(action => ["valid", "permission", "mfa", "credential", "session", "suppression"].map(condition => [action, condition])))("safe retry action %s checks live %s after its route guard", async (action, condition) => {
    const item = await f.invitation(false);
    await prisma.waitlistDelivery.update({ where: { id: item.delivery.id }, data: { firstAttemptAt: new Date() } });
    if (condition === "permission") await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: [action === "waitlist" ? "waitlist.manage" : "jobs.retry"] } });
    if (condition === "mfa") await prisma.adminMfaSession.deleteMany({ where: { userId: f.user.id } });
    if (condition === "credential") await prisma.adminMfaCredential.update({ where: { userId: f.user.id }, data: { enabledAt: null } });
    if (condition === "session") await prisma.session.delete({ where: { id: f.session.id } });
    if (condition === "suppression") await prisma.emailSuppression.create({ data: { email: f.email, reason: "INVITATION_OPTOUT" } });
    const form = new FormData(); form.set("deliveryId", item.delivery.id); form.set("inviteId", item.invite.id); form.set("operation", "retry"); form.set("reason", reason);
    await expect((action === "waitlist" ? retryWaitlistDeliveryAction : manageAccessInvitationAction)(form)).rejects.toThrow(condition === "valid" ? /retry=1|done=retry/ : /error=/);
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: item.delivery.id } })).status).toBe(condition === "valid" ? "QUEUED" : "REVIEW");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps a late old worker acceptance out of a newer canceled generation", async () => {
    const item = await f.invitation(false);
    await prisma.emailMessage.update({ where: { id: item.record.id }, data: { firstAttemptAt: new Date() } });
    await prisma.waitlistDelivery.update({ where: { id: item.delivery.id }, data: { status: "QUEUED", firstAttemptAt: new Date() } });
    const oldProviderId = randomUUID();
    vi.stubGlobal("fetch", vi.fn(async () => {
      // Simulate a process resuming after the operator advanced and canceled the outbox.
      await prisma.waitlistDelivery.update({ where: { id: item.delivery.id }, data: { generation: 2, status: "CANCELED", leaseId: null, lockedAt: null, firstAttemptAt: null } });
      return Response.json({ id: oldProviderId });
    }));
    await deliverWaitlistInvitations(new Date(), 1);
    const current = await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: item.delivery.id } });
    expect(current).toMatchObject({ generation: 2, status: "CANCELED", providerId: null, emailMessageId: null, firstAttemptAt: null });
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: item.record.id } })).providerId).toBe(oldProviderId);
  });
});
