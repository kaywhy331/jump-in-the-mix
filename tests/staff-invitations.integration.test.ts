import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";

const mail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  return { ...mod, env: { ...mod.env, requireAdminMfa: true, pilotMode: false, appUrl: "https://example.test", dataEncryptionKey: "staff-invitation-test-key", resendApiKey: "test-only", emailFrom: "sender@example.test" } };
});
vi.mock("@/lib/transactional-email", async original => ({ ...await original<typeof import("../src/lib/transactional-email")>(), sendTransactionalEmail: mail }));
import { issueStaffInvitation, manageStaffInvitation, acceptStaffInvitation, peekStaffInvitation } from "../src/lib/staff-invitations";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { hashAuthToken } from "../src/lib/auth-tokens";
import { deliverWaitlistInvitations, WAITLIST_RETRY_WINDOW_MS } from "../src/lib/waitlist-delivery";
import { changeStaffAccess } from "../src/lib/staff-access";
import { requestInvitationStopLink, stopInvitationEmails } from "../src/lib/invitation-preferences";
import { receiveEmailProviderEvent } from "../src/lib/email-events";
import { deleteAccountData } from "../src/lib/account-deletion";
import { EmailDeliveryError } from "../src/lib/email-errors";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const emails: string[] = [], ids: string[] = [], events: string[] = [];
const password = "Staff invitation test password!";
const passwordHash = await bcrypt.hash(password, 4);
function recipient() { const email = `staff-invite-${randomUUID()}@example.test`; emails.push(email); return email; }
async function owner() {
  const user = await prisma.user.create({ data: { email: recipient(), name: "Owner fixture", passwordHash, emailVerifiedAt: new Date(), staffMembership: { create: { role: "OWNER" } } } });
  ids.push(user.id);
  await prisma.adminMfaCredential.create({ data: { userId: user.id, secretCiphertext: "fixture-only", enabledAt: new Date() } });
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  return { actorUserId: user.id, actorSessionId: session.id, password, reason: "Onboard launch support teammate", email: recipient(), role: "SUPPORT" as const, grants: ["waitlist.read"], denies: ["support.manage"] };
}
async function queued(input: Awaited<ReturnType<typeof owner>>) {
  const result = await issueStaffInvitation(input);
  const delivery = await prisma.waitlistDelivery.findUniqueOrThrow({ where: { staffInvitationId: result.id } });
  const message = decryptIntegrationCredentials<{ text: string; idempotencyKey: string }>(delivery.messageCiphertext);
  const token = new URL(message.text.match(/https:\/\/example\.test\/staff\/accept\?token=[\w-]+/)![0]).searchParams.get("token")!;
  return { result, delivery, message, token, accept: { token, email: input.email, name: "New teammate", password } };
}

describe.skipIf(!local)("staff invitation admission with PostgreSQL", () => {
  beforeEach(() => mail.mockReset().mockResolvedValue({ delivered: true, providerId: "staff-local-provider" }));
  afterEach(async () => {
    const inviteIds = (await prisma.staffInvitation.findMany({ where: { email: { in: emails } }, select: { id: true } })).map(row => row.id);
    const userIds = (await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } })).map(row => row.id);
    await prisma.staffInvitation.deleteMany({ where: { email: { in: emails } } });
    await prisma.referralAccessInvite.deleteMany({ where: { recipientEmail: { in: emails } } });
    await prisma.waitlistEntry.deleteMany({ where: { email: { in: emails } } });
    await prisma.verificationToken.deleteMany({ where: { email: { in: emails } } });
    await prisma.emailSuppression.deleteMany({ where: { email: { in: emails } } });
    await prisma.emailProviderEvent.deleteMany({ where: { id: { in: events } } });
    await prisma.platformAuditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: [...ids, ...userIds] } }, { entityId: { in: [...inviteIds, ...events] } }] } });
    await prisma.adminMfaSession.deleteMany({ where: { userId: { in: [...ids, ...userIds] } } });
    await prisma.adminMfaCredential.deleteMany({ where: { userId: { in: [...ids, ...userIds] } } });
    await prisma.userPreference.deleteMany({ where: { userId: { in: [...ids, ...userIds] } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    emails.length = 0; ids.length = 0; events.length = 0;
  });

  it("requires a current Owner, password and recent MFA, and forbids initial Owner grants", async () => {
    const input = await owner();
    await expect(issueStaffInvitation({ ...input, password: "wrong" })).rejects.toThrow("password");
    await expect(issueStaffInvitation({ ...input, role: "OWNER" })).rejects.toThrow("promotion");
    await expect(issueStaffInvitation({ ...input, grants: ["staff.manage"] })).rejects.toThrow("Only owners");
    await prisma.adminMfaSession.update({ where: { sessionId: input.actorSessionId }, data: { verifiedAt: new Date(Date.now() - 11 * 60_000) } });
    await expect(issueStaffInvitation(input)).rejects.toMatchObject({ needsMfa: true });
    await prisma.adminMfaSession.update({ where: { sessionId: input.actorSessionId }, data: { verifiedAt: new Date() } });
    await prisma.staffMembership.update({ where: { userId: input.actorUserId }, data: { role: "OPERATOR", grants: ["staff.manage"] } });
    await expect(issueStaffInvitation(input)).rejects.toThrow("Owner access");
    expect(await prisma.staffInvitation.count({ where: { email: input.email } })).toBe(0);
    await prisma.staffMembership.update({ where: { userId: input.actorUserId }, data: { role: "OWNER", grants: [] } });
    await prisma.session.delete({ where: { id: input.actorSessionId } });
    await expect(issueStaffInvitation(input)).rejects.toThrow("Owner access");
  });

  it("freezes one encrypted email for concurrent issuance and exposes only the offered permissions", async () => {
    const input = await owner();
    const issued = await Promise.all([issueStaffInvitation(input), issueStaffInvitation(input)]);
    expect(new Set(issued.map(item => item.id)).size).toBe(1);
    const { result, delivery, token } = await queued(input);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(delivery.messageCiphertext).not.toContain(token);
    expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id: result.id } })).tokenHash).toBe(hashAuthToken(token));
    expect(await peekStaffInvitation(token)).toEqual({ role: "SUPPORT", grants: ["waitlist.read"], denies: ["support.manage"], expiresAt: expect.any(Date) });
    expect(await prisma.user.findUnique({ where: { email: input.email } })).toBeNull();
    await expect(issueStaffInvitation({ ...input, role: "EDITOR" })).rejects.toThrow("Revoke");
    expect(JSON.stringify(await prisma.platformAuditEvent.findMany({ where: { entityId: result.id } }))).not.toContain(token);
  });

  it("accepts exactly once for the intended email and creates no customer workspace", async () => {
    const input = await owner(); const q = await queued(input);
    await prisma.waitlistEntry.create({ data: { email: input.email, verifiedAt: new Date() } });
    const customerInvite = await prisma.referralAccessInvite.create({ data: { recipientEmail: input.email, source: "WAITLIST_MANUAL", tokenHash: randomUUID(), tokenCiphertext: "local-only", delivery: { create: { messageCiphertext: "local-only" } } } });
    await expect(acceptStaffInvitation({ ...q.accept, email: recipient() })).rejects.toThrow("unavailable");
    const accepted = await Promise.allSettled([acceptStaffInvitation(q.accept), acceptStaffInvitation(q.accept)]);
    expect(accepted.filter(item => item.status === "fulfilled")).toHaveLength(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: input.email }, include: { staffMembership: true } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.staffMembership).toMatchObject({ role: "SUPPORT", grants: ["waitlist.read"], denies: ["support.manage"] });
    expect(await bcrypt.compare(password, user.passwordHash!)).toBe(true);
    expect(await prisma.workspaceMember.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.workspace.count({ where: { ownerId: user.id } })).toBe(0);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: input.email } })).status).toBe("JOINED");
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: customerInvite.id } })).revokedAt).not.toBeNull();
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: customerInvite.id } })).status).toBe("CANCELED");
    expect(await peekStaffInvitation(q.token)).toBeNull();
    expect(await prisma.adminMfaCredential.findUnique({ where: { userId: user.id } })).toBeNull();
  });

  it("never replaces an existing account or attaches privileges through its invitation", async () => {
    const input = await owner(); const q = await queued(input);
    const user = await prisma.user.create({ data: { email: input.email, name: "Existing account", passwordHash, emailVerifiedAt: new Date() } });
    await expect(issueStaffInvitation(input)).rejects.toThrow("already has an account");
    await expect(acceptStaffInvitation(q.accept)).rejects.toThrow("unavailable");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(passwordHash);
    expect(await prisma.staffMembership.findUnique({ where: { userId: user.id } })).toBeNull();
    expect(await deliverWaitlistInvitations()).toBe(0); expect(mail).not.toHaveBeenCalled();
  });

  it("invalidates issuer revision drift and revokes unused invitations on actual Team changes", async () => {
    const input = await owner(); const q = await queued(input); const other = await owner();
    const member = await prisma.staffMembership.update({ where: { userId: input.actorUserId }, data: { revision: { increment: 1 } } });
    await expect(acceptStaffInvitation(q.accept)).rejects.toThrow("unavailable");
    await changeStaffAccess({ ...other, targetUserId: input.actorUserId, expectedRevision: member.revision, role: "SUPPORT", status: "ACTIVE", grants: [], denies: [] });
    expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id: q.result.id } })).revokedAt).not.toBeNull();
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: q.delivery.id } })).status).toBe("CANCELED");
  });

  it("honors expiry, Owner revocation and proof-based recipient opt-out", async () => {
    const input = await owner(); const q = await queued(input);
    await prisma.staffInvitation.update({ where: { id: q.result.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(acceptStaffInvitation(q.accept)).rejects.toThrow("unavailable");
    const q2 = await queued(input);
    await manageStaffInvitation({ ...input, invitationId: q2.result.id, operation: "revoke" });
    await expect(acceptStaffInvitation(q2.accept)).rejects.toThrow("unavailable");
    const q3 = await queued(input);
    const stop = await requestInvitationStopLink(input.email);
    expect(await stopInvitationEmails(new URL(stop!).searchParams.get("token")!)).toBe(true);
    await expect(acceptStaffInvitation(q3.accept)).rejects.toThrow("unavailable");
    await expect(issueStaffInvitation(input)).rejects.toThrow("stopped");
    expect(await prisma.waitlistDelivery.count({ where: { staffInvitation: { email: input.email }, status: { in: ["QUEUED", "SENDING", "REVIEW"] } } })).toBe(0);
  });

  it("cancels unused staff access on a permanent provider event", async () => {
    const input = await owner(); const q = await queued(input);
    const id = randomUUID(); events.push(id);
    await receiveEmailProviderEvent(id, { type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: randomUUID(), to: [input.email], bounce: { type: "Permanent" } } });
    await expect(acceptStaffInvitation(q.accept)).rejects.toThrow("unavailable");
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: q.delivery.id } })).status).toBe("CANCELED");
  });

  it("uses the shared worker, preserves receipt metadata and keeps retries inside the original window", async () => {
    const input = await owner(); const q = await queued(input);
    mail.mockRejectedValueOnce(new Error("Temporary failure"));
    expect(await deliverWaitlistInvitations()).toBe(0);
    await prisma.waitlistDelivery.update({ where: { id: q.delivery.id }, data: { status: "REVIEW" } });
    await manageStaffInvitation({ ...input, invitationId: q.result.id, operation: "retry" });
    expect(await deliverWaitlistInvitations()).toBe(1);
    expect(mail.mock.calls[0][0]).toEqual(mail.mock.calls[1][0]);
    expect(mail.mock.calls[1][0].idempotencyKey).toBe(q.message.idempotencyKey);
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: q.delivery.id } })).providerId).toBe("staff-local-provider");
    expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id: q.result.id } })).lastSentAt).not.toBeNull();
    await prisma.waitlistDelivery.update({ where: { id: q.delivery.id }, data: { status: "REVIEW", firstAttemptAt: new Date(Date.now() - WAITLIST_RETRY_WINDOW_MS - 1) } });
    await expect(manageStaffInvitation({ ...input, invitationId: q.result.id, operation: "retry" })).rejects.toThrow("safe retry");
  });

  it("does not consume the retry clock while the shared email budget is exhausted", async () => {
    const input = await owner(); const q = await queued(input);
    mail.mockRejectedValueOnce(new EmailDeliveryError("BUDGET", "Email allowance reached.", null, new Date(Date.now() + 60_000)));
    await deliverWaitlistInvitations();
    expect(await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: q.delivery.id } })).toMatchObject({ status: "QUEUED", attempts: 0, firstAttemptAt: null });
  });

  it("enforces one outbox parent and prevents Owner role drift at the database boundary", async () => {
    const input = await owner(); const q = await queued(input);
    await expect(prisma.waitlistDelivery.create({ data: { messageCiphertext: "orphan" } })).rejects.toThrow();
    const referral = await prisma.referralAccessInvite.create({ data: { recipientEmail: input.email, tokenHash: randomBytes(32).toString("hex"), tokenCiphertext: "local-only" } });
    await expect(prisma.waitlistDelivery.update({ where: { id: q.delivery.id }, data: { inviteId: referral.id } })).rejects.toThrow();
    await expect(prisma.staffInvitation.update({ where: { id: q.result.id }, data: { role: "OWNER" } })).rejects.toThrow();
  });

  it("removes recipient invitation data on account deletion and revokes invitations issued by a deleted Owner", async () => {
    const input = await owner(); const q = await queued(input); await owner();
    const user = await acceptStaffInvitation(q.accept);
    const requestId = randomUUID();
    await deleteAccountData(user.id, requestId);
    expect(await prisma.staffInvitation.findUnique({ where: { id: q.result.id } })).toBeNull();
    expect(await prisma.waitlistDelivery.findUnique({ where: { id: q.delivery.id } })).toBeNull();
    const q2 = await queued({ ...input, email: recipient() });
    const ownerRequest = randomUUID(); await deleteAccountData(input.actorUserId, ownerRequest);
    expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id: q2.result.id } })).revokedAt).not.toBeNull();
    await expect(acceptStaffInvitation(q2.accept)).rejects.toThrow("unavailable");
    await prisma.accountDeletionAudit.deleteMany({ where: { requestId: { in: [requestId, ownerRequest] } } });
  });
});
