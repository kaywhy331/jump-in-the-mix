import { createHash, randomBytes } from "node:crypto";
import type {
  Prisma,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockStaff } from "@/lib/staff-access";
import { assertSupportActor, lockSupportTicket } from "@/lib/support-case-access";

import { queueSupportReplyEmail } from "@/lib/support-email-delivery";

export class SupportTicketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportTicketError";
  }
}

function supportReference(): string {
  const time = Date.now().toString(36).toUpperCase();
  const entropy = randomBytes(4).toString("hex").toUpperCase();
  return `JITM-${time}-${entropy}`;
}

async function requesterTicket(
  tx: Prisma.TransactionClient,
  input: { ticketId: string; workspaceId: string; requesterUserId: string }
) {
  await lockSupportTicket(tx, input.ticketId);
  const ticket = await tx.supportTicket.findFirst({
    where: {
      id: input.ticketId,
      workspaceId: input.workspaceId,
      requesterUserId: input.requesterUserId
    }
  });
  if (!ticket) throw new SupportTicketError("Support ticket not found.");
  return ticket;
}

export async function createSupportTicketRecord(input: {
  workspaceId: string;
  requesterUserId: string;
  title: string;
  category: SupportTicketCategory;
  body: string;
}) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.create({
      data: {
        reference: supportReference(),
        workspaceId: input.workspaceId,
        requesterUserId: input.requesterUserId,
        title: input.title,
        category: input.category,
        status: "OPEN",
        priority: "NORMAL",
        lastActivityAt: now
      }
    });
    await tx.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorUserId: input.requesterUserId,
        authorType: "USER",
        body: input.body
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: "USER",
        actorUserId: input.requesterUserId,
        action: "support.ticket.create",
        entityType: "SupportTicket",
        entityId: ticket.id,
        source: "help",
        metadata: { reference: ticket.reference, category: ticket.category }
      }
    });
    return ticket;
  });
}

export async function getRequesterSupportTicket(input: {
  ticketId: string;
  workspaceId: string;
  requesterUserId: string;
}) {
  return prisma.supportTicket.findFirst({
    where: {
      id: input.ticketId,
      workspaceId: input.workspaceId,
      requesterUserId: input.requesterUserId
    },
    include: { messages: { orderBy: { createdAt: "asc" } } }
  });
}

export async function replyToSupportTicketRecord(input: {
  ticketId: string;
  workspaceId: string;
  requesterUserId: string;
  body: string;
}) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const ticket = await requesterTicket(tx, input);
    if (ticket.status === "CLOSED") {
      throw new SupportTicketError("This ticket is closed. Open a new ticket for additional help.");
    }
    const message = await tx.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorUserId: input.requesterUserId,
        authorType: "USER",
        body: input.body
      }
    });
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: "WAITING_ON_SUPPORT",
        lastActivityAt: now,
        resolvedAt: null,
        resolvedByUserId: null,
        closedAt: null
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: "USER",
        actorUserId: input.requesterUserId,
        action: "support.ticket.reply",
        entityType: "SupportTicket",
        entityId: ticket.id,
        source: "account.ticket",
        metadata: { reference: ticket.reference, reopened: ticket.status === "RESOLVED" }
      }
    });
    return message;
  });
}

export async function reopenSupportTicketRecord(input: {
  ticketId: string;
  workspaceId: string;
  requesterUserId: string;
}) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const ticket = await requesterTicket(tx, input);
    if (ticket.status === "CLOSED") {
      throw new SupportTicketError("This ticket is closed. Open a new ticket for additional help.");
    }
    if (ticket.status !== "RESOLVED") return ticket;
    await tx.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorUserId: input.requesterUserId,
        authorType: "USER",
        body: "I still need help with this issue and reopened the ticket."
      }
    });
    const reopened = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: "WAITING_ON_SUPPORT",
        lastActivityAt: now,
        resolvedAt: null,
        resolvedByUserId: null,
        closedAt: null
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: "USER",
        actorUserId: input.requesterUserId,
        action: "support.ticket.reopen",
        entityType: "SupportTicket",
        entityId: ticket.id,
        source: "account.ticket",
        metadata: { reference: ticket.reference }
      }
    });
    return reopened;
  });
}

export async function adminReplyToSupportTicketRecord(input: {
  ticketId: string;
  adminUserId: string;
  actorSessionId: string;
  requestKey: string;
  body: string;
}) {
  if (!/^[a-f0-9-]{36}$/i.test(input.requestKey) || input.body.trim().length < 2 || input.body.length > 5000) throw new SupportTicketError("Reload the reply form and write a response of 2–5000 characters.");
  const requestKey = createHash("sha256").update(JSON.stringify([input.adminUserId, input.ticketId, input.requestKey])).digest("hex");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await lockStaff(tx);
    await assertSupportActor(tx, { actorUserId: input.adminUserId, actorSessionId: input.actorSessionId });
    const ticket = await lockSupportTicket(tx, input.ticketId);
    const previous = await tx.supportTicketMessage.findUnique({ where: { requestKey } });
    if (previous) {
      if (previous.body !== input.body) throw new SupportTicketError("This reply was already saved with different text. Reload before adding another response.");
      return { ticket, message: previous };
    }
    if (ticket.status === "CLOSED") {
      throw new SupportTicketError("Reopen this ticket before adding another response.");
    }
    const message = await tx.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorUserId: input.adminUserId,
        authorType: "ADMIN",
        requestKey,
        body: input.body,
        emailStatus: "PENDING"
      }
    });
    await queueSupportReplyEmail(tx, ticket, message, input.adminUserId);
    const savedMessage = await tx.supportTicketMessage.findUniqueOrThrow({ where: { id: message.id } });
    const updatedTicket = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: "WAITING_ON_USER",
        lastActivityAt: now,
        resolvedAt: null,
        resolvedByUserId: null,
        closedAt: null
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: ticket.workspaceId,
        actorType: "ADMIN",
        actorUserId: input.adminUserId,
        action: "support.ticket.admin-reply",
        entityType: "SupportTicket",
        entityId: ticket.id,
        source: "admin.support",
        metadata: { reference: ticket.reference, messageId: message.id }
      }
    });
    return { ticket: updatedTicket, message: savedMessage };
  });
}

export async function updateSupportTicketTriage(input: {
  ticketId: string;
  adminUserId: string;
  actorSessionId: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
}) {
  return prisma.$transaction(async (tx) => {
    await lockStaff(tx);
    await assertSupportActor(tx, { actorUserId: input.adminUserId, actorSessionId: input.actorSessionId });
    const ticket = await lockSupportTicket(tx, input.ticketId);
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { category: input.category, priority: input.priority }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: ticket.workspaceId,
        actorType: "ADMIN",
        actorUserId: input.adminUserId,
        action: "support.ticket.triage",
        entityType: "SupportTicket",
        entityId: ticket.id,
        source: "admin.support",
        metadata: {
          reference: ticket.reference,
          previousCategory: ticket.category,
          nextCategory: input.category,
          previousPriority: ticket.priority,
          nextPriority: input.priority
        }
      }
    });
    return updated;
  });
}

export async function updateSupportTicketStatus(input: {
  ticketId: string;
  adminUserId: string;
  actorSessionId: string;
  status: SupportTicketStatus;
}) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await lockStaff(tx);
    await assertSupportActor(tx, { actorUserId: input.adminUserId, actorSessionId: input.actorSessionId });
    const ticket = await lockSupportTicket(tx, input.ticketId);
    const resolving = input.status === "RESOLVED" || input.status === "CLOSED";
    const ended = resolving ? await tx.adminImpersonation.updateMany({ where: { ticketId: ticket.id, endedAt: null }, data: { endedAt: now } }) : { count: 0 };
    await tx.platformAuditEvent.create({ data: { actorUserId: input.adminUserId, action: "support.case.status", entityType: "SupportTicket", entityId: ticket.id, beforeData: { status: ticket.status }, afterData: { status: input.status, endedViews: ended.count } } });
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: input.status,
        lastActivityAt: now,
        resolvedAt: resolving ? ticket.resolvedAt ?? now : null,
        resolvedByUserId: resolving ? input.adminUserId : null,
        closedAt: input.status === "CLOSED" ? now : null
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: ticket.workspaceId,
        actorType: "ADMIN",
        actorUserId: input.adminUserId,
        action: "support.ticket.status",
        entityType: "SupportTicket",
        entityId: ticket.id,
        source: "admin.support",
        metadata: { reference: ticket.reference, previousStatus: ticket.status, nextStatus: input.status }
      }
    });
    return updated;
  });
}
