import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export function hashImpersonationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizedReason(reason: string): string {
  const value = reason.trim().replace(/\s+/g, " ");
  if (value.length < 10) throw new Error("Add a brief support reason with at least 10 characters.");
  if (value.length > 500) throw new Error("Keep the support reason under 500 characters.");
  return value;
}

export async function createAdminImpersonationGrant(input: {
  actorUserId: string;
  targetUserId: string;
  workspaceId: string;
  reason: string;
}) {
  const reason = normalizedReason(input.reason);
  if (input.actorUserId === input.targetUserId) throw new Error("Choose another user to view.");

  const [actor, targetMembership] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.actorUserId }, select: { id: true, isPlatformAdmin: true } }),
    prisma.workspaceMember.findFirst({
      where: { userId: input.targetUserId, workspaceId: input.workspaceId },
      select: { id: true, userId: true, workspaceId: true }
    })
  ]);
  if (!actor?.isPlatformAdmin) throw new Error("Platform administrator access is required.");
  if (!targetMembership) throw new Error("The selected user does not belong to that workspace.");

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashImpersonationToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.impersonationMinutes * 60 * 1000);

  const grant = await prisma.$transaction(async (tx) => {
    await tx.adminImpersonation.updateMany({
      where: { actorUserId: actor.id, endedAt: null, expiresAt: { gt: now } },
      data: { endedAt: now }
    });
    const created = await tx.adminImpersonation.create({
      data: {
        tokenHash,
        actorUserId: actor.id,
        targetUserId: targetMembership.userId,
        workspaceId: targetMembership.workspaceId,
        reason,
        expiresAt,
        lastSeenAt: now
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: targetMembership.workspaceId,
        actorType: "ADMIN",
        actorUserId: actor.id,
        action: "admin.impersonation.start",
        entityType: "User",
        entityId: targetMembership.userId,
        source: "admin.users",
        metadata: { impersonationId: created.id, reason, expiresAt: expiresAt.toISOString(), mode: "VIEW_ONLY" }
      }
    });
    return created;
  });

  return { rawToken, grant };
}

export async function resolveAdminImpersonationGrant(rawToken: string, actorUserId: string) {
  if (!rawToken) return null;
  const now = new Date();
  const grant = await prisma.adminImpersonation.findUnique({
    where: { tokenHash: hashImpersonationToken(rawToken) }
  });
  if (!grant || grant.actorUserId !== actorUserId || grant.endedAt || grant.expiresAt <= now) return null;

  const targetUser = await prisma.user.findUnique({
    where: { id: grant.targetUserId },
    include: {
      memberships: {
        where: { workspaceId: grant.workspaceId },
        include: { workspace: { include: { profile: true } } },
        take: 1
      }
    }
  });
  if (!targetUser?.memberships[0]) return null;

  const touchAfterMs = env.impersonationTouchMinutes * 60 * 1000;
  if (Date.now() - grant.lastSeenAt.getTime() >= touchAfterMs) {
    await prisma.adminImpersonation.updateMany({
      where: { id: grant.id, endedAt: null },
      data: { lastSeenAt: now }
    });
  }

  return {
    id: grant.id,
    actorUserId: grant.actorUserId,
    targetUserId: grant.targetUserId,
    workspaceId: grant.workspaceId,
    reason: grant.reason,
    expiresAt: grant.expiresAt,
    targetUser
  };
}

export async function endAdminImpersonationGrant(rawToken: string, actorUserId: string): Promise<boolean> {
  if (!rawToken) return false;
  const tokenHash = hashImpersonationToken(rawToken);
  const grant = await prisma.adminImpersonation.findFirst({
    where: { tokenHash, actorUserId, endedAt: null },
    select: { id: true, workspaceId: true, targetUserId: true, reason: true }
  });
  if (!grant) return false;

  const endedAt = new Date();
  await prisma.$transaction([
    prisma.adminImpersonation.update({ where: { id: grant.id }, data: { endedAt } }),
    prisma.auditLog.create({
      data: {
        workspaceId: grant.workspaceId,
        actorType: "ADMIN",
        actorUserId,
        action: "admin.impersonation.end",
        entityType: "User",
        entityId: grant.targetUserId,
        source: "admin.impersonation",
        metadata: { impersonationId: grant.id, reason: grant.reason, endedAt: endedAt.toISOString(), mode: "VIEW_ONLY" }
      }
    })
  ]);
  return true;
}

export function impersonationCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  };
}