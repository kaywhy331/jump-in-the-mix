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
import { reconcileWorkspaceReferralEntitlement } from "@/lib/referral-service";
import { getRequestMetadata } from "@/lib/request-context";

export const USER_MFA_PENDING_COOKIE = "jitm_mfa_pending";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function verificationPath(email: string): string {
  return `/verify-email/pending?email=${encodeURIComponent(email)}`;
}

function prioritizeMemberships<T extends { workspaceId: string }>(memberships: T[], activeWorkspaceId: string | null | undefined): T[] {
  if (!activeWorkspaceId) return memberships;
  const active = memberships.find((membership) => membership.workspaceId === activeWorkspaceId);
  return active ? [active, ...memberships.filter((membership) => membership.workspaceId !== activeWorkspaceId)] : memberships;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.sessionDays * 24 * 60 * 60 * 1000);
  const metadata = await getRequestMetadata();

  const [session, userMfa] = await prisma.$transaction(async (tx) => {
    const created = await tx.session.create({
      data: {
        userId,
        tokenHash: hashSessionToken(token),
        expiresAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        lastSeenAt: new Date()
      }
    });
    const credential = await tx.userMfaCredential.findUnique({ where: { userId }, select: { enabledAt: true } });
    if (credential?.enabledAt) {
      await tx.userMfaSession.create({
        data: {
          sessionId: created.id,
          userId,
          verifiedAt: null,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      });
    }
    return [created, Boolean(credential?.enabledAt)] as const;
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
      prisma.userMfaSession.deleteMany({ where: { sessionId: { in: sessionIds } } }),
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
    expires: userMfa ? new Date(Date.now() + 10 * 60 * 1000) : expiresAt
  });
  if (userMfa) {
    store.set(USER_MFA_PENDING_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60
    });
  } else {
    store.delete(USER_MFA_PENDING_COOKIE);
  }

  return session.id;
}

export async function sessionRequiresUserMfa(sessionId: string): Promise<boolean> {
  const challenge = await prisma.userMfaSession.findUnique({ where: { sessionId }, select: { verifiedAt: true, expiresAt: true } });
  return Boolean(challenge && !challenge.verifiedAt && challenge.expiresAt > new Date());
}

export async function getPendingUserMfaSession() {
  const store = await cookies();
  const token = store.get(env.cookieName)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true }
  });
  if (!session || session.expiresAt <= new Date()) return null;
  const challenge = await prisma.userMfaSession.findUnique({ where: { sessionId: session.id } });
  if (!challenge || challenge.verifiedAt || challenge.expiresAt <= new Date()) return null;
  return { session, user: session.user, challenge };
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
  store.delete(USER_MFA_PENDING_COOKIE);
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
  const [, , result] = await prisma.$transaction([
    prisma.adminMfaSession.deleteMany({ where: { sessionId: { in: sessionIds } } }),
    prisma.userMfaSession.deleteMany({ where: { sessionId: { in: sessionIds } } }),
    prisma.session.deleteMany({ where: { userId, id: { in: sessionIds } } })
  ]);
  return result.count;
}

export async function destroyAllSessionsForUser(userId: string): Promise<number> {
  const [, , result] = await prisma.$transaction([
    prisma.adminMfaSession.deleteMany({ where: { userId } }),
    prisma.userMfaSession.deleteMany({ where: { userId } }),
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
            orderBy: { createdAt: "asc" }
          }
        }
      }
    }
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.$transaction([
        prisma.adminMfaSession.deleteMany({ where: { sessionId: session.id } }),
        prisma.userMfaSession.deleteMany({ where: { sessionId: session.id } }),
        prisma.session.delete({ where: { id: session.id } })
      ]);
    }
    store.delete(USER_MFA_PENDING_COOKIE);
    store.delete(env.impersonationCookieName);
    store.delete(env.cookieName);
    return null;
  }

  const [preference, userMfaSession] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId: session.userId }, select: { activeWorkspaceId: true } }),
    prisma.userMfaSession.findUnique({ where: { sessionId: session.id }, select: { verifiedAt: true, expiresAt: true } })
  ]);
  if (userMfaSession && (!userMfaSession.verifiedAt || userMfaSession.expiresAt <= new Date())) return null;

  const touchAfterMs = env.sessionTouchMinutes * 60 * 1000;
  if (Date.now() - session.lastSeenAt.getTime() >= touchAfterMs) {
    await prisma.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }

  const authUser = {
    ...session.user,
    memberships: prioritizeMemberships(session.user.memberships, preference?.activeWorkspaceId)
  };
  const impersonationToken = store.get(env.impersonationCookieName)?.value;
  if (impersonationToken && authUser.isPlatformAdmin) {
    const impersonation = await resolveAdminImpersonationGrant(impersonationToken, authUser.id);
    if (impersonation) {
      const targetUser = {
        ...impersonation.targetUser,
        memberships: prioritizeMemberships(impersonation.targetUser.memberships, impersonation.workspaceId)
      };
      return {
        ...session,
        authUser,
        user: targetUser,
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

  return { ...session, user: authUser, authUser, impersonation: null };
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
  let workspace = membership.workspace;
  if (!session.impersonation && workspace.planTier === "PLUS" && !workspace.stripeSubscriptionId) {
    const reconciled = await reconcileWorkspaceReferralEntitlement(workspace.id);
    if (reconciled) workspace = { ...workspace, ...reconciled, profile: workspace.profile };
  }
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
