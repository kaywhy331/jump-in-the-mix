import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { lockStaff } from "@/lib/staff-access";
import { lockAccess } from "@/lib/access-lock";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { AUTH_TOKEN_PURPOSES } from "@/lib/auth-tokens";
import { revokeStaffInvitations } from "@/lib/staff-invitation-state";

export class UserAdminError extends Error {
  constructor(message: string, readonly needsMfa = false) { super(message); }
}

export type UserAdminOperation = "suspend" | "restore" | "revoke_sessions";

export async function manageUserAccess(input: {
  actorUserId: string; actorSessionId: string; targetUserId: string;
  expectedRevision: number; operation: UserAdminOperation; reason: string; password: string;
}) {
  if (!["suspend", "restore", "revoke_sessions"].includes(input.operation)) throw new UserAdminError("Choose a listed account operation.");
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new UserAdminError("Reload this account before saving.");
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) throw new UserAdminError("Give a reason between 10 and 500 characters.");
  if (!input.targetUserId || input.targetUserId.length > 100 || input.password.length > 72) throw new UserAdminError("Check the account and your current password.");
  if (input.actorUserId === input.targetUserId) throw new UserAdminError("Use your account settings to manage your own sessions.");
  const permission = input.operation === "revoke_sessions" ? "sessions.revoke" : "users.suspend";
  return prisma.$transaction(async tx => {
    // Order matches staff and invitation operations. Session creation and referral
    // allocation share the access lock, so suspension cannot leave a new session/grant.
    await lockStaff(tx);
    await lockAccess(tx);
    const now = new Date();
    const actor = await tx.user.findUnique({ where: { id: input.actorUserId }, select: { passwordHash: true, emailVerifiedAt: true, suspendedAt: true, staffMembership: true } });
    const session = await tx.session.findFirst({ where: { id: input.actorSessionId, userId: input.actorUserId, expiresAt: { gt: now } } });
    if (!session || !actor?.emailVerifiedAt || actor.suspendedAt || !hasAdminPermission(actor.staffMembership, "users.read") || !hasAdminPermission(actor.staffMembership, permission)) throw new UserAdminError("Your current staff access does not allow this change.");
    if (env.requireAdminMfa && !await tx.adminMfaSession.findFirst({ where: { sessionId: session.id, userId: input.actorUserId, verifiedAt: { gte: new Date(now.getTime() - 10 * 60_000) }, expiresAt: { gt: now } } })) throw new UserAdminError("Verify your authenticator again before changing account access.", true);
    if (!actor.passwordHash || !await bcrypt.compare(input.password, actor.passwordHash)) throw new UserAdminError("Enter your current administrator password.");
    const target = await tx.user.findUnique({ where: { id: input.targetUserId }, select: { id: true, email: true, suspendedAt: true, accessRevision: true, staffMembership: { select: { id: true } }, ownedWorkspaces: { select: { id: true } } } });
    if (!target) throw new UserAdminError("This account no longer exists.");
    if (target.staffMembership) throw new UserAdminError("Manage staff access from Admin → Team.");
    if (target.accessRevision !== input.expectedRevision) throw new UserAdminError("This account changed. Reload before saving.");
    if (input.operation === "suspend" && target.suspendedAt || input.operation === "restore" && !target.suspendedAt) throw new UserAdminError("This account already has that access state. Reload before saving.");
    let revokedInvites = 0;
    if (input.operation === "suspend") {
      await revokeStaffInvitations(tx, { email: target.email }, now);
      const workspaceIds = target.ownedWorkspaces.map(row => row.id);
      // Saved content and recipient accounts remain. Reactivation requires new opt-in.
      await tx.automationPreference.updateMany({ where: { workspaceId: { in: workspaceIds } }, data: { enabled: false } });
      await tx.notificationPreference.updateMany({ where: { OR: [{ userId: target.id }, { workspaceId: { in: workspaceIds } }] }, data: { emailDigestEnabled: false, weeklyReportEnabled: false, pushEnabled: false } });
      const invites = await tx.referralAccessInvite.updateMany({ where: { inviterUserId: target.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
      revokedInvites = invites.count;
      await tx.waitlistDelivery.updateMany({ where: { invite: { inviterUserId: target.id, acceptedAt: null }, status: { in: ["QUEUED", "SENDING", "REVIEW"] } }, data: { status: "CANCELED", lockedAt: null, leaseId: null, lastError: "The inviting account was suspended." } });
    }
    await tx.adminImpersonation.updateMany({ where: { OR: [{ actorUserId: target.id }, { targetUserId: target.id }], endedAt: null }, data: { endedAt: now } });
    await tx.adminMfaSession.deleteMany({ where: { userId: target.id } });
    const sessions = await tx.session.deleteMany({ where: { userId: target.id } });
    // End existing sign-in links as well as browser sessions. Password recovery is
    // still available while suspended, but cannot restore account access.
    await tx.verificationToken.updateMany({ where: { email: target.email, purpose: AUTH_TOKEN_PURPOSES.magicLogin, usedAt: null }, data: { usedAt: now } });
    const updated = await tx.user.update({ where: { id: target.id }, data: {
      accessRevision: { increment: 1 }, ...(input.operation === "revoke_sessions" ? {} : { suspendedAt: input.operation === "suspend" ? now : null })
    }, select: { suspendedAt: true, accessRevision: true } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: `user.access.${input.operation}`, entityType: "User", entityId: target.id, reason,
      beforeData: { suspended: Boolean(target.suspendedAt), revision: target.accessRevision },
      afterData: { suspended: Boolean(updated.suspendedAt), revision: updated.accessRevision, sessionsEnded: sessions.count, invitationsRevoked: revokedInvites } } });
    return { sessionsEnded: sessions.count, invitationsRevoked: revokedInvites, revision: updated.accessRevision };
  });
}
