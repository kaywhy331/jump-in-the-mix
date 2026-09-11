import { openTestAdmission } from "./helpers/admission-fixture";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  return { ...mod, env: { ...mod.env, pilotMode: false, appUrl: "https://example.test", dataEncryptionKey: "waitlist-integration-key" } };
});
vi.mock("@/lib/transactional-email", async original => ({ ...await original<typeof import("../src/lib/transactional-email")>(), transactionalEmailConfigured: () => true, sendTransactionalEmail: mail.send }));
import { confirmWaitlistEntry, inviteSelectedWaitlistEntries, normalizeWaitlistEmail, requestWaitlistEntry, runDueWaitlistWave, WAITLIST_INTERVAL_MS } from "../src/lib/waitlist";
import { deliverWaitlistInvitations, WAITLIST_RETRY_WINDOW_MS } from "../src/lib/waitlist-delivery";
import { allocateAccessInvite } from "../src/lib/referral-access";
import { createBusinessAccount } from "../src/lib/account-provisioning";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { createInvitationStopLink, requestInvitationStopLink, stopInvitationEmails } from "../src/lib/invitation-preferences";

// This suite owns the singleton waitlist schedule. Only use disposable local test DBs.
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const users: string[] = [];
async function cleanup() {
  await prisma.waitlistDelivery.deleteMany({ where: { invite: { OR: [{ source: { not: "REFERRAL" } }, { inviterUserId: { in: users } }] } } });
  await prisma.referralAccessInvite.deleteMany({ where: { source: { not: "REFERRAL" } } });
  await prisma.waitlistWave.deleteMany();
  await prisma.waitlistSchedule.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.waitlistAudit.deleteMany();
  await prisma.emailSuppression.deleteMany();
  await prisma.verificationToken.deleteMany({ where: { purpose: "waitlist" } });
  await prisma.contactActivity.deleteMany({ where: { actorUserId: { in: users } } });
  await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  users.length = 0;
}
async function entries(count: number, verified = true) {
  const prefix = randomUUID();
  return Promise.all(Array.from({ length: count }, (_, i) => prisma.waitlistEntry.create({ data: {
    email: `${prefix}-${i}@example.test`, verifiedAt: verified ? new Date() : null, createdAt: new Date(Date.now() - (count - i) * 1000)
  } })));
}
async function due(now = new Date()) { await prisma.waitlistSchedule.create({ data: { id: "default", nextRunAt: now } }); return now; }
async function member(email = `${randomUUID()}@example.test`) {
  const user = await prisma.user.create({ data: { name: "Member", email, emailVerifiedAt: new Date() } });
  users.push(user.id);
  const workspace = await prisma.workspace.create({ data: { name: "Test", slug: randomUUID(), ownerId: user.id } });
  return { user, workspace };
}

describe.skipIf(!local)("waitlist on PostgreSQL", () => {
  let restoreAdmission: (() => Promise<void>) | undefined;
  beforeAll(async () => { restoreAdmission = await openTestAdmission(); });
  afterAll(async () => { await restoreAdmission?.(); });
  beforeEach(async () => { await cleanup(); mail.send.mockReset().mockResolvedValue({ delivered: true, providerId: "test-provider-id" }); });
  afterAll(cleanup);

  it("normalizes emails without provider-specific transformations", () => {
    expect(normalizeWaitlistEmail("  A.Name+tag@EXAMPLE.com  ")).toBe("a.name+tag@example.com");
    expect(normalizeWaitlistEmail("bad")).toBeNull();
    expect(normalizeWaitlistEmail("x".repeat(255) + "@example.com")).toBeNull();
  });
  it("deduplicates requests, preserves FIFO position, and requires a single-use confirmation", async () => {
    const email = "confirm@example.test";
    const first = await requestWaitlistEntry(email);
    const entry = await prisma.waitlistEntry.findUniqueOrThrow({ where: { email } });
    expect(entry.verifiedAt).toBeNull();
    const second = await requestWaitlistEntry(email);
    expect(await prisma.waitlistEntry.count()).toBe(1);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { email } })).createdAt).toEqual(entry.createdAt);
    expect(await confirmWaitlistEntry(first!)).toBe(false);
    expect(await confirmWaitlistEntry(second!)).toBe(true);
    expect(await confirmWaitlistEntry(second!)).toBe(false);
    expect(await requestWaitlistEntry(email)).toBeNull();
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
  it("carries an allowlisted scenario through waitlist, invitation, and account creation without accepting a later overwrite", async () => {
    const email = "scenario-continuity@example.test";
    const oldToken = await requestWaitlistEntry(email, "painting");
    const token = await requestWaitlistEntry(email, "recruiting");
    const entry = await prisma.waitlistEntry.findUniqueOrThrow({ where: { email } });
    expect(entry).toMatchObject({ marketingScenario: "painting", marketingScenarioVersion: 1 });
    expect(await confirmWaitlistEntry(oldToken!)).toBe(false);
    expect(await confirmWaitlistEntry(token!)).toBe(true);
    await inviteSelectedWaitlistEntries([entry.id], "admin", "Scenario test");
    const invite = await prisma.referralAccessInvite.findFirstOrThrow({ where: { recipientEmail: email } });
    expect(invite).toMatchObject({ marketingScenario: "painting", marketingScenarioVersion: 1 });
    const { token: accessToken } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
    const account = await prisma.$transaction(tx => createBusinessAccount(tx, { email, name: "Scenario member", passwordHash: null, emailVerifiedAt: null, accessToken }));
    users.push(account.id);
    expect(await prisma.workspaceMarketingPreference.findUnique({ where: { workspaceId: account.workspaceId } })).toMatchObject({ scenario: "painting", version: 1 });
  });
  it("rejects expired and invalid confirmation tokens", async () => {
    const token = await requestWaitlistEntry("expired@example.test", new Date(Date.now() - 25 * 60 * 60_000));
    expect(await confirmWaitlistEntry(token!)).toBe(false);
    expect(await confirmWaitlistEntry("invalid")).toBe(false);
  });
  it("starts the seven-day clock once and does not reset it on worker restarts", async () => {
    const now = new Date();
    expect(await runDueWaitlistWave(now)).toBeNull();
    expect(await runDueWaitlistWave(new Date(now.getTime() + 60_000))).toBeNull();
    expect((await prisma.waitlistSchedule.findUniqueOrThrow({ where: { id: "default" } })).nextRunAt.getTime()).toBe(now.getTime() + WAITLIST_INTERVAL_MS);
  });
  it("concurrent workers create one wave of five FIFO and five distinct random recipients", async () => {
    const pool = await entries(20);
    const unconfirmed = await entries(2, false);
    const now = await due();
    const result = await Promise.all([runDueWaitlistWave(now), runDueWaitlistWave(now)]);
    expect(result.filter(Boolean)).toHaveLength(1);
    const grants = await prisma.referralAccessInvite.findMany({ where: { source: { not: "REFERRAL" } } });
    expect(grants).toHaveLength(10);
    expect(new Set(grants.map(g => g.recipientEmail)).size).toBe(10);
    expect(grants.filter(g => g.source === "WAITLIST_FIFO").map(g => g.recipientEmail).sort()).toEqual(pool.slice(0, 5).map(e => e.email).sort());
    expect(grants.filter(g => g.source === "WAITLIST_RANDOM")).toHaveLength(5);
    expect(grants.every(g => !unconfirmed.some(e => e.email === g.recipientEmail))).toBe(true);
    expect(await prisma.waitlistDelivery.count()).toBe(10);
    expect(await prisma.waitlistEntry.count({ where: { status: "WAITING" } })).toBe(12);
  });
  it.each([[0, 0, 0], [3, 3, 0], [7, 5, 2]])("handles a pool of %i without duplicates", async (size, fifo, random) => {
    await entries(size);
    const result = await runDueWaitlistWave(await due());
    expect(result).toMatchObject({ fifo, random });
  });
  it("skips missed slots after downtime and respects pause", async () => {
    await entries(30);
    const scheduled = await due();
    await prisma.waitlistSchedule.update({ where: { id: "default" }, data: { paused: true } });
    const now = new Date(scheduled.getTime() + 3 * WAITLIST_INTERVAL_MS + 1000);
    expect(await runDueWaitlistWave(now)).toBeNull();
    await prisma.waitlistSchedule.update({ where: { id: "default" }, data: { paused: false } });
    await runDueWaitlistWave(now);
    expect(await runDueWaitlistWave(now)).toBeNull();
    expect(await prisma.waitlistWave.count()).toBe(1);
    expect((await prisma.waitlistSchedule.findUniqueOrThrow({ where: { id: "default" } })).nextRunAt.getTime()).toBe(scheduled.getTime() + 4 * WAITLIST_INTERVAL_MS);
  });
  it("manual selection ignores unconfirmed, unknown and already-granted entries, without changing cadence or personal quota", async () => {
    const admin = await member();
    const pool = await entries(3);
    const [unconfirmed] = await entries(1, false);
    const scheduled = await due();
    const selected = [pool[1].id, pool[1].id, unconfirmed.id, "missing"];
    expect(await inviteSelectedWaitlistEntries(selected, admin.user.id, "Launch partners")).toEqual({ queued: 1, skipped: 2 });
    expect(await inviteSelectedWaitlistEntries(selected, admin.user.id, "Retry")).toEqual({ queued: 0, skipped: 3 });
    expect((await prisma.waitlistSchedule.findUniqueOrThrow({ where: { id: "default" } })).nextRunAt).toEqual(scheduled);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.user.id } })).referralInvitesIssued).toBe(0);
    expect(await prisma.waitlistAudit.findFirst()).toMatchObject({ actorUserId: admin.user.id, action: "WAITLIST_MANUAL", reason: "Launch partners" });
  });
  it("excludes existing users and existing grants before selecting a wave", async () => {
    const pool = await entries(13);
    await member(pool[0].email);
    await inviteSelectedWaitlistEntries([pool[1].id], "admin", "Manual");
    await prisma.waitlistEntry.update({ where: { id: pool[1].id }, data: { status: "WAITING" } });
    const wave = await runDueWaitlistWave(await due());
    expect(wave).toMatchObject({ fifo: 5, random: 5 });
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: pool[0].email } })).toBe(0);
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: pool[1].email } })).toBe(1);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: pool[0].id } })).status).toBe("JOINED");
  });
  it("a referral racing a manual invite grants once and removes Waiting immediately", async () => {
    const { user, workspace } = await member();
    const [entry] = await entries(1);
    const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Friend", emails: { create: { email: entry.email, normalized: entry.email } } } });
    const results = await Promise.allSettled([
      prisma.$transaction(tx => allocateAccessInvite(tx, { expectedVersion: 1, userId: user.id, workspaceId: workspace.id, contactId: contact.id, recipientEmail: entry.email })),
      inviteSelectedWaitlistEntries([entry.id], "admin", "Manual")
    ]);
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: entry.email } })).toBe(1);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("ACCESS_GRANTED");
    const grant = await prisma.referralAccessInvite.findFirstOrThrow({ where: { recipientEmail: entry.email } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).referralInvitesIssued).toBe(grant.source === "REFERRAL" ? 1 : 0);
  });
  it("manual selection racing a scheduled wave cannot issue the same recipient twice", async () => {
    const pool = await entries(20);
    const now = await due();
    await Promise.all([runDueWaitlistWave(now), inviteSelectedWaitlistEntries([pool[0].id], "admin", "Manual")]);
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: pool[0].email } })).toBe(1);
    expect(await prisma.waitlistWave.count()).toBe(1);
    expect(await prisma.referralAccessInvite.count({ where: { source: { in: ["WAITLIST_FIFO", "WAITLIST_RANDOM"] } } })).toBe(10);
  });
  it("rolls back every grant and the schedule if a wave fails before commit", async () => {
    await entries(12);
    const scheduled = await due();
    const transaction = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementationOnce(((callback: any, options: any) => transaction(async tx => {
      await callback(tx);
      throw new Error("Simulated failure before commit");
    }, options)) as any);
    try { await expect(runDueWaitlistWave(scheduled)).rejects.toThrow("Simulated failure"); } finally { spy.mockRestore(); }
    expect(await prisma.waitlistWave.count()).toBe(0);
    expect(await prisma.waitlistDelivery.count()).toBe(0);
    expect(await prisma.waitlistEntry.count({ where: { status: "WAITING" } })).toBe(12);
    expect((await prisma.waitlistSchedule.findUniqueOrThrow({ where: { id: "default" } })).nextRunAt).toEqual(scheduled);
    expect(await runDueWaitlistWave(scheduled)).toMatchObject({ fifo: 5, random: 5 });
  });
  it("platform links are email-bound and single-use; failed signup rolls back, successful signup gets five slots", async () => {
    const [entry] = await entries(1);
    await inviteSelectedWaitlistEntries([entry.id], "admin", "Test");
    const invite = await prisma.referralAccessInvite.findFirstOrThrow({ where: { recipientEmail: entry.email } });
    const { token } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
    const input = { email: entry.email, name: "New member", passwordHash: null, emailVerifiedAt: null, accessToken: token };
    await expect(prisma.$transaction(tx => createBusinessAccount(tx, { ...input, email: "wrong@example.test" }))).rejects.toThrow("unavailable");
    await expect(prisma.$transaction(async tx => { await createBusinessAccount(tx, input); throw new Error("Rollback"); })).rejects.toThrow("Rollback");
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).toBeNull();
    const user = await prisma.$transaction(tx => createBusinessAccount(tx, input)); users.push(user.id);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("JOINED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).referralInvitesIssued).toBe(0);
    await expect(prisma.$transaction(tx => createBusinessAccount(tx, input))).rejects.toThrow("unavailable");
  });
  it("concurrent senders claim one delivery and mark provider acceptance", async () => {
    const [entry] = await entries(1);
    await inviteSelectedWaitlistEntries([entry.id], "admin", "Test");
    await Promise.all([deliverWaitlistInvitations(), deliverWaitlistInvitations()]);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(await prisma.waitlistDelivery.findFirst()).toMatchObject({ status: "SENT", providerId: "test-provider-id" });
    expect((await prisma.referralAccessInvite.findFirstOrThrow({ where: { recipientEmail: entry.email } })).lastSentAt).not.toBeNull();
  });
  it("retries identical encrypted messages and stops uncertain sends outside the provider window", async () => {
    const [entry] = await entries(1);
    await inviteSelectedWaitlistEntries([entry.id], "admin", "Test");
    mail.send.mockRejectedValue(new Error("sensitive provider response"));
    const now = new Date();
    await deliverWaitlistInvitations(now);
    expect(await prisma.waitlistDelivery.findFirst()).toMatchObject({ status: "QUEUED", attempts: 1 });
    await deliverWaitlistInvitations(new Date(now.getTime() + 120_000));
    expect(mail.send.mock.calls[0][0]).toEqual(mail.send.mock.calls[1][0]);
    await deliverWaitlistInvitations(new Date(now.getTime() + WAITLIST_RETRY_WINDOW_MS + 1000));
    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(await prisma.waitlistDelivery.findFirst()).toMatchObject({ status: "REVIEW" });
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: entry.email } })).toBe(1);
  });
  it("recovers a stale lease using the same key and cancels revoked invitations", async () => {
    const pool = await entries(2);
    await inviteSelectedWaitlistEntries(pool.map(e => e.id), "admin", "Test");
    const deliveries = await prisma.waitlistDelivery.findMany();
    await prisma.waitlistDelivery.update({ where: { id: deliveries[0].id }, data: { status: "SENDING", leaseId: "crashed-worker", lockedAt: new Date(Date.now() - 10 * 60_000), firstAttemptAt: new Date(Date.now() - 10 * 60_000) } });
    expect((await prisma.referralAccessInvite.updateMany({ where: { delivery: { id: deliveries[1].id } }, data: { revokedAt: new Date() } })).count).toBe(1);
    await deliverWaitlistInvitations();
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(await prisma.waitlistDelivery.findUnique({ where: { id: deliveries[1].id } })).toMatchObject({ status: "CANCELED" });
  });

  it("withdraws using email proof, invalidates all unused grants, and cancels pending email", async () => {
    const [entry] = await entries(1);
    await inviteSelectedWaitlistEntries([entry.id], "admin", "Test withdrawal");
    const invite = await prisma.referralAccessInvite.findFirstOrThrow({ where: { recipientEmail: entry.email } });
    const { token: accessToken } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
    const url = await requestInvitationStopLink(entry.email);
    const token = new URL(url!).searchParams.get("token")!;
    expect(await stopInvitationEmails("invalid")).toBe(false);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("ACCESS_GRANTED");
    expect(await stopInvitationEmails(token)).toBe(true);
    expect(await stopInvitationEmails(token)).toBe(false);
    expect(await prisma.waitlistEntry.findUnique({ where: { id: entry.id } })).toMatchObject({ status: "WITHDRAWN", withdrawnAt: expect.any(Date) });
    expect(await prisma.waitlistDelivery.findUnique({ where: { inviteId: invite.id } })).toMatchObject({ status: "CANCELED" });
    await deliverWaitlistInvitations();
    expect(mail.send).not.toHaveBeenCalled();
    await expect(prisma.$transaction(tx => createBusinessAccount(tx, { email: entry.email, name: "Recipient", passwordHash: null, emailVerifiedAt: null, accessToken }))).rejects.toThrow("unavailable");
    expect(await inviteSelectedWaitlistEntries([entry.id], "admin", "Retry withdrawn entry")).toEqual({ queued: 0, skipped: 1 });
  });

  it("does not let an unconfirmed new request undo withdrawal, and confirmed rejoining resets FIFO position", async () => {
    const [entry] = await entries(1);
    const oldConfirmation = await requestWaitlistEntry("unconfirmed-before-stop@example.test");
    const unconfirmedUrl = await requestInvitationStopLink("unconfirmed-before-stop@example.test");
    await stopInvitationEmails(new URL(unconfirmedUrl!).searchParams.get("token")!);
    expect(await confirmWaitlistEntry(oldConfirmation!)).toBe(false);
    const stopUrl = await requestInvitationStopLink(entry.email);
    const anotherStopUrl = await requestInvitationStopLink(entry.email);
    await stopInvitationEmails(new URL(stopUrl!).searchParams.get("token")!);
    const confirmation = await requestWaitlistEntry(entry.email);
    expect(await prisma.waitlistEntry.findUnique({ where: { id: entry.id } })).toMatchObject({ status: "WITHDRAWN" });
    expect(await prisma.emailSuppression.count({ where: { email: entry.email } })).toBe(1);
    expect(await confirmWaitlistEntry(confirmation!)).toBe(true);
    const rejoined = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(rejoined.status).toBe("WAITING");
    expect(rejoined.createdAt.getTime()).toBeGreaterThan(entry.createdAt.getTime());
    expect(await prisma.emailSuppression.count({ where: { email: entry.email } })).toBe(0);
    expect(await stopInvitationEmails(new URL(anotherStopUrl!).searchParams.get("token")!)).toBe(false);
  });

  it("keeps delivery suppression after a public rejoin request and excludes suppressed entries from waves", async () => {
    const pool = await entries(12);
    await prisma.emailSuppression.create({ data: { email: pool[0].email, reason: "HARD_BOUNCE" } });
    expect(await requestWaitlistEntry(pool[0].email)).toBeNull();
    await runDueWaitlistWave(await due());
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: pool[0].email } })).toBe(0);
    expect(await prisma.emailSuppression.count({ where: { email: pool[0].email } })).toBe(1);
  });

  it("withdrawal racing a manual grant always leaves no usable access or queued email", async () => {
    const [entry] = await entries(1);
    const url = await requestInvitationStopLink(entry.email);
    await Promise.all([stopInvitationEmails(new URL(url!).searchParams.get("token")!), inviteSelectedWaitlistEntries([entry.id], "admin", "Racing request")]);
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: entry.email, revokedAt: null } })).toBe(0);
    expect(await prisma.waitlistDelivery.count({ where: { invite: { recipientEmail: entry.email }, status: { in: ["QUEUED", "SENDING"] } } })).toBe(0);
    expect(await prisma.waitlistEntry.findUnique({ where: { id: entry.id } })).toMatchObject({ status: "WITHDRAWN" });
  });

  it("queues one immutable member email atomically and respects recipient withdrawal without refunding a slot", async () => {
    const { user, workspace } = await member();
    const email = `${randomUUID()}@example.test`;
    const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Friend <script>", emails: { create: { email, normalized: email } } } });
    const input = { expectedVersion: 1, userId: user.id, workspaceId: workspace.id, contactId: contact.id, recipientEmail: email };
    const invite = await prisma.$transaction(tx => allocateAccessInvite(tx, input));
    const original = await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: invite.id } });
    const message = decryptIntegrationCredentials<{ text: string; html: string; idempotencyKey: string }>(original.messageCiphertext);
    expect(message.text).toContain("/register?invite=");
    expect(message.text).toContain("/waitlist/leave?token=");
    expect(message.html).not.toContain("<script>");
    expect(message.idempotencyKey).toBe(`system-invite-${invite.id}`);
    await prisma.contact.update({ where: { id: contact.id }, data: { displayName: "Edited after queue" } });
    expect((await prisma.$transaction(tx => allocateAccessInvite(tx, input))).id).toBe(invite.id);
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: invite.id } })).messageCiphertext).toBe(original.messageCiphertext);
    mail.send.mockRejectedValueOnce(new Error("Temporary provider failure"));
    const now = new Date();
    await deliverWaitlistInvitations(now);
    await deliverWaitlistInvitations(new Date(now.getTime() + 120_000));
    expect(mail.send.mock.calls[0][0]).toEqual(mail.send.mock.calls[1][0]);
    const url = await requestInvitationStopLink(email);
    expect(await stopInvitationEmails(new URL(url!).searchParams.get("token")!)).toBe(true);
    await expect(prisma.$transaction(tx => allocateAccessInvite(tx, input))).rejects.toThrow("cannot be sent");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).referralInvitesIssued).toBe(1);
  });

  it("rejects expired stop tokens, ignores unknown recipients, and leaves existing accounts intact", async () => {
    expect(await requestInvitationStopLink("unknown@example.test")).toBeNull();
    const { user } = await member();
    const old = await prisma.$transaction(tx => createInvitationStopLink(tx, user.email, new Date(Date.now() - 91 * 24 * 60 * 60_000)));
    expect(await stopInvitationEmails(new URL(old).searchParams.get("token")!)).toBe(false);
    const current = await prisma.$transaction(tx => createInvitationStopLink(tx, user.email));
    expect(await stopInvitationEmails(new URL(current).searchParams.get("token")!)).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });
});
