import { prisma } from "@/lib/prisma";
import { lockStaff } from "@/lib/staff-access";
import { revokeStaffInvitations } from "@/lib/staff-invitation-state";

// Operator CLI only. This is intentionally not a public Server Action or HTTP route.
export async function bootstrapFirstOwner(email: string): Promise<boolean> {
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Choose a valid operator email.");
  return prisma.$transaction(async tx => {
    await lockStaff(tx);
    if (await tx.staffMembership.count({ where: { role: "OWNER", status: "ACTIVE" } })) throw new Error("An active owner already exists. Use Admin → Team for further changes.");
    const user = await tx.user.upsert({ where: { email }, create: { email, name: "Platform operator" }, update: {}, select: { id: true, emailVerifiedAt: true, suspendedAt: true } });
    if (user.suspendedAt) throw new Error("Restore account access before setting up this owner.");
    const ready = Boolean(user.emailVerifiedAt && await tx.adminMfaCredential.findFirst({ where: { userId: user.id, enabledAt: { not: null } } }));
    const role = ready ? "OWNER" : "OPERATOR";
    const previous = await tx.staffMembership.findUnique({ where: { userId: user.id } });
    const staff = await tx.staffMembership.upsert({ where: { userId: user.id }, create: { userId: user.id, role }, update: { role, status: "ACTIVE", grants: [], denies: [], revision: { increment: 1 } } });
    await revokeStaffInvitations(tx, { issuerUserId: user.id });
    await tx.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
    await tx.adminImpersonation.updateMany({ where: { actorUserId: user.id, endedAt: null }, data: { endedAt: new Date() } });
    await tx.adminMfaSession.deleteMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.platformAuditEvent.create({ data: { action: ready ? "staff.owner.bootstrap" : "staff.owner.enrollment", entityType: "StaffMembership", entityId: staff.id, reason: "Explicit operator command for the first owner", beforeData: previous ? { role: previous.role } : undefined, afterData: { role, userId: user.id } } });
    return ready;
  });
}
