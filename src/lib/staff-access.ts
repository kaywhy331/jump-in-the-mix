import type { Prisma } from "@/generated/prisma/client";
import { hasAdminPermission, isAdminPermission, STAFF_ROLES, type AdminPermission, type AdminRole } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { revokeStaffInvitations } from "@/lib/staff-invitation-state";

export class StaffAccessError extends Error {}

export async function userHasAdminPermission(userId: string, permission: AdminPermission): Promise<boolean> {
  const staff = await prisma.staffMembership.findUnique({ where: { userId } });
  return hasAdminPermission(staff, permission);
}

export async function lockStaff(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(814733, 2)`;
}

export async function assertStaffPermission(tx: Prisma.TransactionClient, userId: string, permission: AdminPermission) {
  const staff = await tx.staffMembership.findUnique({ where: { userId } });
  if (!hasAdminPermission(staff, permission)) throw new StaffAccessError(`Staff permission required: ${permission}.`);
}

// Call under the staff lock for operations whose route authorization may have
// become stale while waiting for a database transaction.
export async function staffSessionHasPermissions(tx: Prisma.TransactionClient, actor: { userId: string; sessionId: string }, permissions: AdminPermission[]) {
  const now = new Date();
  const user = await tx.user.findUnique({ where: { id: actor.userId }, select: { emailVerifiedAt: true, suspendedAt: true, staffMembership: true } });
  if (!user?.emailVerifiedAt || user.suspendedAt || !permissions.every(permission => hasAdminPermission(user.staffMembership, permission))) return false;
  if (!await tx.session.findFirst({ where: { id: actor.sessionId, userId: actor.userId, expiresAt: { gt: now } }, select: { id: true } })) return false;
  if (env.requireAdminMfa && (!await tx.adminMfaCredential.findFirst({ where: { userId: actor.userId, enabledAt: { not: null } }, select: { userId: true } }) || !await tx.adminMfaSession.findFirst({ where: { userId: actor.userId, sessionId: actor.sessionId, expiresAt: { gt: now } }, select: { sessionId: true } }))) return false;
  return true;
}

export function validateStaffAccess(input: { role: string; status: string; grants: string[]; denies: string[]; reason: string }) {
  if (!STAFF_ROLES.includes(input.role as AdminRole)) throw new StaffAccessError("Choose a valid staff role.");
  if (!["ACTIVE", "DISABLED"].includes(input.status)) throw new StaffAccessError("Choose active or disabled.");
  if (input.grants.length > 30 || input.denies.length > 30 || [...input.grants, ...input.denies].some(p => !isAdminPermission(p))) throw new StaffAccessError("Choose only listed permissions.");
  if (input.role !== "OWNER" && input.grants.includes("staff.manage")) throw new StaffAccessError("Only owners can manage staff.");
  if (input.role === "OWNER" && input.denies.includes("staff.manage")) throw new StaffAccessError("Owners must retain staff management access.");
  if (input.reason.trim().length < 10 || input.reason.length > 500) throw new StaffAccessError("Give a reason between 10 and 500 characters.");
}

export async function changeStaffAccess(input: {
  actorUserId: string; actorSessionId: string; targetUserId: string; expectedRevision: number;
  role: AdminRole; status: "ACTIVE" | "DISABLED"; grants: string[]; denies: string[]; reason: string;
}) {
  validateStaffAccess(input);
  return prisma.$transaction(async tx => {
    await lockStaff(tx);
    const actor = await tx.staffMembership.findUnique({ where: { userId: input.actorUserId } });
    const session = await tx.session.findFirst({ where: { id: input.actorSessionId, userId: input.actorUserId, expiresAt: { gt: new Date() } } });
    if (!session || !hasAdminPermission(actor, "staff.manage")) throw new StaffAccessError("Owner access is required.");
    const target = await tx.user.findUnique({ where: { id: input.targetUserId }, select: { id: true, emailVerifiedAt: true, suspendedAt: true } });
    if (!target?.emailVerifiedAt) throw new StaffAccessError("Choose an existing account with a confirmed email.");
    if (target.suspendedAt) throw new StaffAccessError("Restore account access before adding staff permissions.");
    const existing = await tx.staffMembership.findUnique({ where: { userId: target.id } });
    if ((existing?.revision ?? 0) !== input.expectedRevision) throw new StaffAccessError("This staff member changed. Reload before saving.");
    if (input.role === "OWNER" && input.status === "ACTIVE" && !await tx.adminMfaCredential.findFirst({ where: { userId: target.id, enabledAt: { not: null } } })) throw new StaffAccessError("Enable MFA on this account before making it an owner.");
    if (existing?.role === "OWNER" && existing.status === "ACTIVE" && (input.role !== "OWNER" || input.status !== "ACTIVE")) {
      if (await tx.staffMembership.count({ where: { role: "OWNER", status: "ACTIVE" } }) <= 1) throw new StaffAccessError("Keep at least one active owner.");
    }
    const next = { role: input.role, status: input.status, grants: [...new Set(input.grants)], denies: [...new Set(input.denies)] };
    const member = await tx.staffMembership.upsert({ where: { userId: target.id }, create: { userId: target.id, ...next }, update: { ...next, revision: { increment: 1 } } });
    await revokeStaffInvitations(tx, { issuerUserId: target.id });
    // Retain the boolean only for older display/fixture compatibility; it grants no authority.
    await tx.user.update({ where: { id: target.id }, data: { isPlatformAdmin: input.status === "ACTIVE" } });
    await tx.adminImpersonation.updateMany({ where: { actorUserId: target.id, endedAt: null }, data: { endedAt: new Date() } });
    await tx.adminMfaSession.deleteMany({ where: { userId: target.id } });
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: existing ? "staff.access.update" : "staff.access.grant", entityType: "StaffMembership", entityId: member.id, reason: input.reason.trim(),
      beforeData: existing ? { role: existing.role, status: existing.status, grants: existing.grants, denies: existing.denies, revision: existing.revision } : undefined,
      afterData: { ...next, revision: member.revision, userId: target.id } } });
    return member;
  });
}
