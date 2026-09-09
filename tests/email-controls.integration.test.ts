import { openTestAdmission } from "./helpers/admission-fixture";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import { prisma } from "../src/lib/prisma";
const settings = vi.hoisted(() => ({ daily: 90, monthly: 2700, dailyReserve: 20, monthlyReserve: 300, secret: "" }));
vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  return { ...mod, env: { ...mod.env, pilotMode: false, appUrl: "https://example.test", dataEncryptionKey: "email-controls-test-encryption-key", resendApiKey: "test-only", emailFrom: "sender@example.test",
    get emailDailyLimit() { return settings.daily; }, get emailMonthlyLimit() { return settings.monthly; },
    get emailDailyAuthReserve() { return settings.dailyReserve; }, get emailMonthlyAuthReserve() { return settings.monthlyReserve; },
    get resendWebhookSecret() { return settings.secret; }
  } };
});
import { reserveEmailAttempt, emailMessageId, emailRecipientHash } from "../src/lib/email-budget";
import { recordEmailAcceptance, receiveEmailProviderEvent } from "../src/lib/email-events";
import { sendTransactionalEmail } from "../src/lib/transactional-email";
import { POST } from "../src/app/api/webhooks/resend/route";
import { inviteSelectedWaitlistEntries, requestWaitlistEntry } from "../src/lib/waitlist";
import { deliverWaitlistInvitations } from "../src/lib/waitlist-delivery";
import { emailDeliveryLabel } from "../src/lib/email-status";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const emails: string[] = [];
const eventIds: string[] = [];
const fetchMock = vi.fn();
const recipient = () => { const email = `email-control-${randomUUID()}@example.test`; emails.push(email); return email; };
const reserveInput = (email = recipient(), category: "AUTH" | "PRODUCT" | "INVITATION" = "INVITATION") => ({ key: randomUUID(), email, payloadHash: createHash("sha256").update("sample").digest("hex"), category });
function event(type: string, email: string, providerId = randomUUID(), now = new Date()) {
  return { type, created_at: now.toISOString(), data: { email_id: providerId, to: [email], from: "Sender <sender@example.test>", subject: "SECRET CUSTOMER SUBJECT", html: "SECRET EMAIL CONTENT", bounce: { type: "Permanent", message: "PRIVATE PROVIDER RESPONSE" } } };
}
async function signedRequest(payload: unknown, options: { id?: string; time?: Date; tamper?: boolean } = {}) {
  const id = options.id ?? `msg_${randomUUID()}`; eventIds.push(id);
  const date = options.time ?? new Date();
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const signature = new Webhook(settings.secret).sign(id, date, body);
  return POST(new Request("https://example.test/api/webhooks/resend", { method: "POST", headers: {
    "content-type": "application/json", "svix-id": id, "svix-timestamp": String(Math.floor(date.getTime() / 1000)), "svix-signature": signature
  }, body: options.tamper ? `${body} ` : body }));
}
async function cleanup() {
  await prisma.referralAccessInvite.deleteMany({ where: { recipientEmail: { in: emails } } });
  await prisma.waitlistAudit.deleteMany({ where: { entryId: { in: (await prisma.waitlistEntry.findMany({ where: { email: { in: emails } }, select: { id: true } })).map(row => row.id) } } });
  await prisma.waitlistEntry.deleteMany({ where: { email: { in: emails } } });
  await prisma.verificationToken.deleteMany({ where: { email: { in: emails } } });
  await prisma.emailSuppression.deleteMany({ where: { email: { in: emails } } });
  await prisma.emailMessage.deleteMany();
  await prisma.emailProviderEvent.deleteMany();
  await prisma.platformAuditEvent.deleteMany({ where: { entityType: "EmailProviderEvent" } });
  emails.length = 0; eventIds.length = 0;
}

describe.skipIf(!local)("email delivery controls on PostgreSQL", () => {
  let restoreAdmission: (() => Promise<void>) | undefined;
  beforeAll(async () => { restoreAdmission = await openTestAdmission(); });
  afterAll(async () => { await restoreAdmission?.(); });
  beforeEach(async () => {
    await cleanup();
    settings.daily = 90; settings.monthly = 2700; settings.dailyReserve = 20; settings.monthlyReserve = 300;
    settings.secret = `whsec_${randomBytes(32).toString("base64")}`;
    fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: randomUUID() }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(cleanup);

  it("serializes competing reservations and preserves the daily account-email reserve", async () => {
    settings.daily = 8; settings.dailyReserve = 2;
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => reserveEmailAttempt(reserveInput())));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(6);
    await reserveEmailAttempt(reserveInput(recipient(), "AUTH"));
    await reserveEmailAttempt(reserveInput(recipient(), "AUTH"));
    await expect(reserveEmailAttempt(reserveInput(recipient(), "AUTH"))).rejects.toMatchObject({ code: "BUDGET" });
    expect(await prisma.emailSendAttempt.count()).toBe(8);
  });
  it("enforces a rolling 31-day ceiling as well as the daily ceiling", async () => {
    settings.monthly = 5; settings.monthlyReserve = 1;
    const old = new Date(Date.now() - 2 * 86400_000);
    for (let i = 0; i < 4; i++) await reserveEmailAttempt(reserveInput(), old);
    await expect(reserveEmailAttempt(reserveInput())).rejects.toMatchObject({ code: "BUDGET" });
    await reserveEmailAttempt(reserveInput(recipient(), "AUTH"));
    await expect(reserveEmailAttempt(reserveInput(recipient(), "AUTH"))).rejects.toMatchObject({ code: "BUDGET" });
    await reserveEmailAttempt(reserveInput(), new Date(old.getTime() + 31 * 86400_000 + 2000));
  });
  it("caches accepted requests, rejects changed content, and rejects uncertain retries after 23 hours", async () => {
    const input = reserveInput();
    await reserveEmailAttempt(input);
    await recordEmailAcceptance(emailMessageId(input.key), "provider-record");
    expect((await reserveEmailAttempt(input)).cached).toBe(true);
    expect(await prisma.emailSendAttempt.count()).toBe(1);
    await expect(reserveEmailAttempt({ ...input, payloadHash: "changed" })).rejects.toMatchObject({ code: "MISMATCH" });
    const uncertain = reserveInput();
    const start = new Date(); await reserveEmailAttempt(uncertain, start);
    await expect(reserveEmailAttempt(uncertain, new Date(start.getTime() + 23 * 3600_000))).rejects.toMatchObject({ code: "REVIEW" });
  });
  it("uses a stable generated idempotency key and counts each actual retry conservatively", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: "accepted-on-retry" }), { status: 200 }));
    const result = await sendTransactionalEmail({ category: "AUTH", to: recipient(), subject: "Account email", text: "private link", html: "<p>private link</p>" });
    expect(result).toMatchObject({ delivered: true, providerId: "accepted-on-retry" });
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]);
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
    expect(await prisma.emailSendAttempt.count()).toBe(2);
  });
  it("does not retry permanent provider rejection or report acceptance without a provider ID", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"message":"private provider response"}', { status: 422 }));
    const message = { to: recipient(), subject: "Test", text: "Secret", html: "<p>Secret</p>" };
    await expect(sendTransactionalEmail(message)).rejects.toThrow("status 422");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReset().mockImplementation(async () => new Response("{}", { status: 200 }));
    await expect(sendTransactionalEmail(message)).rejects.toThrow("could not be confirmed");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await prisma.emailMessage.count({ where: { acceptedAt: { not: null } } })).toBe(0);
  });
  it("defers an invitation without starting its retry window or consuming an attempt", async () => {
    settings.daily = 2; settings.dailyReserve = 1;
    await reserveEmailAttempt(reserveInput());
    const email = recipient();
    const entry = await prisma.waitlistEntry.create({ data: { email, verifiedAt: new Date() } });
    await inviteSelectedWaitlistEntries([entry.id], "test-operator", "Budget deferral test");
    await deliverWaitlistInvitations();
    expect(fetchMock).not.toHaveBeenCalled();
    const delivery = await prisma.waitlistDelivery.findFirstOrThrow({ where: { invite: { recipientEmail: email } } });
    expect(delivery).toMatchObject({ status: "QUEUED", attempts: 0, firstAttemptAt: null });
    expect(delivery.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await prisma.emailSendAttempt.deleteMany();
    await prisma.waitlistDelivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date() } });
    await deliverWaitlistInvitations();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await prisma.waitlistDelivery.findUnique({ where: { id: delivery.id } })).toMatchObject({ status: "SENT", firstAttemptAt: expect.any(Date), emailMessageId: expect.any(String) });
  });
  it("verifies raw signatures and timestamps before changing the database", async () => {
    const email = recipient();
    expect((await signedRequest(event("email.bounced", email), { tamper: true })).status).toBe(401);
    expect((await signedRequest(event("email.bounced", email), { time: new Date(Date.now() - 10 * 60_000) })).status).toBe(401);
    expect((await signedRequest(event("email.bounced", email), { time: new Date(Date.now() + 10 * 60_000) })).status).toBe(401);
    expect(await prisma.emailProviderEvent.count()).toBe(0);
    expect(await prisma.emailSuppression.count({ where: { email } })).toBe(0);
  });
  it("processes a valid bounce once, cancels grants, and blocks every future email category", async () => {
    const email = recipient();
    const entry = await prisma.waitlistEntry.create({ data: { email, verifiedAt: new Date() } });
    await inviteSelectedWaitlistEntries([entry.id], "test-operator", "Bounce test");
    const payload = event("email.bounced", email); const id = `msg_${randomUUID()}`;
    expect((await signedRequest(payload, { id })).status).toBe(200);
    expect(await (await signedRequest(payload, { id })).json()).toEqual({ duplicate: true });
    expect(await prisma.emailProviderEvent.count()).toBe(1);
    expect(await prisma.waitlistEntry.findUnique({ where: { id: entry.id } })).toMatchObject({ status: "SUPPRESSED" });
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: email, revokedAt: null } })).toBe(0);
    expect(await requestWaitlistEntry(email)).toBeNull();
    for (const category of ["AUTH", "INVITATION", "PRODUCT"] as const) await expect(reserveEmailAttempt(reserveInput(email, category))).rejects.toMatchObject({ code: "SUPPRESSED" });
    expect(JSON.stringify(await prisma.emailProviderEvent.findFirst())).not.toContain(email);
    expect(JSON.stringify(await prisma.emailProviderEvent.findFirst())).not.toContain("SECRET");
    expect(JSON.stringify(await prisma.platformAuditEvent.findFirst({ where: { entityId: id } }))).not.toContain("PRIVATE");
  });
  it("reconciles events arriving before API acceptance without losing adverse outcomes to older events", async () => {
    const email = recipient(); const input = reserveInput(email); const providerId = randomUUID();
    await reserveEmailAttempt(input);
    await receiveEmailProviderEvent(randomUUID(), event("email.complained", email, providerId));
    await receiveEmailProviderEvent(randomUUID(), event("email.delivered", email, providerId, new Date(Date.now() - 1000)));
    await recordEmailAcceptance(emailMessageId(input.key), providerId);
    const message = await prisma.emailMessage.findUniqueOrThrow({ where: { id: emailMessageId(input.key) } });
    expect(message.complainedAt).not.toBeNull(); expect(message.deliveredAt).not.toBeNull();
    expect(emailDeliveryLabel(message)).toBe("Marked as spam");
    expect(await prisma.emailSuppression.count({ where: { email, reason: "COMPLAINT" } })).toBe(1);
  });
  it("preserves cancellation when a bounce arrives during the outgoing API request", async () => {
    const email = recipient(); const providerId = randomUUID();
    const entry = await prisma.waitlistEntry.create({ data: { email, verifiedAt: new Date() } });
    await inviteSelectedWaitlistEntries([entry.id], "test-operator", "Concurrent webhook test");
    fetchMock.mockImplementationOnce(async () => {
      await receiveEmailProviderEvent(randomUUID(), event("email.bounced", email, providerId));
      return new Response(JSON.stringify({ id: providerId }), { status: 200 });
    });
    await deliverWaitlistInvitations();
    const delivery = await prisma.waitlistDelivery.findFirstOrThrow({ where: { invite: { recipientEmail: email } }, include: { emailMessage: true } });
    expect(delivery.status).toBe("CANCELED"); expect(delivery.providerId).toBe(providerId);
    expect(delivery.emailMessage?.bouncedAt).not.toBeNull();
  });
  it("does not suppress temporary delivery problems or override invitation opt-out for authentication", async () => {
    const email = recipient();
    await receiveEmailProviderEvent(randomUUID(), event("email.delivery_delayed", email));
    await receiveEmailProviderEvent(randomUUID(), event("email.failed", email));
    expect(await prisma.emailSuppression.count({ where: { email } })).toBe(0);
    await prisma.emailSuppression.create({ data: { email, reason: "INVITATION_OPTOUT" } });
    await reserveEmailAttempt(reserveInput(email, "AUTH"));
    await expect(reserveEmailAttempt(reserveInput(email))).rejects.toMatchObject({ code: "SUPPRESSED" });
  });
  it("handles provider suppression without automatically honoring a suppression removal event", async () => {
    const email = recipient();
    expect((await signedRequest({ type: "suppression.added", created_at: new Date().toISOString(), data: { email, origin: "manual" } })).status).toBe(200);
    expect(await prisma.emailSuppression.count({ where: { email } })).toBe(1);
    expect(await (await signedRequest({ type: "suppression.removed" })).json()).toEqual({ ignored: true });
    expect(await prisma.emailSuppression.count({ where: { email } })).toBe(1);
  });
  it("rejects malformed/oversized signed data and requests without configuration", async () => {
    expect((await signedRequest("not json")).status).toBe(400);
    expect((await signedRequest({ type: "email.bounced", created_at: "bad date", data: {} })).status).toBe(400);
    expect((await signedRequest({ type: "email.bounced", padding: "x".repeat(70_000) })).status).toBe(413);
    settings.secret = "";
    expect((await POST(new Request("https://example.test/api/webhooks/resend", { method: "POST" }))).status).toBe(503);
    expect(await prisma.emailProviderEvent.count()).toBe(0);
  });
  it("ignores open/click tracking without retaining the payload", async () => {
    expect(await (await signedRequest({ type: "email.clicked", data: { url: "https://private.example/?token=secret" } })).json()).toEqual({ ignored: true });
    expect(await prisma.emailProviderEvent.count()).toBe(0);
  });
});
