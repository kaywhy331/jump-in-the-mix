import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccountData } from "../src/lib/account-deletion";
import { encryptIntegrationCredentials } from "../src/lib/integration-crypto";
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
          jobs: { create: { id: `delete-job-${suffix}`, task: "delete.test", payload: {} } },
          integrations: {
            create: {
              id: `delete-integration-${suffix}`,
              provider: "GOOGLE_CONTACTS",
              status: "ACTIVE",
              scopes: [],
              credentialsCiphertext: encryptIntegrationCredentials({ refreshToken: "test-refresh-token" })
            }
          }
        }
      }
    }
  });
  await prisma.session.create({
    data: { id: `delete-session-${suffix}`, userId, tokenHash: `delete-token-${suffix}`, expiresAt: new Date(Date.now() + 60_000) }
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
  await prisma.$disconnect();
});

describe("account deletion", () => {
  it("revokes providers and atomically removes sessions, credentials, jobs, contacts, and workspace data", async () => {
    const revoke = vi.fn().mockResolvedValue(undefined);
    await expect(deleteAccountData(userId, revoke)).resolves.toEqual({ deleted: true, revocationWarnings: [] });
    expect(revoke).toHaveBeenCalledOnce();
    await expect(prisma.user.findUnique({ where: { id: userId } })).resolves.toBeNull();
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(0);
    await expect(prisma.workspace.count({ where: { id: workspaceId } })).resolves.toBe(0);
    await expect(prisma.contact.count({ where: { workspaceId } })).resolves.toBe(0);
    await expect(prisma.job.count({ where: { workspaceId } })).resolves.toBe(0);
    await expect(prisma.integrationConnection.count({ where: { workspaceId } })).resolves.toBe(0);
    await expect(prisma.supportTicket.count({ where: { workspaceId } })).resolves.toBe(0);
  });

  it("finishes local deletion when revocation fails and is idempotent when repeated", async () => {
    const result = await deleteAccountData(userId, async () => { throw new Error("provider timeout"); });
    expect(result.deleted).toBe(true);
    expect(result.revocationWarnings).toEqual(["GOOGLE_CONTACTS: provider timeout"]);
    await expect(deleteAccountData(userId)).resolves.toEqual({ deleted: false, revocationWarnings: [] });
  });
});
