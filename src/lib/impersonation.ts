import { createHash, randomBytes, randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { lockStaff } from "@/lib/staff-access";
import { assertSupportActor, lockSupportTicket, SupportAccessError, type SupportActor } from "@/lib/support-case-access";
import { supportReadReceipt, type SupportReadContext } from "@/lib/support-read-audit";

export function hashImpersonationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createAdminImpersonationGrant(input: SupportActor & {
  ticketId: string; expectedRevision: number; reason: string;
}) {
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < 10 || reason.length > 500) throw new SupportAccessError("Add a support reason of 10–500 characters.");
  const rawToken = randomBytes(32).toString("base64url");
  const grant = await prisma.$transaction(async tx => {
    await lockStaff(tx);
    await assertSupportActor(tx, input, true);
    const ticket = await lockSupportTicket(tx, input.ticketId);
    if (ticket.assignmentRevision !== input.expectedRevision) throw new SupportAccessError("This assignment changed. Reload the ticket before starting a support view.");
    if (ticket.assignedToUserId !== input.actorUserId || ["RESOLVED", "CLOSED"].includes(ticket.status)) throw new SupportAccessError("An active ticket must be assigned to you before opening a customer view.");
    if (ticket.requesterUserId === input.actorUserId) throw new SupportAccessError("Use your own account outside a support view.");
    const membership = await tx.workspaceMember.findFirst({ where: { userId: ticket.requesterUserId, workspaceId: ticket.workspaceId, user: { suspendedAt: null } }, select: { id: true } });
    if (!membership) throw new SupportAccessError("The requester no longer has access to this workspace.");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.impersonationMinutes * 60 * 1000);
    const ended = await tx.adminImpersonation.updateMany({ where: { actorUserId: input.actorUserId, endedAt: null }, data: { endedAt: now } });
    const created = await tx.adminImpersonation.create({ data: {
      tokenHash: hashImpersonationToken(rawToken), actorUserId: input.actorUserId, actorSessionId: input.actorSessionId,
      ticketId: ticket.id, targetUserId: ticket.requesterUserId, workspaceId: ticket.workspaceId,
      reason, expiresAt, lastSeenAt: now
    } });
    const metadata = { impersonationId: created.id, ticketId: ticket.id, actorSessionId: input.actorSessionId, reason, expiresAt: expiresAt.toISOString(), mode: "VIEW_ONLY", endedPriorViews: ended.count };
    await tx.auditLog.create({ data: { workspaceId: ticket.workspaceId, actorType: "ADMIN", actorUserId: input.actorUserId, action: "admin.impersonation.start", entityType: "User", entityId: ticket.requesterUserId, source: "admin.support", metadata } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "support.view.start", entityType: "SupportTicket", entityId: ticket.id, reason, afterData: metadata } });
    return created;
  });
  return { rawToken, grant };
}

export async function resolveAdminImpersonationGrant(rawToken: string, actorUserId: string, actorSessionId: string, read: SupportReadContext = { requestId: randomUUID(), resource: "other" }) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return null;
  return prisma.$transaction(async tx => {
    await lockStaff(tx);
    try { await assertSupportActor(tx, { actorUserId, actorSessionId }, true); }
    catch (error) { if (error instanceof SupportAccessError) return null; throw error; }
    const now = new Date();
    const grant = await tx.adminImpersonation.findUnique({ where: { tokenHash: hashImpersonationToken(rawToken) } });
    if (!grant || grant.actorUserId !== actorUserId || grant.actorSessionId !== actorSessionId || !grant.ticketId || grant.endedAt || grant.expiresAt <= now) return null;
    // Staff -> case -> grant is the same ordering used by assignment and closure.
    let ticket;
    try { ticket = await lockSupportTicket(tx, grant.ticketId); }
    catch (error) { if (error instanceof SupportAccessError) return null; throw error; }
    if (ticket.assignedToUserId !== actorUserId || ticket.workspaceId !== grant.workspaceId || ticket.requesterUserId !== grant.targetUserId || ["RESOLVED", "CLOSED"].includes(ticket.status)) return null;
    const targetUser = await tx.user.findUnique({ where: { id: grant.targetUserId }, include: { memberships: { where: { workspaceId: grant.workspaceId }, include: { workspace: { include: { profile: true } } }, take: 1 } } });
    if (!targetUser?.memberships[0] || targetUser.suspendedAt) return null;
    // This conditional write also orders end-session against in-flight reads.
    const touched = await tx.adminImpersonation.updateMany({ where: { id: grant.id, endedAt: null, expiresAt: { gt: now }, actorSessionId }, data: { lastSeenAt: now } });
    if (!touched.count) return null;
    await tx.platformAuditEvent.createMany({ data: [supportReadReceipt({ actorUserId, actorSessionId, ticketId: ticket.id, grantId: grant.id, read })], skipDuplicates: true });
    return { id: grant.id, actorUserId, actorSessionId, targetUserId: grant.targetUserId, workspaceId: grant.workspaceId, ticketId: ticket.id, reference: ticket.reference, reason: grant.reason, expiresAt: grant.expiresAt, targetUser };
  });
}

export async function endAdminImpersonationGrant(rawToken: string, actorUserId: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return false;
  return prisma.$transaction(async tx => {
    const grant = await tx.adminImpersonation.findFirst({ where: { tokenHash: hashImpersonationToken(rawToken), actorUserId, endedAt: null } });
    if (!grant) return false;
    const endedAt = new Date();
    const changed = await tx.adminImpersonation.updateMany({ where: { id: grant.id, endedAt: null }, data: { endedAt } });
    if (!changed.count) return false;
    await tx.auditLog.create({ data: { workspaceId: grant.workspaceId, actorType: "ADMIN", actorUserId, action: "admin.impersonation.end", entityType: "User", entityId: grant.targetUserId, source: "admin.support", metadata: { impersonationId: grant.id, ticketId: grant.ticketId, endedAt: endedAt.toISOString(), mode: "VIEW_ONLY" } } });
    await tx.platformAuditEvent.create({ data: { actorUserId, action: "support.view.end", entityType: "AdminImpersonation", entityId: grant.id, afterData: { ticketId: grant.ticketId } } });
    return true;
  });
}

export function impersonationCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  };
}
