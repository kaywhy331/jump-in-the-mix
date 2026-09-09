import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { lockStaff } from "@/lib/staff-access";
import { supportReadReceipt, type SupportReadContext } from "@/lib/support-read-audit";

export type SupportActor = { actorUserId: string; actorSessionId: string };
export class SupportAccessError extends Error {}

export async function assertSupportActor(tx: Prisma.TransactionClient, actor: SupportActor, customerView = false) {
  const now = new Date();
  const user = await tx.user.findUnique({ where: { id: actor.actorUserId }, select: { emailVerifiedAt: true, suspendedAt: true, staffMembership: true } });
  const session = await tx.session.findFirst({ where: { id: actor.actorSessionId, userId: actor.actorUserId, expiresAt: { gt: now } }, select: { id: true } });
  if (!session || !user?.emailVerifiedAt || user.suspendedAt || !hasAdminPermission(user.staffMembership, "support.manage") || (customerView && !hasAdminPermission(user.staffMembership, "support.view_customer"))) {
    throw new SupportAccessError("Your current staff session does not have the required support permission.");
  }
  if (env.requireAdminMfa && (!await tx.adminMfaCredential.findFirst({ where: { userId: actor.actorUserId, enabledAt: { not: null } }, select: { userId: true } }) || !await tx.adminMfaSession.findFirst({ where: { userId: actor.actorUserId, sessionId: session.id, expiresAt: { gt: now } }, select: { sessionId: true } }))) {
    throw new SupportAccessError("Verify MFA before accessing this support case.");
  }
}

export async function lockSupportTicket(tx: Prisma.TransactionClient, ticketId: string) {
  if (!ticketId || ticketId.length > 100) throw new SupportAccessError("Support ticket not found.");
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "SupportTicket" WHERE id=${ticketId} FOR UPDATE`;
  if (!rows.length) throw new SupportAccessError("Support ticket not found.");
  return tx.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
}

export async function assignSupportTicket(input: SupportActor & { ticketId: string; assignedToUserId: string | null; expectedRevision: number; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500 || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || (input.assignedToUserId?.length ?? 0) > 100) throw new SupportAccessError("Choose an assignee and add a reason of 10–500 characters.");
  return prisma.$transaction(async tx => {
    await lockStaff(tx);
    await assertSupportActor(tx, input);
    const ticket = await lockSupportTicket(tx, input.ticketId);
    if (ticket.assignmentRevision !== input.expectedRevision) throw new SupportAccessError("This assignment changed. Reload the ticket before saving.");
    if (input.assignedToUserId) {
      const assignee = await tx.user.findUnique({ where: { id: input.assignedToUserId }, select: { emailVerifiedAt: true, suspendedAt: true, staffMembership: true } });
      if (!assignee?.emailVerifiedAt || assignee.suspendedAt || !hasAdminPermission(assignee.staffMembership, "support.manage")) throw new SupportAccessError("Choose an active staff member with support permission.");
    }
    if (ticket.assignedToUserId === input.assignedToUserId) return ticket;
    const ended = await tx.adminImpersonation.updateMany({ where: { ticketId: ticket.id, endedAt: null }, data: { endedAt: new Date() } });
    const updated = await tx.supportTicket.update({ where: { id: ticket.id }, data: { assignedToUserId: input.assignedToUserId, assignmentRevision: { increment: 1 } } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "support.case.assign", entityType: "SupportTicket", entityId: ticket.id, reason, beforeData: { assignedToUserId: ticket.assignedToUserId, revision: ticket.assignmentRevision }, afterData: { assignedToUserId: updated.assignedToUserId, revision: updated.assignmentRevision, endedViews: ended.count } } });
    return updated;
  });
}

export async function readSupportCase(input: SupportActor & { ticketId: string; read: SupportReadContext }) {
  return prisma.$transaction(async tx => {
    await lockStaff(tx);
    await assertSupportActor(tx, input);
    const exists = await tx.supportTicket.findUnique({ where: { id: input.ticketId }, select: { id: true } });
    if (!exists) return null;
    await lockSupportTicket(tx, exists.id);
    const ticket = await tx.supportTicket.findUniqueOrThrow({ where: { id: exists.id }, include: { messages: { orderBy: { createdAt: "asc" }, include: { emailDeliveries: { orderBy: { generation: "desc" }, select: { id: true, generation: true, status: true, attempts: true, firstAttemptAt: true, availableAt: true, acceptedAt: true, updatedAt: true, createdAt: true, lastError: true, messageCiphertext: true } } } } } });
    await tx.platformAuditEvent.createMany({ data: [supportReadReceipt({ ...input, read: { ...input.read, resource: "support-conversation", resourceId: ticket.id } })], skipDuplicates: true });
    return { ...ticket, messages: ticket.messages.map(message => ({ ...message, emailDeliveries: message.emailDeliveries.map(({ messageCiphertext, ...delivery }) => ({ ...delivery, hasFrozenContent: Boolean(messageCiphertext) })) })) };
  });
}
