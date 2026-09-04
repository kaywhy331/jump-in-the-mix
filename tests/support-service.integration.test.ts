import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import {
  adminReplyToSupportTicketRecord,
  createSupportTicketRecord,
  getRequesterSupportTicket,
  reopenSupportTicketRecord,
  replyToSupportTicketRecord,
  updateSupportMessageEmailStatus,
  updateSupportTicketStatus,
  updateSupportTicketTriage
} from "../src/lib/support-service";

describe.sequential("support ticket lifecycle and workspace isolation", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [userA, userB, admin] = await Promise.all([
      prisma.user.create({ data: { email: `support-a-${suffix}@example.com`, name: "Support User A", passwordHash: "test-only" } }),
      prisma.user.create({ data: { email: `support-b-${suffix}@example.com`, name: "Support User B", passwordHash: "test-only" } }),
      prisma.user.create({ data: { email: `support-admin-${suffix}@example.com`, name: "Support Admin", passwordHash: "test-only", isPlatformAdmin: true } })
    ]);
    const [workspaceA, workspaceB] = await Promise.all([
      prisma.workspace.create({
        data: {
          name: "Support Workspace A",
          slug: `support-a-${suffix}`,
          ownerId: userA.id,
          profile: { create: {} },
          members: { create: { userId: userA.id, role: "OWNER" } }
        }
      }),
      prisma.workspace.create({
        data: {
          name: "Support Workspace B",
          slug: `support-b-${suffix}`,
          ownerId: userB.id,
          profile: { create: {} },
          members: { create: { userId: userB.id, role: "OWNER" } }
        }
      })
    ]);
    Object.assign(ids, {
      userA: userA.id,
      userB: userB.id,
      admin: admin.id,
      workspaceA: workspaceA.id,
      workspaceB: workspaceB.id
    });
  });

  afterAll(async () => {
    const workspaceIds = [ids.workspaceA, ids.workspaceB].filter(Boolean);
    if (workspaceIds.length) {
      await prisma.supportTicket.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    }
    const userIds = [ids.userA, ids.userB, ids.admin].filter(Boolean);
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("creates one durable ticket and keeps requester access workspace scoped", async () => {
    const ticket = await createSupportTicketRecord({
      workspaceId: ids.workspaceA,
      requesterUserId: ids.userA,
      title: "My Jump queue needs investigation",
      category: "JUMPS",
      body: "A Contact has a matching Jump Date and Active Mix, but I need help understanding the resulting queue."
    });
    ids.ticket = ticket.id;

    expect(ticket.reference).toMatch(/^JITM-/);
    expect(ticket.status).toBe("OPEN");
    const ownTicket = await getRequesterSupportTicket({
      ticketId: ticket.id,
      workspaceId: ids.workspaceA,
      requesterUserId: ids.userA
    });
    expect(ownTicket?.messages).toHaveLength(1);
    expect(ownTicket?.messages[0]).toMatchObject({ authorType: "USER" });

    expect(await getRequesterSupportTicket({
      ticketId: ticket.id,
      workspaceId: ids.workspaceB,
      requesterUserId: ids.userB
    })).toBeNull();
    expect(await getRequesterSupportTicket({
      ticketId: ticket.id,
      workspaceId: ids.workspaceA,
      requesterUserId: ids.userB
    })).toBeNull();
    await expect(replyToSupportTicketRecord({
      ticketId: ticket.id,
      workspaceId: ids.workspaceB,
      requesterUserId: ids.userB,
      body: "Cross-workspace reply attempt"
    })).rejects.toThrow(/not found/i);
  });

  it("supports user replies, administrator triage, branded replies, resolution, and reopen", async () => {
    await replyToSupportTicketRecord({
      ticketId: ids.ticket,
      workspaceId: ids.workspaceA,
      requesterUserId: ids.userA,
      body: "The issue happened again after I edited the Mix audience."
    });
    expect(await prisma.supportTicket.findUniqueOrThrow({ where: { id: ids.ticket } })).toMatchObject({
      status: "WAITING_ON_SUPPORT"
    });

    const adminReply = await adminReplyToSupportTicketRecord({
      ticketId: ids.ticket,
      adminUserId: ids.admin,
      body: "We reviewed the workspace configuration. Please reopen the Mix and confirm its Target Jump Date Type."
    });
    expect(adminReply.message).toMatchObject({ authorType: "ADMIN", emailStatus: "PENDING" });
    expect(adminReply.ticket.status).toBe("WAITING_ON_USER");

    await updateSupportTicketTriage({
      ticketId: ids.ticket,
      adminUserId: ids.admin,
      category: "MIXES",
      priority: "HIGH"
    });
    await updateSupportMessageEmailStatus({
      messageId: adminReply.message.id,
      status: "SENT",
      providerId: "email-test-123"
    });
    await updateSupportTicketStatus({
      ticketId: ids.ticket,
      adminUserId: ids.admin,
      status: "RESOLVED"
    });
    expect(await prisma.supportTicket.findUniqueOrThrow({ where: { id: ids.ticket } })).toMatchObject({
      category: "MIXES",
      priority: "HIGH",
      status: "RESOLVED"
    });

    await reopenSupportTicketRecord({
      ticketId: ids.ticket,
      workspaceId: ids.workspaceA,
      requesterUserId: ids.userA
    });
    const reopened = await getRequesterSupportTicket({
      ticketId: ids.ticket,
      workspaceId: ids.workspaceA,
      requesterUserId: ids.userA
    });
    expect(reopened).toMatchObject({ status: "WAITING_ON_SUPPORT", resolvedAt: null, resolvedByUserId: null });
    expect(reopened?.messages).toHaveLength(4);
    expect(reopened?.messages.at(-1)?.body).toMatch(/reopened the ticket/i);
    expect(await prisma.auditLog.count({ where: { workspaceId: ids.workspaceA, entityId: ids.ticket } })).toBeGreaterThanOrEqual(6);
  });
});
