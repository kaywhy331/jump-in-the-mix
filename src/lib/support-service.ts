import { randomBytes } from "node:crypto";
import type {
  Prisma,
  SupportEmailStatus,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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
  body: string;
}) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({ where: { id: input.ticketId } });
    if (!ticket) throw new SupportTicketError("Support ticket not found.");
    if (ticket.status === "CLOSED") {
      throw new SupportTicketError("Reopen this ticket before adding another response.");
    }
    const message = await tx.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorUserId: input.adminUserId,
        authorType: "ADMIN",
        body: input.body,
        emailStatus: "PENDING"
      }
    });
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
    return { ticket: updatedTicket, message };
  });
}

export async function updateSupportTicketTriage(input: {
  ticketId: string;
  adminUserId: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
}) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({ where: { id: input.ticketId } });
    if (!ticket) throw new SupportTicketError("Support ticket not found.");
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
  status: SupportTicketStatus;
}) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({ where: { id: input.ticketId } });
    if (!ticket) throw new SupportTicketError("Support ticket not found.");
    const resolving = input.status === "RESOLVED" || input.status === "CLOSED";
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

export async function updateSupportMessageEmailStatus(input: {
  messageId: string;
  status: SupportEmailStatus;
  providerId?: string | null;
  error?: string | null;
}) {
  return prisma.supportTicketMessage.update({
    where: { id: input.messageId },
    data: {
      emailStatus: input.status,
      emailProviderId: input.providerId ?? null,
      emailError: input.error?.slice(0, 2000) ?? null,
      emailSentAt: input.status === "SENT" ? new Date() : null
    }
  });
}
