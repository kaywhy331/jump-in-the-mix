import type { IntegrationConnection } from "@/generated/prisma/client";
import { revokeGoogleCredentials } from "@/lib/google-contacts";
import { prisma } from "@/lib/prisma";

type RevocableConnection = Pick<IntegrationConnection, "id" | "provider" | "credentialsCiphertext">;

export type AccountDeletionRevoker = (connection: RevocableConnection) => Promise<void>;

export type AccountDeletionResult = {
  deleted: boolean;
  revocationWarnings: string[];
};

async function revokeImplementedProvider(connection: RevocableConnection): Promise<void> {
  if (connection.provider === "GOOGLE_CONTACTS") await revokeGoogleCredentials(connection);
}

export async function deleteAccountData(
  userId: string,
  revokeProvider: AccountDeletionRevoker = revokeImplementedProvider
): Promise<AccountDeletionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      ownedWorkspaces: { select: { id: true } }
    }
  });
  if (!user) return { deleted: false, revocationWarnings: [] };

  const workspaceIds = user.ownedWorkspaces.map((workspace) => workspace.id);
  const connections = workspaceIds.length
    ? await prisma.integrationConnection.findMany({
        where: { workspaceId: { in: workspaceIds }, credentialsCiphertext: { not: null } },
        select: { id: true, provider: true, credentialsCiphertext: true }
      })
    : [];

  const revocationWarnings: string[] = [];
  for (const connection of connections) {
    try {
      await revokeProvider(connection);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider revocation failed.";
      revocationWarnings.push(`${connection.provider}: ${message}`);
    }
  }

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
      const referralIds = await tx.referral.findMany({
        where: { OR: [{ referrerWorkspaceId: { in: workspaceIds } }, { referredWorkspaceId: { in: workspaceIds } }] },
        select: { id: true }
      });
      await tx.referralReward.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await tx.referral.deleteMany({ where: { id: { in: referralIds.map((referral) => referral.id) } } });
      await tx.referralAccount.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await tx.webhookEvent.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await tx.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    }

    await tx.user.delete({ where: { id: userId } });
  });

  return { deleted: true, revocationWarnings };
}
