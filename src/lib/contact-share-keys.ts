import { randomBytes } from "node:crypto";
import { hashConnectionToken } from "@/lib/connection-tokens";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/** 32 random bytes, base64url: the same shape as a lead connection key. */
export const CONTACT_SHARE_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Makes the owner's key for adding contacts shared from their phone and returns it once. A new key
 * replaces the earlier one, so a lost phone's shortcut stops working. Only the hash is kept.
 */
export async function replaceContactShareKey(workspaceId: string, userId: string): Promise<string> {
  const key = randomBytes(32).toString("base64url");
  const tokenHash = hashConnectionToken(key);
  await prisma.contactShareKey.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    create: { workspaceId, userId, tokenHash },
    update: { tokenHash, createdAt: new Date(), lastUsedAt: null }
  });
  return key;
}

export async function removeContactShareKey(workspaceId: string, userId: string): Promise<void> {
  await prisma.contactShareKey.deleteMany({ where: { workspaceId, userId } });
}

export async function contactShareKeyStatus(workspaceId: string, userId: string) {
  return prisma.contactShareKey.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { createdAt: true, lastUsedAt: true }
  });
}

/**
 * The account behind a key, or null. A key works only while its user still owns the workspace, is not
 * suspended and has a verified email where sign-in requires one, which is when Quick Add works too.
 */
export async function resolveContactShareKey(key: string): Promise<{ keyId: string; workspaceId: string; userId: string } | null> {
  if (!CONTACT_SHARE_KEY_PATTERN.test(key)) return null;
  const found = await prisma.contactShareKey.findUnique({
    where: { tokenHash: hashConnectionToken(key) },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      user: { select: { suspendedAt: true, emailVerifiedAt: true } },
      workspace: { select: { ownerId: true } }
    }
  });
  if (!found || found.user.suspendedAt || found.workspace.ownerId !== found.userId) return null;
  if ((env.requireEmailVerification || !env.pilotMode) && !found.user.emailVerifiedAt) return null;
  return { keyId: found.id, workspaceId: found.workspaceId, userId: found.userId };
}
