import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type AccountDeletionResult = {
  deleted: boolean;
  requestId?: string;
};

function subjectHash(userId: string): string {
  return createHash("sha256").update(`account-deletion:${userId}`).digest("hex");
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
    await tx.platformSetting.updateMany({ where: { updatedByUserId: userId }, data: { updatedByUserId: null } });
    await tx.supportTicketMessage.deleteMany({ where: { authorUserId: userId } });
    await tx.supportTicket.deleteMany({
      where: {
        OR: [
          { requesterUserId: userId },
          ...(workspaceIds.length ? [{ workspaceId: { in: workspaceIds } }] : [])
        ]
      }
    });

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
  });

  return { deleted: true, requestId };
}
