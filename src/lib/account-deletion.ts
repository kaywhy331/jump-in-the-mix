import { createHash, randomUUID } from "node:crypto";
import type { AccountDeletionRevocation, IntegrationConnection } from "@/generated/prisma/client";
import { revokeGoogleCredentials } from "@/lib/google-contacts";
import { prisma } from "@/lib/prisma";

type RevocableConnection = Pick<IntegrationConnection, "id" | "provider" | "credentialsCiphertext">;

export type AccountDeletionRevoker = (connection: RevocableConnection) => Promise<void>;

export type AccountDeletionResult = {
  deleted: boolean;
  requestId?: string;
  revocationWarnings: string[];
};

async function revokeImplementedProvider(connection: RevocableConnection): Promise<void> {
  if (connection.provider === "GOOGLE_CONTACTS") await revokeGoogleCredentials(connection);
}

function subjectHash(userId: string): string {
  return createHash("sha256").update(`account-deletion:${userId}`).digest("hex");
}

function connectionFingerprint(connection: RevocableConnection): string {
  return createHash("sha256").update(`${connection.provider}:${connection.id}`).digest("hex");
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Provider revocation failed.").slice(0, 500);
}

async function attemptPersistedRevocation(
  revocation: Pick<AccountDeletionRevocation, "id" | "provider" | "credentialsCiphertext" | "attempts">,
  revokeProvider: AccountDeletionRevoker
): Promise<string | null> {
  try {
    await revokeProvider({ id: revocation.id, provider: revocation.provider, credentialsCiphertext: revocation.credentialsCiphertext });
    await prisma.accountDeletionRevocation.deleteMany({ where: { id: revocation.id } });
    return null;
  } catch (error) {
    const message = safeError(error);
    const attempts = revocation.attempts + 1;
    await prisma.accountDeletionRevocation.update({
      where: { id: revocation.id },
      data: {
        status: "RETRY_PENDING",
        attempts,
        lastError: message,
        nextAttemptAt: new Date(Date.now() + Math.min(24 * 60 * 60_000, 2 ** attempts * 60_000))
      }
    });
    return `${revocation.provider}: ${message}`;
  }
}

export async function retryPendingAccountDeletionRevocations(
  revokeProvider: AccountDeletionRevoker = revokeImplementedProvider,
  now = new Date()
): Promise<{ completed: number; pending: number }> {
  const pending = await prisma.accountDeletionRevocation.findMany({
    where: { status: "RETRY_PENDING", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: 20
  });
  let completed = 0;
  for (const revocation of pending) {
    if ((await attemptPersistedRevocation(revocation, revokeProvider)) === null) completed += 1;
  }
  return { completed, pending: pending.length - completed };
}

export async function deleteAccountData(
  userId: string,
  revokeProvider: AccountDeletionRevoker = revokeImplementedProvider,
  requestId: string = randomUUID()
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

  await prisma.accountDeletionAudit.upsert({
    where: { requestId },
    create: { requestId, subjectHash: subjectHash(userId), status: "STARTED" },
    update: {}
  });

  const pendingRevocations = [];
  for (const connection of connections) {
    pendingRevocations.push(await prisma.accountDeletionRevocation.upsert({
      where: {
        requestId_connectionFingerprint: { requestId, connectionFingerprint: connectionFingerprint(connection) }
      },
      create: {
        requestId,
        connectionFingerprint: connectionFingerprint(connection),
        provider: connection.provider,
        credentialsCiphertext: connection.credentialsCiphertext!
      },
      update: {}
    }));
  }

  const revocationWarnings: string[] = [];
  for (const revocation of pendingRevocations) {
    const warning = await attemptPersistedRevocation(revocation, revokeProvider);
    if (warning) revocationWarnings.push(warning);
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
    await tx.accountDeletionAudit.update({
      where: { requestId },
      data: {
        status: revocationWarnings.length ? "DELETED_REVOCATION_PENDING" : "COMPLETED",
        completedAt: new Date(),
        metadata: { ownedWorkspaceCount: workspaceIds.length, pendingRevocationCount: revocationWarnings.length }
      }
    });
  });

  return { deleted: true, requestId, revocationWarnings };
}
