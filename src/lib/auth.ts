import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminMfaCredentialStatus,
  adminMfaSessionIsVerified,
  clearAdminMfaSession
} from "@/lib/admin-mfa";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { endAdminImpersonationGrant, resolveAdminImpersonationGrant } from "@/lib/impersonation";
import { getRequestMetadata } from "@/lib/request-context";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function verificationPath(email: string): string {
  return `/verify-email/pending?email=${encodeURIComponent(email)}`;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.sessionDays * 24 * 60 * 60 * 1000);
  const metadata = await getRequestMetadata();

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      lastSeenAt: new Date()
    }
  });

  const excessSessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: env.maxSessionsPerUser,
    select: { id: true }
  });
  if (excessSessions.length) {
    const sessionIds = excessSessions.map((item) => item.id);
    await prisma.$transaction([
      prisma.adminMfaSession.deleteMany({ where: { sessionId: { in: sessionIds } } }),
      prisma.session.deleteMany({ where: { id: { in: sessionIds } } })
    ]);
  }

  const store = await cookies();
  store.delete(env.impersonationCookieName);
  store.set(env.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });

  return session.id;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(env.cookieName)?.value;
  const impersonationToken = store.get(env.impersonationCookieName)?.value;
  const session = token
    ? await prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) }, select: { id: true, userId: true } })
    : null;

  if (impersonationToken && session) {
    await endAdminImpersonationGrant(impersonationToken, session.userId).catch(() => false);
  }
  if (token) {
    if (session) await clearAdminMfaSession(session.id);
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  store.delete(env.impersonationCookieName);
  store.delete(env.cookieName);
}

export async function destroyOtherSessions(userId: string, currentSessionId: string): Promise<number> {
  const sessions = await prisma.session.findMany({
    where: { userId, id: { not: currentSessionId } },
    select: { id: true }
  });
  if (!sessions.length) return 0;
  const sessionIds = sessions.map((item) => item.id);
  const [, result] = await prisma.$transaction([
    prisma.adminMfaSession.deleteMany({ where: { sessionId: { in: sessionIds } } }),
    prisma.session.deleteMany({ where: { userId, id: { in: sessionIds } } })
  ]);
  return result.count;
}

export async function destroyAllSessionsForUser(userId: string): Promise<number> {
  const [, result] = await prisma.$transaction([
    prisma.adminMfaSession.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } })
  ]);
  return result.count;
}

export async function getCurrentSession() {
  const store = await cookies();
  const token = store.get(env.cookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { workspace: { include: { profile: true } } },
            orderBy: { createdAt: "asc" },
            take: 1
          }
        }
      }
    }
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.$transaction([
        prisma.adminMfaSession.deleteMany({ where: { sessionId: session.id } }),
        prisma.session.delete({ where: { id: session.id } })
      ]);
    }
    store.delete(env.impersonationCookieName);
    store.delete(env.cookieName);
    return null;
  }

  const touchAfterMs = env.sessionTouchMinutes * 60 * 1000;
  if (Date.now() - session.lastSeenAt.getTime() >= touchAfterMs) {
    await prisma.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }

  const authUser = session.user;
  const impersonationToken = store.get(env.impersonationCookieName)?.value;
  if (impersonationToken && authUser.isPlatformAdmin) {
    const impersonation = await resolveAdminImpersonationGrant(impersonationToken, authUser.id);
    if (impersonation) {
      return {
        ...session,
        authUser,
        user: impersonation.targetUser,
        impersonation: {
          id: impersonation.id,
          actorUserId: impersonation.actorUserId,
          targetUserId: impersonation.targetUserId,
          workspaceId: impersonation.workspaceId,
          reason: impersonation.reason,
          expiresAt: impersonation.expiresAt
        }
      };
    }
    store.delete(env.impersonationCookieName);
  } else if (impersonationToken) {
    store.delete(env.impersonationCookieName);
  }

  return { ...session, authUser, impersonation: null };
}

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireWorkspace() {
  const session = await requireSession();
  if (!session.impersonation && env.requireEmailVerification && !session.user.emailVerifiedAt) {
    redirect(verificationPath(session.user.email));
  }
  const membership = session.user.memberships[0];
  if (!membership) redirect("/register");
  const workspace = membership.workspace;
  return {
    session,
    actorUser: session.authUser,
    user: session.user,
    membership,
    workspace,
    impersonation: session.impersonation
  };
}

export async function requirePlatformAdminIdentity() {
  const session = await requireSession();
  if (session.impersonation || !session.authUser.isPlatformAdmin) redirect("/jumps");
  return { session, user: session.authUser };
}

export async function requirePlatformAdmin() {
  const identity = await requirePlatformAdminIdentity();
  if (env.requireAdminMfa) {
    const [credential, verified] = await Promise.all([
      adminMfaCredentialStatus(identity.user.id),
      adminMfaSessionIsVerified(identity.session.id, identity.user.id)
    ]);
    if (!credential.enabledAt) redirect("/account/admin-mfa?setup=1&returnTo=%2Fadmin");
    if (!verified) redirect("/account/admin-mfa?verify=1&returnTo=%2Fadmin");
  }
  return identity;
}
