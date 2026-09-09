import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { lockStaff, validateStaffAccess } from "@/lib/staff-access";
import { lockAccess } from "@/lib/access-lock";
import { hasAdminPermission, type AdminRole } from "@/lib/admin-permissions";
import { hashAuthToken } from "@/lib/auth-tokens";
import { encryptIntegrationCredentials } from "@/lib/integration-crypto";
import { createInvitationStopLink, invitationEmailSuppressed } from "@/lib/invitation-preferences";
import { escapeHtml } from "@/lib/transactional-email";
import { passwordValidationError } from "@/lib/password-policy";
import { staffInvitationAvailable, revokeStaffInvitations } from "@/lib/staff-invitation-state";
import { EMAIL_RETRY_WINDOW_MS } from "@/lib/email-budget";

export class StaffInvitationError extends Error {
  constructor(message: string, readonly needsMfa = false) { super(message); }
}
const lifetime = 7 * 24 * 60 * 60_000;
const unavailable = "This staff invitation is unavailable. Ask an Owner for a new invitation or access to your existing account.";
const validToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
type Actor = { actorUserId: string; actorSessionId: string; password: string; reason: string };

async function verifyOwner(tx: Prisma.TransactionClient, input: Actor) {
  const now = new Date();
  const actor = await tx.staffMembership.findUnique({ where: { userId: input.actorUserId }, include: { user: { select: { passwordHash: true, emailVerifiedAt: true, suspendedAt: true } } } });
  const session = await tx.session.findFirst({ where: { id: input.actorSessionId, userId: input.actorUserId, expiresAt: { gt: now } } });
  if (!session || !actor?.user?.emailVerifiedAt || actor.user.suspendedAt || !hasAdminPermission(actor, "staff.manage")) throw new StaffInvitationError("Current Owner access is required.");
  if (env.requireAdminMfa && !await tx.adminMfaSession.findFirst({ where: { sessionId: session.id, userId: input.actorUserId, verifiedAt: { gte: new Date(now.getTime() - 10 * 60_000) }, expiresAt: { gt: now } } })) throw new StaffInvitationError("Verify your authenticator again before managing staff invitations.", true);
  if (!actor.user.passwordHash || input.password.length > 72 || !await bcrypt.compare(input.password, actor.user.passwordHash)) throw new StaffInvitationError("Enter your current Owner password.");
  if (input.reason.trim().length < 10 || input.reason.length > 500) throw new StaffInvitationError("Give a reason between 10 and 500 characters.");
  return actor;
}

export async function issueStaffInvitation(input: Actor & { email: string; role: AdminRole; grants: string[]; denies: string[] }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new StaffInvitationError("Enter a valid staff email address.");
  if (input.role === "OWNER") throw new StaffInvitationError("Invite a staff role first. Owner promotion requires MFA enrollment and a separate Team change.");
  validateStaffAccess({ ...input, status: "ACTIVE" });
  if (env.pilotMode || !env.resendApiKey || !env.emailFrom || !env.dataEncryptionKey) throw new StaffInvitationError("Configure invitation email and disable pilot mode before inviting staff.");
  return prisma.$transaction(async tx => {
    await lockStaff(tx); await lockAccess(tx);
    const actor = await verifyOwner(tx, input);
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) throw new StaffInvitationError("This email already has an account. Use Add staff access for its verified account.");
    if (await invitationEmailSuppressed(tx, email)) throw new StaffInvitationError("Invitation emails are stopped for this address.");
    const now = new Date();
    const existing = await tx.staffInvitation.findFirst({ where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } });
    const grants = [...new Set(input.grants)].sort(), denies = [...new Set(input.denies)].sort();
    if (existing) {
      if (existing.issuerUserId !== input.actorUserId || existing.issuerRevision !== actor.revision || existing.role !== input.role || JSON.stringify(existing.grants) !== JSON.stringify(grants) || JSON.stringify(existing.denies) !== JSON.stringify(denies)) throw new StaffInvitationError("An invitation is already pending. Revoke it before changing the offered access.");
      return { id: existing.id, existing: true };
    }
    const token = randomBytes(32).toString("base64url");
    const invite = await tx.staffInvitation.create({ data: { email, role: input.role, grants, denies, issuerUserId: input.actorUserId, issuerRevision: actor.revision, tokenHash: hashAuthToken(token), expiresAt: new Date(now.getTime() + lifetime) } });
    const url = new URL("/staff/accept", env.appUrl); url.searchParams.set("token", token);
    const stopUrl = await createInvitationStopLink(tx, email, now);
    const expires = invite.expiresAt.toISOString().slice(0, 16).replace("T", " ") + " UTC";
    const message = {
      category: "INVITATION", from: env.emailFrom, replyTo: env.emailReplyTo || null, to: email,
      subject: "Your Jump in the Mix staff invitation",
      text: `You’ve been invited to help manage Jump in the Mix as ${input.role.toLowerCase()}.\n\nSet up staff access: ${url.href}\n\nUse this invitation only with ${email}. It expires ${expires} and works once. Choose a password, then enroll an authenticator before opening the admin tools.\n\nStop invitation emails and leave any waitlist request: ${stopUrl}`,
      html: `<p>You’ve been invited to help manage Jump in the Mix as ${escapeHtml(input.role.toLowerCase())}.</p><p><a href="${escapeHtml(url.href)}">Set up staff access</a></p><p>Use this invitation only with ${escapeHtml(email)}. It expires ${expires} and works once. Choose a password, then enroll an authenticator before opening the admin tools.</p><p><a href="${escapeHtml(stopUrl)}">Stop invitation emails and leave any waitlist request</a></p>`,
      idempotencyKey: `staff-invitation-${invite.id}`
    };
    await tx.waitlistDelivery.create({ data: { staffInvitationId: invite.id, messageCiphertext: encryptIntegrationCredentials(message), nextAttemptAt: now } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "staff.invitation.issue", entityType: "StaffInvitation", entityId: invite.id, reason: input.reason.trim(), afterData: { role: input.role, grants, denies, expiresAt: invite.expiresAt.toISOString() } } });
    return { id: invite.id, existing: false };
  });
}

export async function manageStaffInvitation(input: Actor & { invitationId: string; operation: "revoke" | "retry" }) {
  if (!["revoke", "retry"].includes(input.operation) || !input.invitationId || input.invitationId.length > 100) throw new StaffInvitationError("Choose a listed invitation operation.");
  return prisma.$transaction(async tx => {
    await lockStaff(tx); await lockAccess(tx); await verifyOwner(tx, input);
    const invite = await tx.staffInvitation.findUnique({ where: { id: input.invitationId } });
    if (!invite || invite.acceptedAt || invite.revokedAt) throw new StaffInvitationError("The invitation changed. Reload the Team page.");
    if (input.operation === "revoke") await revokeStaffInvitations(tx, { id: invite.id });
    else {
      if (!await staffInvitationAvailable(tx, invite)) throw new StaffInvitationError(unavailable);
      const retried = await tx.waitlistDelivery.updateMany({ where: { staffInvitationId: invite.id, status: "REVIEW", firstAttemptAt: { gt: new Date(Date.now() - EMAIL_RETRY_WINDOW_MS) } }, data: { status: "QUEUED", nextAttemptAt: new Date() } });
      if (!retried.count) throw new StaffInvitationError("A safe retry is unavailable. Inspect the provider record before replacing this invitation.");
    }
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: `staff.invitation.${input.operation}`, entityType: "StaffInvitation", entityId: invite.id, reason: input.reason.trim() } });
  });
}

export async function peekStaffInvitation(token: string) {
  if (env.pilotMode || !validToken(token)) return null;
  const invite = await prisma.staffInvitation.findUnique({ where: { tokenHash: hashAuthToken(token) }, select: { email: true, role: true, grants: true, denies: true, expiresAt: true, acceptedAt: true, revokedAt: true, issuerUserId: true, issuerRevision: true } });
  if (!invite || !await staffInvitationAvailable(prisma, invite)) return null;
  return { role: invite.role, grants: invite.grants, denies: invite.denies, expiresAt: invite.expiresAt };
}

export async function acceptStaffInvitation(input: { token: string; email: string; name: string; password: string }) {
  if (env.pilotMode || !validToken(input.token)) throw new StaffInvitationError(unavailable);
  const name = input.name.trim(), email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 120 || email.length > 254) throw new StaffInvitationError("Enter your name and the email that received the invitation.");
  const passwordError = passwordValidationError(input.password);
  if (passwordError) throw new StaffInvitationError(passwordError);
  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.$transaction(async tx => {
    await lockStaff(tx); await lockAccess(tx);
    const invite = await tx.staffInvitation.findUnique({ where: { tokenHash: hashAuthToken(input.token) } });
    if (!invite || invite.email !== email || !await staffInvitationAvailable(tx, invite)) throw new StaffInvitationError(unavailable);
    // Validate again at redemption so database drift cannot grant a forbidden permission.
    validateStaffAccess({ role: invite.role, status: "ACTIVE", grants: invite.grants, denies: invite.denies, reason: "Accept staff invitation" });
    if (invite.role === "OWNER") throw new StaffInvitationError(unavailable);
    const user = await tx.user.create({ data: { email, name, passwordHash, emailVerifiedAt: new Date(), isPlatformAdmin: true,
      staffMembership: { create: { role: invite.role, grants: invite.grants, denies: invite.denies } }
    }, select: { id: true } });
    await tx.userPreference.create({ data: { userId: user.id, timezone: "UTC" } });
    await tx.staffInvitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), acceptedUserId: user.id } });
    await tx.waitlistDelivery.updateMany({ where: { staffInvitationId: invite.id, status: { in: ["QUEUED", "SENDING", "REVIEW"] } }, data: { status: "CANCELED", leaseId: null, lockedAt: null, lastError: null } });
    // A staff account cannot simultaneously remain in the customer admission queue.
    await tx.waitlistEntry.updateMany({ where: { email, status: { notIn: ["WITHDRAWN", "SUPPRESSED"] } }, data: { status: "JOINED", joinedAt: new Date() } });
    await tx.referralAccessInvite.updateMany({ where: { recipientEmail: email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.waitlistDelivery.updateMany({ where: { invite: { recipientEmail: email, acceptedAt: null }, status: { in: ["QUEUED", "SENDING", "REVIEW"] } }, data: { status: "CANCELED", leaseId: null, lockedAt: null, lastError: null } });
    await tx.platformAuditEvent.create({ data: { actorUserId: user.id, action: "staff.invitation.accept", entityType: "StaffInvitation", entityId: invite.id, afterData: { issuerUserId: invite.issuerUserId, role: invite.role, grants: invite.grants, denies: invite.denies } } });
    return user;
  });
}
