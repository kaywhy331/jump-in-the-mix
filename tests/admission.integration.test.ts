import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import { openTestAdmission } from "./helpers/admission-fixture";
vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  return { ...mod, env: { ...mod.env, pilotMode: false, requireAdminMfa: true, dataEncryptionKey: "admission-test-key", appUrl: "https://example.test" } };
});
vi.mock("@/lib/transactional-email", async original => ({ ...await original<typeof import("../src/lib/transactional-email")>(), transactionalEmailConfigured: () => true }));
import { getAdmissionSnapshot, DEFAULT_ADMISSION_POLICY } from "../src/lib/admission";
import { changeAdmissionPolicy } from "../src/lib/admission-admin";
import { allocateAccessInvite } from "../src/lib/referral-access";
import { createBusinessAccount } from "../src/lib/account-provisioning";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { confirmWaitlistEntry, inviteSelectedWaitlistEntries, requestWaitlistEntry, runDueWaitlistWave, WAITLIST_INTERVAL_MS } from "../src/lib/waitlist";
import { lockAccess } from "../src/lib/access-lock";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const emails: string[] = [], ids: string[] = [];
const password = "Admission controls local test!";
const passwordHash = await bcrypt.hash(password, 4);
const email = () => { const value = `admission-${randomUUID()}@example.test`; emails.push(value); return value; };
async function person(staff = false) {
  const user = await prisma.user.create({ data: { email: email(), name: "Admission fixture", emailVerifiedAt: new Date(), passwordHash, ...(staff ? { staffMembership: { create: { role: "OWNER" } } } : {}) } });
  ids.push(user.id); return user;
}
async function network(count = 3) {
  const owner = await person();
  const workspace = await prisma.workspace.create({ data: { name: "Admission fixture", slug: randomUUID(), ownerId: owner.id } });
  const inputs = [];
  for (let i = 0; i < count; i++) {
    const recipientEmail = email();
    const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Contact", emails: { create: { email: recipientEmail, normalized: recipientEmail } } } });
    inputs.push({ expectedVersion: 1, userId: owner.id, workspaceId: workspace.id, contactId: contact.id, recipientEmail });
  }
  return { owner, inputs };
}
async function entries(count: number) {
  const pool = [];
  for (let i = 0; i < count; i++) pool.push(await prisma.waitlistEntry.create({ data: { email: email(), verifiedAt: new Date(), createdAt: new Date(Date.now() - (count - i) * 1000) } }));
  return pool;
}
async function configuration(data: Partial<typeof DEFAULT_ADMISSION_POLICY>) {
  await prisma.admissionPolicy.update({ where: { id: "default" }, data });
}
async function operator() {
  const user = await person(true);
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(randomUUID()).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  return { actorUserId: user.id, actorSessionId: session.id, password, reason: "Measured launch rehearsal capacity", expectedRevision: (await getAdmissionSnapshot()).policy.revision,
    configuration: { ...DEFAULT_ADMISSION_POLICY, accountCeiling: 20, outstandingCeiling: 10 } };
}
async function accept(invite: { tokenCiphertext: string; recipientEmail: string }) {
  const { token } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
  const user = await prisma.$transaction(tx => createBusinessAccount(tx, { email: invite.recipientEmail, name: "New customer", passwordHash, emailVerifiedAt: new Date(), accessToken: token }));
  ids.push(user.id); return user;
}

describe.skipIf(!local)("admission reservations on PostgreSQL", () => {
  let restore: (() => Promise<void>) | undefined;
  beforeEach(async () => { restore = await openTestAdmission(); });
  afterEach(async () => {
    await prisma.referralAccessInvite.deleteMany({ where: { recipientEmail: { in: emails } } });
    await prisma.waitlistAudit.deleteMany({ where: { entryId: { in: (await prisma.waitlistEntry.findMany({ where: { email: { in: emails } }, select: { id: true } })).map(row => row.id) } } });
    await prisma.waitlistEntry.deleteMany({ where: { email: { in: emails } } });
    await prisma.waitlistSchedule.deleteMany(); await prisma.waitlistWave.deleteMany();
    await prisma.verificationToken.deleteMany({ where: { email: { in: emails } } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.adminMfaSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.contactActivity.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.userPreference.deleteMany({ where: { userId: { in: ids } } });
    await prisma.workspace.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    ids.length = 0; emails.length = 0; await restore?.();
  });

  it("defaults closed for new grants without disabling collection or existing redemptions", async () => {
    await prisma.admissionPolicy.deleteMany();
    expect((await getAdmissionSnapshot()).policy).toMatchObject(DEFAULT_ADMISSION_POLICY);
    const { inputs, owner } = await network();
    await expect(prisma.$transaction(tx => allocateAccessInvite(tx, inputs[0]))).rejects.toThrow("access limit");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).referralInvitesIssued).toBe(0);
    expect(await requestWaitlistEntry(email())).toMatch(/^[\w-]{43}$/);
  });
  it("serializes competing referrals for the last available reservation without spending blocked slots", async () => {
    const a = await network(1), b = await network(1);
    const initial = await getAdmissionSnapshot();
    await configuration({ accountCeiling: initial.committed + 1, outstandingCeiling: 1 });
    const results = await Promise.allSettled([a, b].map(f => prisma.$transaction(tx => allocateAccessInvite(tx, f.inputs[0]))));
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect((await getAdmissionSnapshot()).remaining).toBe(0);
    expect((await prisma.user.aggregate({ where: { id: { in: [a.owner.id, b.owner.id] } }, _sum: { referralInvitesIssued: true } }))._sum.referralInvitesIssued).toBe(1);
  });
  it("enforces the outstanding ceiling even when total capacity has room, and retries keep their reservation", async () => {
    const { inputs, owner } = await network();
    await configuration({ outstandingCeiling: 1 });
    const invite = await prisma.$transaction(tx => allocateAccessInvite(tx, inputs[0]));
    await expect(prisma.$transaction(tx => allocateAccessInvite(tx, inputs[1]))).rejects.toThrow("access limit");
    await configuration({ grantsPaused: true });
    expect((await prisma.$transaction(tx => allocateAccessInvite(tx, inputs[0]))).id).toBe(invite.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).referralInvitesIssued).toBe(1);
  });
  it("waits for a whole wave and then releases five oldest plus five random once, skipping missed slots", async () => {
    const pool = await entries(15);
    const scheduled = new Date(Date.now() - 2 * WAITLIST_INTERVAL_MS);
    await prisma.waitlistSchedule.create({ data: { nextRunAt: scheduled } });
    await configuration({ outstandingCeiling: 9 });
    expect(await runDueWaitlistWave()).toBeNull();
    expect(await prisma.waitlistWave.count()).toBe(0);
    expect((await prisma.waitlistSchedule.findUniqueOrThrow({ where: { id: "default" } })).nextRunAt).toEqual(scheduled);
    await configuration({ outstandingCeiling: 10 });
    const results = await Promise.all([runDueWaitlistWave(), runDueWaitlistWave()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean)).toMatchObject({ fifo: 5, random: 5 });
    const fifo = await prisma.referralAccessInvite.findMany({ where: { source: "WAITLIST_FIFO" }, select: { recipientEmail: true } });
    expect(fifo.map(row => row.recipientEmail).sort()).toEqual(pool.slice(0, 5).map(row => row.email).sort());
    expect((await prisma.waitlistSchedule.findUniqueOrThrow({ where: { id: "default" } })).nextRunAt.getTime()).toBe(scheduled.getTime() + 3 * WAITLIST_INTERVAL_MS);
  });
  it("manual batches are all-or-nothing and do not bypass a wave's capacity reservations", async () => {
    const pool = await entries(12);
    await configuration({ outstandingCeiling: 10 });
    await expect(inviteSelectedWaitlistEntries(pool.map(row => row.id), "local-admin", "Manual batch test")).rejects.toThrow("not queued");
    expect(await prisma.waitlistDelivery.count()).toBe(0);
    await prisma.waitlistSchedule.create({ data: { nextRunAt: new Date() } });
    await Promise.allSettled([runDueWaitlistWave(), inviteSelectedWaitlistEntries([pool[11].id], "local-admin", "Competing manual batch")]);
    const state = await getAdmissionSnapshot();
    expect([1, 10]).toContain(state.outstanding);
    expect(state.outstanding).toBeLessThanOrEqual(10);
  });
  it("pauses member referrals independently and pauses all new grants without touching queued delivery", async () => {
    const { inputs } = await network(); const [entry, later] = await entries(2);
    await configuration({ referralsPaused: true });
    await expect(prisma.$transaction(tx => allocateAccessInvite(tx, inputs[0]))).rejects.toThrow("paused");
    await inviteSelectedWaitlistEntries([entry.id], "local-admin", "Platform release remains enabled");
    await configuration({ grantsPaused: true });
    await expect(inviteSelectedWaitlistEntries([later.id], "local-admin", "Paused platform release")).rejects.toThrow("paused");
    expect(await prisma.waitlistDelivery.count({ where: { status: "QUEUED" } })).toBe(1);
  });
  it("preserves existing confirmation links while pausing new collection", async () => {
    const token = await requestWaitlistEntry(email());
    await configuration({ collectionPaused: true });
    await expect(requestWaitlistEntry(email())).rejects.toThrow("requests are paused");
    expect(await confirmWaitlistEntry(token!)).toBe(true);
  });
  it("honors issued reservations after a ceiling decrease and emergency pause consumes nothing", async () => {
    const { inputs } = await network();
    const invite = await prisma.$transaction(tx => allocateAccessInvite(tx, inputs[0]));
    const initial = await getAdmissionSnapshot();
    await configuration({ accountCeiling: 0, outstandingCeiling: 0, grantsPaused: true, redemptionPaused: true });
    await expect(accept(invite)).rejects.toThrow("invitation has not been used");
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: invite.recipientEmail } })).toBeNull();
    await configuration({ redemptionPaused: false }); await accept(invite);
    expect(await getAdmissionSnapshot()).toMatchObject({ committed: initial.committed, outstanding: initial.outstanding - 1, accounts: initial.accounts + 1, remaining: 0 });
    await expect(accept(invite)).rejects.toThrow("already been used");
  });
  it("revocation releases capacity without refunding lifetime referral allowance", async () => {
    const { inputs, owner } = await network();
    await configuration({ outstandingCeiling: 1 });
    const invite = await prisma.$transaction(tx => allocateAccessInvite(tx, inputs[0]));
    await prisma.$transaction(async tx => { await lockAccess(tx); await tx.referralAccessInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } }); });
    await prisma.$transaction(tx => allocateAccessInvite(tx, inputs[1]));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).referralInvitesIssued).toBe(2);
    expect((await getAdmissionSnapshot()).outstanding).toBe(1);
  });
  it("counts suspended and unverified customers, excluding only staff-only accounts", async () => {
    const baseline = (await getAdmissionSnapshot()).accounts;
    const staff = await person(true), customer = await person();
    await prisma.user.update({ where: { id: customer.id }, data: { suspendedAt: new Date(), emailVerifiedAt: null } });
    expect((await getAdmissionSnapshot()).accounts).toBe(baseline + 1);
    await prisma.workspace.create({ data: { name: "Staff personal workspace", slug: randomUUID(), ownerId: staff.id } });
    expect((await getAdmissionSnapshot()).accounts).toBe(baseline + 2);
  });
  it("requires current permission, session, password and recent MFA before saving", async () => {
    const input = await operator();
    await expect(changeAdmissionPolicy({ ...input, password: "wrong" })).rejects.toThrow("password");
    await expect(changeAdmissionPolicy({ ...input, actorSessionId: "missing" })).rejects.toThrow("staff access");
    await prisma.adminMfaSession.updateMany({ where: { sessionId: input.actorSessionId }, data: { verifiedAt: new Date(Date.now() - 11 * 60_000) } });
    await expect(changeAdmissionPolicy(input)).rejects.toMatchObject({ needsMfa: true });
    await prisma.adminMfaSession.updateMany({ where: { sessionId: input.actorSessionId }, data: { verifiedAt: new Date() } });
    await prisma.staffMembership.update({ where: { userId: input.actorUserId }, data: { denies: ["settings.manage"] } });
    await expect(changeAdmissionPolicy(input)).rejects.toThrow("staff access");
    expect(await prisma.platformAuditEvent.count({ where: { actorUserId: input.actorUserId } })).toBe(0);
  });
  it("audits before/after values and rejects stale concurrent policy changes", async () => {
    const input = await operator();
    const results = await Promise.allSettled([changeAdmissionPolicy(input), changeAdmissionPolicy({ ...input, configuration: { ...input.configuration, accountCeiling: 50 } })]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    const state = await getAdmissionSnapshot();
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { actorUserId: input.actorUserId } });
    expect(audit.action).toBe("admission.policy.change");
    expect(audit.beforeData).toMatchObject({ revision: input.expectedRevision });
    expect(audit.afterData).toMatchObject({ accountCeiling: state.policy.accountCeiling, revision: input.expectedRevision + 1 });
    expect(JSON.stringify(audit)).not.toContain(password);
  });
  it("rejects invalid limits and malformed database singleton writes", async () => {
    const input = await operator();
    for (const value of [-1, 0.5, 1_000_001, NaN]) await expect(changeAdmissionPolicy({ ...input, configuration: { ...input.configuration, accountCeiling: value } })).rejects.toThrow("whole-number");
    await expect(changeAdmissionPolicy({ ...input, configuration: { ...input.configuration, outstandingCeiling: 21 } })).rejects.toThrow("cannot exceed");
    await expect(prisma.admissionPolicy.create({ data: { id: "second" } })).rejects.toThrow();
    await expect(prisma.admissionPolicy.update({ where: { id: "default" }, data: { accountCeiling: -1 } })).rejects.toThrow();
  });
});
