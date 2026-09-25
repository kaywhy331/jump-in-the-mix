import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockStaff } from "@/lib/staff-access";
import { lockAccess, lockWorkspaceImports } from "@/lib/access-lock";

export type AccountDeletionResult = {
  deleted: boolean;
  requestId?: string;
};

export const LAST_ACTIVE_OWNER_MESSAGE = "Add another active owner before deleting your account.";

/** Deletion refused by a rule the person can act on themselves; nothing was removed. */
export class AccountDeletionBlockedError extends Error {}

function subjectHash(userId: string): string {
  return createHash("sha256").update(`account-deletion:${userId}`).digest("hex");
}

// Reports the person filed against other people's shares. An open report keeps the listing in the
// staff queue (it may be the reason the share is hidden), so only the reporter and their free text
// go; decided reports hold nothing but the reporter's history and are removed.
async function detachMarketplaceReports(tx: Prisma.TransactionClient, userId: string, workspaceIds: string[]): Promise<void> {
  const filed = { OR: [{ reporterUserId: userId }, { reporterWorkspaceId: { in: workspaceIds } }] };
  await tx.marketplaceReport.deleteMany({ where: { ...filed, status: { not: "OPEN" } } });
  const open = await tx.marketplaceReport.findMany({ where: { ...filed, status: "OPEN" }, select: { id: true } });
  for (const report of open) {
    await tx.marketplaceReport.update({
      where: { id: report.id },
      data: { reporterUserId: `deleted:${report.id}`, reporterWorkspaceId: `deleted:${report.id}`, details: null }
    });
  }
}

export async function deleteAccountData(
  userId: string,
  requestId: string = randomUUID()
): Promise<AccountDeletionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      ownedWorkspaces: { select: { id: true } }
    }
  });
  if (!user) return { deleted: false };

  const workspaceIds = user.ownedWorkspaces.map((workspace) => workspace.id);
  await prisma.accountDeletionAudit.upsert({
    where: { requestId },
    create: { requestId, subjectHash: subjectHash(userId), status: "STARTED" },
    update: {}
  });

  await prisma.$transaction(async (tx) => {
    await lockStaff(tx);
    await lockAccess(tx);
    // Imports commit under their workspace's key, not the access lock. Wait for a row in progress to
    // commit rather than meet this cascade halfway; later rows find their job gone.
    await lockWorkspaceImports(tx, workspaceIds);
    const pendingStaff = await tx.staffInvitation.findMany({ where: { issuerUserId: userId, acceptedAt: null, revokedAt: null }, select: { id: true } });
    await tx.staffInvitation.updateMany({ where: { id: { in: pendingStaff.map(row => row.id) } }, data: { revokedAt: new Date() } });
    await tx.waitlistDelivery.updateMany({ where: { staffInvitationId: { in: pendingStaff.map(row => row.id) }, status: { in: ["QUEUED", "SENDING", "REVIEW"] } }, data: { status: "CANCELED", lockedAt: null, leaseId: null } });
    await tx.staffInvitation.deleteMany({ where: { email: user.email } });
    const staff = await tx.staffMembership.findUnique({ where: { userId } });
    if (staff?.role === "OWNER" && staff.status === "ACTIVE" && await tx.staffMembership.count({ where: { role: "OWNER", status: "ACTIVE" } }) <= 1) {
      throw new AccountDeletionBlockedError(LAST_ACTIVE_OWNER_MESSAGE);
    }
    await tx.adminImpersonation.deleteMany({
      where: {
        OR: [
          { actorUserId: userId },
          { targetUserId: userId },
          ...(workspaceIds.length ? [{ workspaceId: { in: workspaceIds } }] : [])
        ]
      }
    });
    await tx.adminMfaSession.deleteMany({ where: { userId } });
    await tx.adminMfaCredential.deleteMany({ where: { userId } });
    await tx.verificationToken.deleteMany({ where: { email: user.email } });
    await tx.waitlistEntry.deleteMany({ where: { email: user.email } });
    await tx.platformSetting.updateMany({ where: { updatedByUserId: userId }, data: { updatedByUserId: null } });
    // Only the person's own messages: replies they wrote as staff stay on other people's tickets.
    await tx.supportTicketMessage.deleteMany({ where: { authorUserId: userId, authorType: "USER" } });
    await tx.supportTicket.deleteMany({
      where: {
        OR: [
          { requesterUserId: userId },
          ...(workspaceIds.length ? [{ workspaceId: { in: workspaceIds } }] : [])
        ]
      }
    });
    await detachMarketplaceReports(tx, userId, workspaceIds);

    // Everything else scoped to the owned workspaces or to the person goes with these two deletes:
    // every such table cascades from Workspace or User through a schema relation (including imports,
    // reviews, devices, deliveries and preferences since Release B), so databases built by
    // `prisma db push` behave like migrated ones. tests/account-deletion-schema-guard.test.ts checks it.
    if (workspaceIds.length) {
      await tx.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    }

    await tx.user.delete({ where: { id: userId } });
    await tx.accountDeletionAudit.update({
      where: { requestId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        metadata: { ownedWorkspaceCount: workspaceIds.length }
      }
    });
  // A populated account cascades through thousands of indexed relationships.
  // Allow that single atomic operation to finish on the small hosted database;
  // retain a deadline without extending other application transactions.
  }, { timeout: 30_000 }).catch(async (error: unknown) => {
    // The transaction rolled back, so the row must not stay STARTED forever. Best effort: the
    // original failure is what the caller needs to see, even if this update fails too.
    await prisma.accountDeletionAudit.update({
      where: { requestId },
      data: { status: "FAILED", metadata: { ownedWorkspaceCount: workspaceIds.length, reason: error instanceof AccountDeletionBlockedError ? "blocked" : "error" } }
    }).catch(() => undefined);
    throw error;
  });

  return { deleted: true, requestId };
}
