import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/env", async original => { const mod = await original<typeof import("../src/lib/env")>(); return { ...mod, env: { ...mod.env, requireAdminMfa: true, dataEncryptionKey: "support-email-test-key", resendApiKey: "test-sending-key", resendRecoveryApiKey: "test-recovery-key", emailFrom: "Support <support@example.test>", emailReplyTo: "", emailDailyLimit: 90, emailMonthlyLimit: 2700, emailDailyAuthReserve: 20, emailMonthlyAuthReserve: 300 } }; });
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";
import { createSupportFixture } from "./helpers/support-fixture";
import { adminReplyToSupportTicketRecord } from "../src/lib/support-service";
import { deliverSupportEmails, frozenSupportEmail } from "../src/lib/support-email-delivery";
import { retrySupportEmail, recoverSupportEmailReceipt, repeatSupportEmail, cancelSupportEmail } from "../src/lib/support-email-recovery";
import { reserveEmailAttempt } from "../src/lib/email-budget";
import { preparedEmail } from "../src/lib/transactional-email";
import { recordEmailAcceptance } from "../src/lib/email-events";
import { collectOperationsSignals } from "../src/lib/operations-signals";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("durable support notification delivery and review", () => {
  let f: Awaited<ReturnType<typeof createSupportFixture>>;
  const ledgerIds: string[] = [];
  const password = "local-support-review-password";
  beforeEach(async () => {
    f = await createSupportFixture();
    await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { grants: ["email.manage"] } });
    await prisma.user.update({ where: { id: f.admin.user.id }, data: { passwordHash: await bcrypt.hash(password, 4) } });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: randomUUID() })));
  });
  afterEach(async () => {
    const deliveries = await prisma.supportEmailDelivery.findMany({ where: { message: { ticketId: f.ticket.id } }, select: { emailMessageId: true } });
    const ids = [...ledgerIds.splice(0), ...deliveries.map(d => d.emailMessageId)];
    await prisma.emailSendAttempt.deleteMany({ where: { messageId: { in: ids } } });
    await prisma.emailMessage.deleteMany({ where: { id: { in: ids } } });
    await prisma.emailSuppression.deleteMany({ where: { email: f.customer.user.email } });
    await f.cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  async function queue(requestKey = randomUUID(), body = "PRIVATE_SUPPORT_REPLY_SENTINEL: please check the selected Mix.") {
    const result = await adminReplyToSupportTicketRecord({ ticketId: f.ticket.id, adminUserId: f.admin.user.id, actorSessionId: f.admin.session.id, requestKey, body });
    const delivery = await prisma.supportEmailDelivery.findFirstOrThrow({ where: { messageId: result.message.id }, orderBy: { generation: "desc" } });
    return { ...result, delivery, email: delivery.messageCiphertext ? frozenSupportEmail(delivery) : null };
  }
  async function current(id: string) { return prisma.supportEmailDelivery.findUniqueOrThrow({ where: { id } }); }
  const review = (delivery: { id: string; updatedAt: Date }) => ({ ...f.actor, ticketId: f.ticket.id, deliveryId: delivery.id, expectedUpdatedAt: delivery.updatedAt.toISOString(), reason: "Reviewed this notification with the customer and provider." });
  const repeat = (delivery: { id: string; updatedAt: Date }) => ({ ...review(delivery), password, providerReference: "Provider case REF-123", requestReference: "Customer case REF-456", providerReviewed: true, recipientRequested: true, duplicateRiskAccepted: true });
  async function uncertain(item: Awaited<ReturnType<typeof queue>>, ageHours = 25) {
    const prepared = preparedEmail(item.email!);
    await reserveEmailAttempt({ key: item.email!.idempotencyKey!, email: prepared.email, payloadHash: prepared.payloadHash, category: "PRODUCT" });
    const first = new Date(Date.now() - ageHours * 3600_000);
    await prisma.emailMessage.update({ where: { id: item.delivery.emailMessageId }, data: { firstAttemptAt: first } });
    await prisma.supportTicketMessage.update({ where: { id: item.message.id }, data: { emailStatus: "FAILED" } });
    return prisma.supportEmailDelivery.update({ where: { id: item.delivery.id }, data: { status: "REVIEW", createdAt: first, firstAttemptAt: first, attempts: 1 } });
  }
  it("atomically saves one reply and one encrypted notification for concurrent identical submissions", async () => {
    const key = randomUUID(), results = await Promise.all([queue(key), queue(key)]);
    expect(results[0].message.id).toBe(results[1].message.id);
    expect(await prisma.supportEmailDelivery.count({ where: { message: { ticketId: f.ticket.id } } })).toBe(1);
    expect(results[0].delivery.messageCiphertext).not.toContain("PRIVATE_SUPPORT_REPLY_SENTINEL");
    expect(results[0].email).toMatchObject({ from: "Support <support@example.test>", replyTo: null, to: f.customer.user.email, category: "PRODUCT" });
    await expect(queue(key, "Changed text with the same request key")).rejects.toThrow("different text");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rolls back both the reply and notification if encryption is unavailable", async () => {
    const spy = vi.spyOn(env, "dataEncryptionKey", "get").mockReturnValue("");
    await expect(queue()).rejects.toThrow("DATA_ENCRYPTION_KEY"); spy.mockRestore();
    expect(await prisma.supportTicketMessage.count({ where: { ticketId: f.ticket.id, authorType: "ADMIN" } })).toBe(0);
  });
  it("sends once across concurrent workers, freezes the sender/content, and records acceptance separately from delivery", async () => {
    const item = await queue();
    await prisma.user.update({ where: { id: f.customer.user.id }, data: { name: "A changed name" } });
    await prisma.supportTicket.update({ where: { id: f.ticket.id }, data: { title: "A changed title" } });
    await Promise.all([deliverSupportEmails(), deliverSupportEmails()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBe(preparedEmail(item.email!).body);
    expect((await current(item.delivery.id)).status).toBe("SENT");
    const record = await prisma.emailMessage.findUniqueOrThrow({ where: { id: item.delivery.emailMessageId } });
    expect(record.acceptedAt).not.toBeNull(); expect(record.deliveredAt).toBeNull();
    expect((await prisma.supportTicketMessage.findUniqueOrThrow({ where: { id: item.message.id } })).emailSentAt).toEqual(record.acceptedAt);
    await deliverSupportEmails(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("recovers a receipt after a stopped worker without another HTTP request", async () => {
    const item = await queue(), state = await uncertain(item);
    await recordEmailAcceptance(state.emailMessageId, randomUUID());
    await prisma.supportEmailDelivery.update({ where: { id: state.id }, data: { status: "SENDING", leaseId: randomUUID(), leaseUntil: new Date(Date.now() - 1) } });
    await deliverSupportEmails();
    expect((await current(state.id)).status).toBe("SENT"); expect(fetch).not.toHaveBeenCalled();
  });
  it("recovers an expired lease inside the retry window with the original key", async () => {
    const item = await queue(), state = await uncertain(item, 1);
    await prisma.supportEmailDelivery.update({ where: { id: state.id }, data: { status: "SENDING", leaseId: randomUUID(), leaseUntil: new Date(Date.now() - 1) } });
    await deliverSupportEmails();
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({ "Idempotency-Key": item.email!.idempotencyKey });
    expect((await current(state.id)).firstAttemptAt).toEqual(state.firstAttemptAt);
  });
  it("does not reclaim a live lease", async () => {
    const item = await queue();
    await prisma.supportEmailDelivery.update({ where: { id: item.delivery.id }, data: { status: "SENDING", leaseId: randomUUID(), leaseUntil: new Date(Date.now() + 60_000) } });
    await deliverSupportEmails(); expect(fetch).not.toHaveBeenCalled();
  });
  it("a stale worker cannot finish a successor lease", async () => {
    const item = await queue(), nextLease = randomUUID();
    vi.stubGlobal("fetch", vi.fn(async () => { await prisma.supportEmailDelivery.update({ where: { id: item.delivery.id }, data: { leaseId: nextLease } }); return Response.json({ id: randomUUID() }); }));
    await deliverSupportEmails(); expect(await current(item.delivery.id)).toMatchObject({ status: "SENDING", leaseId: nextLease });
    await prisma.supportEmailDelivery.update({ where: { id: item.delivery.id }, data: { leaseUntil: new Date(Date.now() - 1) } });
    await deliverSupportEmails(); expect((await current(item.delivery.id)).status).toBe("SENT"); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["window", "attempts"])("stops automatic retries at the %s limit", async kind => {
    const item = await queue(), state = await uncertain(item, kind === "window" ? 25 : 1);
    await prisma.supportEmailDelivery.update({ where: { id: state.id }, data: { status: "QUEUED", attempts: kind === "attempts" ? 5 : 1 } });
    await deliverSupportEmails(); expect((await current(state.id)).status).toBe("REVIEW"); expect(fetch).not.toHaveBeenCalled();
    await expect(retrySupportEmail(review(await current(state.id)))).rejects.toThrow(/limit|window/);
  });
  it.each(["recipient-email", "suspended", "membership", "issuer-revision", "issuer-permission", "unverified"])("holds pending mail when %s changes", async change => {
    const item = await queue();
    if (change === "recipient-email") await prisma.user.update({ where: { id: f.customer.user.id }, data: { email: `changed-${randomUUID()}@example.test` } });
    if (change === "suspended") await prisma.user.update({ where: { id: f.customer.user.id }, data: { suspendedAt: new Date() } });
    if (change === "unverified") await prisma.user.update({ where: { id: f.customer.user.id }, data: { emailVerifiedAt: null } });
    if (change === "membership") await prisma.workspaceMember.deleteMany({ where: { workspaceId: f.workspace.id } });
    if (change === "issuer-revision") await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { revision: { increment: 1 } } });
    if (change === "issuer-permission") await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { denies: ["support.manage"] } });
    await deliverSupportEmails(); expect((await current(item.delivery.id)).status).toBe("REVIEW"); expect(fetch).not.toHaveBeenCalled();
  });
  it("defers capacity without consuming an attempt or starting the retry clock", async () => {
    const item = await queue();
    const spy = vi.spyOn(env, "emailDailyLimit", "get").mockReturnValue(0);
    await deliverSupportEmails(); spy.mockRestore();
    expect(await current(item.delivery.id)).toMatchObject({ status: "QUEUED", attempts: 0, firstAttemptAt: null });
    expect(await prisma.emailMessage.findUnique({ where: { id: item.delivery.emailMessageId } })).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["HARD_BOUNCE", "INVITATION_OPTOUT"])("respects recipient suppression %s without treating support as marketing", async reason => {
    const item = await queue();
    await prisma.emailSuppression.create({ data: { email: f.customer.user.email, reason: reason as "HARD_BOUNCE" | "INVITATION_OPTOUT" } });
    await deliverSupportEmails(); expect((await current(item.delivery.id)).status).toBe(reason === "HARD_BOUNCE" ? "REVIEW" : "SENT");
    expect(fetch).toHaveBeenCalledTimes(reason === "HARD_BOUNCE" ? 0 : 1);
  });
  it("retains a saved reply when email is unconfigured", async () => {
    const item = await queue();
    const spy = vi.spyOn(env, "resendApiKey", "get").mockReturnValue("");
    await deliverSupportEmails(); spy.mockRestore();
    expect((await current(item.delivery.id)).status).toBe("REVIEW");
    expect(await prisma.supportTicketMessage.findUnique({ where: { id: item.message.id } })).not.toBeNull(); expect(fetch).not.toHaveBeenCalled();
    await retrySupportEmail(review(await current(item.delivery.id))); await deliverSupportEmails(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("uses bounded retries and fixed diagnostic text for provider failures", async () => {
    const item = await queue();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("PRIVATE_PROVIDER_ERROR", { status: 400 })));
    for (let attempt = 0; attempt < 5; attempt++) { await prisma.supportEmailDelivery.update({ where: { id: item.delivery.id }, data: { availableAt: new Date(Date.now() - 1) } }); await deliverSupportEmails(); }
    const row = await current(item.delivery.id); expect(row.status).toBe("REVIEW"); expect(row.attempts).toBe(5); expect(row.lastError).not.toContain("PRIVATE_PROVIDER_ERROR"); expect(fetch).toHaveBeenCalledTimes(5);
    expect(new Set(vi.mocked(fetch).mock.calls.map(call => JSON.stringify(call[1]?.headers))).size).toBe(1);
  });
  it("repairs an old recorded acceptance without another send or invented delivery fact", async () => {
    const item = await queue(), state = await uncertain(item);
    await recordEmailAcceptance(state.emailMessageId, randomUUID());
    await recoverSupportEmailReceipt(review(state));
    expect((await current(state.id)).status).toBe("SENT"); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["exact", "mismatch", "access-revoked", "stale"])("qualifies provider recovery with %s evidence and current authority", async scenario => {
    const item = await queue(), state = await uncertain(item), providerId = randomUUID();
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (scenario === "access-revoked") await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { denies: ["email.manage"] } });
      if (scenario === "stale") await prisma.supportEmailDelivery.update({ where: { id: state.id }, data: { lastError: "Another reviewer changed this record" } });
      const expected = JSON.parse(preparedEmail(item.email!).body);
      return Response.json({ ...expected, object: "email", id: providerId, cc: [], bcc: [], reply_to: [], scheduled_at: null, last_event: "delivered", created_at: state.firstAttemptAt!.toISOString(), text: scenario === "mismatch" ? "unrelated" : expected.text });
    }));
    if (scenario === "exact") {
      await recoverSupportEmailReceipt({ ...review(state), providerId });
      const record = await prisma.emailMessage.findUniqueOrThrow({ where: { id: state.emailMessageId } }); expect(record.acceptedAt).toEqual(state.firstAttemptAt); expect(record.deliveredAt).toBeNull();
    } else { await expect(recoverSupportEmailReceipt({ ...review(state), providerId })).rejects.toThrow(); expect((await current(state.id)).status).toBe("REVIEW"); }
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("GET");
  });
  it("preserves old attempts and frozen content when explicitly approving one replacement", async () => {
    const item = await queue(), state = await uncertain(item);
    const next = await repeatSupportEmail(repeat(state)); ledgerIds.push(next.emailMessageId);
    expect(next.generation).toBe(2); expect(preparedEmail(frozenSupportEmail(next)).body).toBe(preparedEmail(item.email!).body);
    expect(next.emailMessageId).not.toBe(state.emailMessageId);
    expect((await current(state.id)).emailMessageId).toBe(state.emailMessageId);
    await expect(repeatSupportEmail(repeat(state))).rejects.toThrow(/newer|changed/);
    expect(fetch).not.toHaveBeenCalled(); await deliverSupportEmails(); expect(fetch).toHaveBeenCalledTimes(1);
    const audits = await prisma.platformAuditEvent.findMany({ where: { actorUserId: f.admin.user.id } }); expect(JSON.stringify(audits)).not.toContain("PRIVATE_SUPPORT_REPLY_SENTINEL");
  });
  it.each(["password", "mfa", "permission", "duplicate", "too-soon", "recipient"])("refuses an unqualified replacement: %s", async failure => {
    const item = await queue(), state = await uncertain(item, failure === "too-soon" ? 1 : 25), input = repeat(state);
    if (failure === "password") input.password = "wrong";
    if (failure === "mfa") await prisma.adminMfaSession.updateMany({ where: { userId: f.admin.user.id }, data: { verifiedAt: new Date(Date.now() - 11 * 60_000) } });
    if (failure === "permission") await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { denies: ["email.manage"] } });
    if (failure === "duplicate") input.duplicateRiskAccepted = false;
    if (failure === "recipient") await prisma.user.update({ where: { id: f.customer.user.id }, data: { email: `changed-${randomUUID()}@example.test` } });
    await expect(repeatSupportEmail(input)).rejects.toThrow(); expect(await prisma.supportEmailDelivery.count({ where: { messageId: item.message.id } })).toBe(1); expect(fetch).not.toHaveBeenCalled();
  });
  it("closes a legacy review without changing the customer's conversation or sending", async () => {
    const item = await queue();
    const state = await prisma.supportEmailDelivery.update({ where: { id: item.delivery.id }, data: { status: "REVIEW", messageCiphertext: "" } });
    await expect(retrySupportEmail(review(state))).rejects.toThrow("no frozen content");
    await cancelSupportEmail(review(state)); expect((await current(state.id)).status).toBe("CANCELED");
    expect((await prisma.supportTicketMessage.findUniqueOrThrow({ where: { id: item.message.id } })).body).toBe(item.message.body); expect(fetch).not.toHaveBeenCalled();
  });
  it("reports overdue and review counts to the independent monitor without private ticket data", async () => {
    const item = await queue();
    await prisma.supportEmailDelivery.update({ where: { id: item.delivery.id }, data: { availableAt: new Date(Date.now() - 3600_000) } });
    const input = { webReady: true, backupAgeHours: 1, restoreAgeDays: 1, notificationsConfigured: true };
    const overdue = (await collectOperationsSignals(input)).find(row => row.code === "email")!;
    expect(overdue.state).toBe("WARNING"); expect(overdue.evidence.supportOverdue).toBeGreaterThanOrEqual(1);
    await uncertain(item);
    const reviewed = (await collectOperationsSignals(input)).find(row => row.code === "email")!;
    expect(reviewed.state).toBe("WARNING"); expect(reviewed.evidence.supportReview).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(reviewed)).not.toMatch(/PRIVATE_SUPPORT|example.test/); expect(fetch).not.toHaveBeenCalled();
  });
});
