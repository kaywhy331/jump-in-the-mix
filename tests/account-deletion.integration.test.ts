import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteAccountData } from "../src/lib/account-deletion";
import { prisma } from "../src/lib/prisma";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const userId = `delete-user-${suffix}`;
const workspaceId = `delete-workspace-${suffix}`;

async function seedDeletionGraph() {
  await prisma.user.create({
    data: {
      id: userId,
      email: `delete-${suffix}@example.com`,
      name: "Deletion Test",
      passwordHash: "test-only",
      ownedWorkspaces: {
        create: {
          id: workspaceId,
          name: "Deletion Workspace",
          slug: `delete-${suffix}`,
          members: { create: { id: `delete-member-${suffix}`, userId, role: "OWNER" } },
          contacts: { create: { id: `delete-contact-${suffix}`, displayName: "Delete Me" } },
          jobs: { create: { id: `delete-job-${suffix}`, task: "delete.test", payload: {} } }
        }
      }
    }
  });
  await prisma.session.create({
    data: { id: `delete-session-${suffix}`, userId, tokenHash: `delete-token-${suffix}`, expiresAt: new Date(Date.now() + 60_000) }
  });
  const dateType = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Deletion Date", slug: `deletion-date-${suffix}` } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Deletion Jump", channel: "EMAIL" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Deletion test" } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Deletion Mix", status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateTypeId: dateType.id } });
  const mixStep = await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
  const jumpDate = await prisma.jumpDate.create({ data: { workspaceId, contactId: `delete-contact-${suffix}`, dateTypeId: dateType.id, dateValue: new Date(Date.now() + 86_400_000), timezone: "America/Los_Angeles" } });
  const jumpBase = {
    workspaceId,
    contactId: `delete-contact-${suffix}`,
    jumpDateId: jumpDate.id,
    mixId: mix.id,
    mixStepId: mixStep.id,
    stepVersionId: version.id,
    templateSnapshot: { channel: "EMAIL", body: "Deletion test" },
    renderedSnapshot: { body: "Deletion test" }
  };
  await prisma.jump.createMany({
    data: [
      { ...jumpBase, scheduledAt: new Date(Date.now() + 86_400_000), status: "PENDING", reason: "Future deletion test", uniquenessKey: `delete-future-${suffix}` },
      { ...jumpBase, scheduledAt: new Date(Date.now() - 86_400_000), status: "DONE", completedAt: new Date(), reason: "Completed deletion test", uniquenessKey: `delete-completed-${suffix}` }
    ]
  });
  await prisma.supportTicket.create({
    data: {
      id: `delete-ticket-${suffix}`,
      reference: `JITM-DELETE-${suffix}`,
      workspaceId,
      requesterUserId: userId,
      title: "Delete account",
      category: "ACCOUNT",
      messages: { create: { id: `delete-message-${suffix}`, authorUserId: userId, authorType: "USER", body: "Private" } }
    }
  });
}

beforeEach(async () => {
  if (!(await prisma.user.findUnique({ where: { id: userId } }))) await seedDeletionGraph();
});

afterAll(async () => {
  await prisma.supportTicket.deleteMany({ where: { workspaceId } });
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.accountDeletionAudit.deleteMany({ where: { requestId: { startsWith: `delete-request-${suffix}` } } });
  await prisma.$disconnect();
});

describe("account deletion", () => {
  it("atomically removes sessions, jobs, contacts, support history, and workspace data", async () => {
    const requestId = `delete-request-${suffix}-success`;
    await expect(deleteAccountData(userId, requestId)).resolves.toEqual({ deleted: true, requestId });
    await expect(prisma.user.findUnique({ where: { id: userId } })).resolves.toBeNull();
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(0);
    await expect(prisma.workspace.count({ where: { id: workspaceId } })).resolves.toBe(0);
    await expect(prisma.contact.count({ where: { workspaceId } })).resolves.toBe(0);
    await expect(prisma.job.count({ where: { workspaceId } })).resolves.toBe(0);
    await expect(prisma.jump.count({ where: { workspaceId } })).resolves.toBe(0);
    await expect(prisma.supportTicket.count({ where: { workspaceId } })).resolves.toBe(0);
    await expect(prisma.accountDeletionAudit.findUnique({ where: { requestId } })).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("is idempotent when repeated after deletion", async () => {
    const requestId = `delete-request-${suffix}-repeat`;
    await expect(deleteAccountData(userId, requestId)).resolves.toEqual({ deleted: true, requestId });
    await expect(deleteAccountData(userId)).resolves.toEqual({ deleted: false });
  });
});
