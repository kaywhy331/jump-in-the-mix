import type { Prisma, StaffInvitation } from "@/generated/prisma/client";
import { hasAdminPermission } from "@/lib/admin-permissions";

export async function staffInvitationAvailable(tx: Prisma.TransactionClient, invite: Pick<StaffInvitation, "email" | "acceptedAt" | "revokedAt" | "expiresAt" | "issuerUserId" | "issuerRevision">, now = new Date()) {
  if (invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) return false;
  const issuer = await tx.staffMembership.findUnique({ where: { userId: invite.issuerUserId }, include: { user: { select: { emailVerifiedAt: true, suspendedAt: true } } } });
  if (!issuer?.user?.emailVerifiedAt || issuer.user.suspendedAt || issuer.revision !== invite.issuerRevision || !hasAdminPermission(issuer, "staff.manage")) return false;
  if (await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } })) return false;
  return !await tx.emailSuppression.findFirst({ where: { clearedAt: null, email: invite.email }, select: { id: true } });
}

// Callers hold the access lock or staff lock. Acceptance always locks staff before
// access. The helper itself never introduces another lock order.
export async function revokeStaffInvitations(tx: Prisma.TransactionClient, where: Prisma.StaffInvitationWhereInput, now = new Date()) {
  const pending = await tx.staffInvitation.findMany({ where: { ...where, acceptedAt: null, revokedAt: null }, select: { id: true } });
  const ids = pending.map(row => row.id);
  if (!ids.length) return 0;
  await tx.staffInvitation.updateMany({ where: { id: { in: ids } }, data: { revokedAt: now } });
  await tx.waitlistDelivery.updateMany({ where: { staffInvitationId: { in: ids }, status: { in: ["QUEUED", "SENDING", "REVIEW"] } }, data: { status: "CANCELED", lockedAt: null, leaseId: null, lastError: "Staff invitation is no longer available." } });
  return ids.length;
}
