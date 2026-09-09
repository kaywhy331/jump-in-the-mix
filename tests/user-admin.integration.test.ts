import { openTestAdmission } from "./helpers/admission-fixture";
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";

const context = vi.hoisted(() => ({ cookies: new Map<string, string>(), mail: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => context.cookies.has(key) ? { value: context.cookies.get(key) } : undefined, set: (key: string, value: string) => context.cookies.set(key, value), delete: (key: string) => context.cookies.delete(key) }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: null, userAgent: "Local account-access test" }) }));
vi.mock("@/lib/worker-dispatch-after", () => ({ wakeWorkerAfterResponse: vi.fn() }));
vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  return { ...mod, env: { ...mod.env, cookieName: "jitm_session", requireAdminMfa: true, pilotMode: false, dataEncryptionKey: "user-access-test-key", resendApiKey: "local-test-only", emailFrom: "test@example.test" } };
});
vi.mock("@/lib/transactional-email", async original => ({ ...await original<typeof import("../src/lib/transactional-email")>(), sendTransactionalEmail: context.mail }));

import { manageUserAccess } from "../src/lib/user-admin";
import { manageUserAccessAction } from "../src/lib/user-admin-actions";
import { createSession, getCurrentSession } from "../src/lib/auth";
import { allocateAccessInvite } from "../src/lib/referral-access";
import { changeStaffAccess } from "../src/lib/staff-access";
import { runAutomaticDeliveries } from "../src/lib/automatic-delivery";
import { runScheduledNotifications } from "../src/lib/notification-delivery";
import { loginAction, requestMagicLinkAction, requestPasswordResetAction, resetPasswordAction } from "../src/lib/auth-actions";
import { hashAuthToken, AUTH_TOKEN_PURPOSES } from "../src/lib/auth-tokens";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const ids: string[] = [];
const password = "Local account access test 24!";
const passwordHash = await bcrypt.hash(password, 4);
async function person(staff = false) {
  const id = `user-admin-${randomUUID()}`; ids.push(id);
  return prisma.user.create({ data: { id, email: `${id}@example.test`, name: "Account fixture", passwordHash, emailVerifiedAt: new Date(), ...(staff ? { staffMembership: { create: { role: "OPERATOR" } } } : {}) } });
}
async function session(userId: string, mfa = false) {
  const token = randomUUID();
  const row = await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  if (mfa) {
    await prisma.adminMfaCredential.upsert({ where: { userId }, create: { userId, secretCiphertext: "test-only", enabledAt: new Date() }, update: {} });
    await prisma.adminMfaSession.create({ data: { userId, sessionId: row.id, expiresAt: row.expiresAt } });
  }
  return { ...row, token };
}
async function fixture() {
  const actor = await person(true), target = await person();
  const actorSession = await session(actor.id, true);
  context.cookies.set("jitm_session", actorSession.token);
  const input = { actorUserId: actor.id, actorSessionId: actorSession.id, targetUserId: target.id, expectedRevision: 0, operation: "suspend" as const, reason: "Investigating a compromised account", password };
  return { actor, target, actorSession, input };
}
async function workspace(ownerId: string) {
  return prisma.workspace.create({ data: { ownerId, slug: randomUUID(), name: "Account fixture", members: { create: { userId: ownerId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } });
}
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }

describe.skipIf(!local)("administrator account access with PostgreSQL", () => {
  let restoreAdmission: (() => Promise<void>) | undefined;
  beforeAll(async () => { restoreAdmission = await openTestAdmission(); });
  afterAll(async () => { await restoreAdmission?.(); });
  afterEach(async () => {
    context.cookies.clear(); context.mail.mockReset();
    const owned = await prisma.workspace.findMany({ where: { ownerId: { in: ids } }, select: { id: true } });
    const workspaceIds = owned.map(row => row.id);
    await prisma.adminImpersonation.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }] } });
    await prisma.adminMfaSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.adminMfaCredential.deleteMany({ where: { userId: { in: ids } } });
    await prisma.platformAuditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { entityId: { in: ids } }] } });
    await prisma.verificationToken.deleteMany({ where: { email: { in: ids.map(id => `${id}@example.test`) } } });
    await prisma.pushSubscription.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: ids } } });
    await prisma.automationPreference.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.referralAccessInvite.deleteMany({ where: { inviterUserId: { in: ids } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } }); ids.length = 0;
  });

  it("suspends atomically, ends sessions and links, stops sending, and preserves joined referrals", async () => {
    const { actor, target, input } = await fixture();
    const ws = await workspace(target.id), device = await session(target.id);
    await session(target.id);
    const push = await prisma.pushSubscription.create({ data: { workspaceId: ws.id, userId: target.id, sessionId: device.id, endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, p256dh: "test-only", auth: "test-only" } });
    await prisma.notificationPreference.create({ data: { workspaceId: ws.id, userId: target.id, emailDigestEnabled: true, weeklyReportEnabled: true, pushEnabled: true } });
    await prisma.automationPreference.create({ data: { workspaceId: ws.id, enabled: true, emailEnabled: true } });
    await prisma.verificationToken.create({ data: { email: target.email, purpose: AUTH_TOKEN_PURPOSES.magicLogin, tokenHash: hashAuthToken(randomUUID()), expiresAt: new Date(Date.now() + 3600_000) } });
    await prisma.adminImpersonation.create({ data: { actorUserId: actor.id, targetUserId: target.id, workspaceId: ws.id, reason: "Review prior support case", tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
    const pending = await prisma.referralAccessInvite.create({ data: { inviterUserId: target.id, recipientEmail: "unjoined@example.test", tokenHash: randomUUID(), tokenCiphertext: "test-only", delivery: { create: { messageCiphertext: "test-only" } } } });
    const joined = await person();
    const accepted = await prisma.referralAccessInvite.create({ data: { inviterUserId: target.id, recipientEmail: joined.email, tokenHash: randomUUID(), tokenCiphertext: "test-only", acceptedUserId: joined.id, acceptedAt: new Date() } });
    expect(await manageUserAccess(input)).toMatchObject({ sessionsEnded: 2, invitationsRevoked: 1, revision: 1 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).not.toBeNull();
    expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { id: push.id } })).sessionId).toBeNull();
    expect(await prisma.notificationPreference.findUniqueOrThrow({ where: { workspaceId: ws.id } })).toMatchObject({ emailDigestEnabled: false, weeklyReportEnabled: false, pushEnabled: false });
    expect((await prisma.automationPreference.findUniqueOrThrow({ where: { workspaceId: ws.id } })).enabled).toBe(false);
    expect(await prisma.verificationToken.count({ where: { email: target.email, usedAt: null } })).toBe(0);
    expect(await prisma.adminImpersonation.count({ where: { targetUserId: target.id, endedAt: null } })).toBe(0);
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: pending.id } })).status).toBe("CANCELED");
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: accepted.id } })).revokedAt).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: joined.id } })).suspendedAt).toBeNull();
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: target.id, action: "user.access.suspend" } });
    expect(audit.afterData).toMatchObject({ sessionsEnded: 2, invitationsRevoked: 1 });
    expect(JSON.stringify(audit)).not.toContain(password);
    await manageUserAccess({ ...input, expectedRevision: 1, operation: "restore" });
    expect(await createSession(target.id)).toEqual(expect.any(String));
    expect((await prisma.automationPreference.findUniqueOrThrow({ where: { workspaceId: ws.id } })).enabled).toBe(false);
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: pending.id } })).status).toBe("CANCELED");
  });

  it("rejects wrong passwords, stale MFA, individual denies and revoked actor sessions without mutation", async () => {
    const { actor, actorSession, target, input } = await fixture();
    await expect(manageUserAccess({ ...input, password: "wrong" })).rejects.toThrow("password");
    await prisma.adminMfaSession.update({ where: { sessionId: actorSession.id }, data: { verifiedAt: new Date(Date.now() - 11 * 60_000) } });
    await expect(manageUserAccess(input)).rejects.toMatchObject({ needsMfa: true });
    await prisma.adminMfaSession.update({ where: { sessionId: actorSession.id }, data: { verifiedAt: new Date() } });
    await prisma.staffMembership.update({ where: { userId: actor.id }, data: { denies: ["users.suspend"] } });
    await expect(manageUserAccess(input)).rejects.toThrow("staff access");
    await prisma.staffMembership.update({ where: { userId: actor.id }, data: { denies: [] } });
    await prisma.session.delete({ where: { id: actorSession.id } });
    await expect(manageUserAccess(input)).rejects.toThrow("staff access");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).accessRevision).toBe(0);
  });

  it("separates session revocation from suspension and checks the submitted Server Action", async () => {
    const { actor, target, input } = await fixture();
    await session(target.id);
    await prisma.staffMembership.update({ where: { userId: actor.id }, data: { denies: ["users.suspend"] } });
    const data = form({ operation: "revoke_sessions", userId: target.id, revision: "0", reason: input.reason, currentPassword: password });
    await expect(manageUserAccessAction(data)).rejects.toThrow("REDIRECT /admin/users?updated=revoke_sessions");
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).toBeNull();
    data.set("operation", "suspend"); data.set("revision", "1");
    await expect(manageUserAccessAction(data)).rejects.toThrow("access-denied");
    data.set("operation", "erase_everything");
    await expect(manageUserAccessAction(data)).rejects.toThrow("listed+account+operation");
  });

  it("rejects self changes and protects staff accounts, including an owner", async () => {
    const { actor, target, input } = await fixture();
    await expect(manageUserAccess({ ...input, targetUserId: actor.id })).rejects.toThrow("own sessions");
    await prisma.staffMembership.create({ data: { userId: target.id, role: "OWNER" } });
    await expect(manageUserAccess(input)).rejects.toThrow("Admin → Team");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).toBeNull();
  });

  it("serializes conflicting changes and rejects stale form revisions", async () => {
    const { target, input } = await fixture();
    const results = await Promise.allSettled([manageUserAccess(input), manageUserAccess(input)]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    await expect(manageUserAccess({ ...input, operation: "restore" })).rejects.toThrow("Reload");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).accessRevision).toBe(1);
  });

  it("cannot create a live session or active referral while suspension races sign-in and allocation", async () => {
    const { target, input } = await fixture();
    const ws = await workspace(target.id);
    const contact = await prisma.contact.create({ data: { workspaceId: ws.id, displayName: "Recipient", emails: { create: { email: "race-recipient@example.test", normalized: "race-recipient@example.test" } } } });
    // This sign-in belongs to a different browser. Sharing the administrator's
    // cookie would correctly revoke their session during account replacement,
    // making the concurrent administrative operation unauthorized.
    context.cookies.clear();
    const results = await Promise.allSettled([manageUserAccess(input), createSession(target.id), prisma.$transaction(tx => allocateAccessInvite(tx, { expectedVersion: 1, userId: target.id, workspaceId: ws.id, contactId: contact.id, recipientEmail: "race-recipient@example.test" }))]);
    expect(results[0].status).toBe("fulfilled");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.referralAccessInvite.count({ where: { inviterUserId: target.id, revokedAt: null } })).toBe(0);
    await expect(createSession(target.id)).rejects.toThrow("Account+access+is+unavailable");
    // A stale/forged database session cannot bypass the read boundary either.
    const stale = await session(target.id); context.cookies.set("jitm_session", stale.token);
    expect(await getCurrentSession()).toBeNull();
  });

  it("cannot race a staff promotion into a suspended staff account", async () => {
    const { actor, target, input } = await fixture();
    await prisma.staffMembership.update({ where: { userId: actor.id }, data: { role: "OWNER" } });
    const results = await Promise.allSettled([manageUserAccess(input), changeStaffAccess({ actorUserId: actor.id, actorSessionId: input.actorSessionId, targetUserId: target.id, expectedRevision: 0, role: "OPERATOR", status: "ACTIVE", grants: [], denies: [], reason: "Grant operations responsibilities" })]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    const account = await prisma.user.findUniqueOrThrow({ where: { id: target.id }, include: { staffMembership: true } });
    expect(Boolean(account.suspendedAt && account.staffMembership)).toBe(false);
  });

  it("blocks password and email-link sign-in while allowing future recovery requests", async () => {
    const { target, input } = await fixture();
    await manageUserAccess(input);
    await expect(loginAction(form({ email: target.email, password }))).rejects.toThrow("Account%20access%20is%20paused");
    await expect(requestMagicLinkAction(form({ email: target.email }))).rejects.toThrow("magicSent=1");
    expect(context.mail).not.toHaveBeenCalled();
    expect(await prisma.verificationToken.count({ where: { email: target.email } })).toBe(0);
    await expect(requestPasswordResetAction(form({ email: target.email }))).rejects.toThrow("REDIRECT /forgot-password?");
    expect(context.mail).toHaveBeenCalledOnce();
    // Proving email ownership and changing the password must not lift suspension.
    const token = randomUUID();
    await prisma.verificationToken.create({ data: { email: target.email, purpose: AUTH_TOKEN_PURPOSES.resetPassword, tokenHash: hashAuthToken(token), expiresAt: new Date(Date.now() + 3600_000) } });
    await expect(resetPasswordAction(form({ token, password: "A new local recovery password 25!", confirmPassword: "A new local recovery password 25!" }))).rejects.toThrow("REDIRECT /login?");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).not.toBeNull();
    await expect(createSession(target.id)).rejects.toThrow("Account+access+is+unavailable");
  });

  it("ignores suspended workspaces even if old enabled sending preferences remain", async () => {
    const { target, input } = await fixture();
    const ws = await workspace(target.id);
    await manageUserAccess(input);
    await prisma.notificationPreference.create({ data: { workspaceId: ws.id, userId: target.id, emailDigestEnabled: true, weeklyReportEnabled: true, digestHour: 7 } });
    await prisma.automationPreference.create({ data: { workspaceId: ws.id, enabled: true, emailEnabled: true } });
    // Limit the shared worker scan to this scenario; all ownership/status queries remain real.
    const preference = await prisma.notificationPreference.findUniqueOrThrow({ where: { workspaceId: ws.id } });
    const automation = await prisma.automationPreference.findUniqueOrThrow({ where: { workspaceId: ws.id } });
    const notifications = vi.spyOn(prisma.notificationPreference, "findMany").mockResolvedValue([preference]);
    const sending = vi.spyOn(prisma.automationPreference, "findMany").mockResolvedValue([automation]);
    try {
      expect(await runScheduledNotifications("suspended-test", new Date("2026-09-07T07:00:00Z"))).toEqual({ attempted: 0 });
      expect(await runAutomaticDeliveries("suspended-test")).toEqual({ attempted: 0, delivered: 0, failed: 0 });
      expect(context.mail).not.toHaveBeenCalled();
      // The owner relation may disappear between Prisma reads during deletion.
      const missingOwner = vi.spyOn(prisma.workspace, "findUnique").mockResolvedValueOnce({ ...ws, owner: null } as never);
      const missingOwners = vi.spyOn(prisma.workspace, "findMany").mockResolvedValueOnce([{ ...ws, owner: null }] as never);
      try {
        expect(await runAutomaticDeliveries("deleted-owner-test")).toEqual({ attempted: 0, delivered: 0, failed: 0 });
        expect(await runScheduledNotifications("deleted-owner-test")).toEqual({ attempted: 0 });
      } finally { missingOwner.mockRestore(); missingOwners.mockRestore(); }
    } finally { notifications.mockRestore(); sending.mockRestore(); }
  });
});
