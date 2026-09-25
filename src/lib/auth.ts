import { customerReturnPath } from "@/lib/customer-return-path";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { supportReadContext } from "@/lib/support-read-audit";
import { redirect } from "next/navigation";
import {
  adminMfaCredentialStatus,
  adminMfaSessionIsVerified,
  clearAdminMfaSession
} from "@/lib/admin-mfa";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { withSignedError } from "@/lib/form-errors";
import { endAdminImpersonationGrant, resolveAdminImpersonationGrant } from "@/lib/impersonation";
import { getRequestMetadata } from "@/lib/request-context";
import { wakeWorkerAfterResponse } from "@/lib/worker-dispatch-after";
import { effectiveAdminPermissions, hasAdminPermission, type AdminPermission } from "@/lib/admin-permissions";
import { firstAdminDestination, safeAdminReturnTo } from "@/lib/admin-navigation";
import { lockAccess } from "@/lib/access-lock";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sliding expiry for the Session row: activity keeps a session alive for another idle period, but no
 * session outlives the absolute cap counted from its creation. The result is never earlier than the
 * current expiry, so a touch can only extend a session or leave it unchanged.
 */
export function nextSessionExpiry({ current, now, createdAt, idleDays, maxDays }: { current: Date; now: Date; createdAt: Date; idleDays: number; maxDays: number }): Date {
  const candidate = Math.min(now.getTime() + idleDays * DAY_MS, createdAt.getTime() + maxDays * DAY_MS);
  return candidate > current.getTime() ? new Date(candidate) : current;
}

function verificationPath(email: string): string {
  return `/verify-email/pending?email=${encodeURIComponent(email)}`;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.sessionDays * DAY_MS);
  const metadata = await getRequestMetadata();
  const store = await cookies();
  const previousToken = store.get(env.cookieName)?.value;

  const session = await prisma.$transaction(async tx => {
    await lockAccess(tx);
    const account = await tx.user.findUnique({ where: { id: userId }, select: { suspendedAt: true } });
    if (!account || account.suspendedAt) redirect(withSignedError("/login", "Account access is unavailable. Contact support for help."));
    // Replace only this browser's previous session. The lock also orders a
    // concurrent device opt-in against account replacement.
    const previousHash = previousToken ? hashSessionToken(previousToken) : null;
    if (previousHash) await tx.$queryRaw`SELECT id FROM "Session" WHERE "tokenHash" = ${previousHash} FOR UPDATE`;
    const previous = previousHash ? await tx.session.findUnique({ where: { tokenHash: previousHash } }) : null;
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
    if (previous) {
      if (previous.userId === userId) {
        await tx.pushSubscription.updateMany({ where: { sessionId: previous.id, userId }, data: { sessionId: created.id } });
      }
      // Other-account subscriptions become unbound through the foreign key.
      await tx.adminMfaSession.deleteMany({ where: { sessionId: previous.id } });
      await tx.session.delete({ where: { id: previous.id } });
    }
    return created;
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

  store.delete(env.impersonationCookieName);
  store.set(env.cookieName, token, {
    httpOnly: true,
    // Lax: sign-in finishes on GET links opened from email and on OAuth callbacks, and a Strict cookie
    // is withheld on the redirect hops of such a cross-site navigation. Every state change is a POST
    // behind the origin check in src/proxy.ts, which Lax still protects.
    sameSite: "lax",
    secure: env.secureSessionCookie,
    path: "/",
    // The browser keeps the cookie for the absolute cap; the Session row (which slides on activity in
    // getCurrentSession) decides whether it is still valid.
    expires: new Date(now.getTime() + env.sessionMaxDays * DAY_MS)
  });

  return session.id;
}

export async function rotateSession(currentSessionId: string, userId: string): Promise<string> {
  const nextSessionId = await createSession(userId);
  await prisma.$transaction([
    prisma.adminMfaSession.deleteMany({ where: { sessionId: currentSessionId } }),
    prisma.session.deleteMany({ where: { id: currentSessionId, userId } })
  ]);
  return nextSessionId;
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

  if (!session || !session.user || session.user.suspendedAt || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.$transaction([
        prisma.adminMfaSession.deleteMany({ where: { sessionId: session.id } }),
        prisma.session.deleteMany({ where: { id: session.id } })
      ]);
    }
    // Server Components can read cookies but cannot mutate the response. Treat stale
    // credentials as signed out; the next auth Server Action overwrites or clears them.
    return null;
  }

  const touchAfterMs = env.sessionTouchMinutes * 60 * 1000;
  const now = new Date();
  if (now.getTime() - session.lastSeenAt.getTime() >= touchAfterMs) {
    const expiresAt = nextSessionExpiry({ current: session.expiresAt, now, createdAt: session.createdAt, idleDays: env.sessionDays, maxDays: env.sessionMaxDays });
    await prisma.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: now, expiresAt } });
    session.expiresAt = expiresAt;
  }

  const authUser = session.user;
  const impersonationToken = store.get(env.impersonationCookieName)?.value;
  if (impersonationToken && (!env.requireAdminMfa || await adminMfaSessionIsVerified(session.id, authUser.id))) {
    const impersonation = await resolveAdminImpersonationGrant(impersonationToken, authUser.id, session.id, supportReadContext(await headers()));
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
          ticketId: impersonation.ticketId,
          reference: impersonation.reference,
          reason: impersonation.reason,
          expiresAt: impersonation.expiresAt
        }
      };
    }
  }

  return { ...session, authUser, impersonation: null };
}

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) {
    const destination = customerReturnPath((await headers()).get("x-jitm-admin-return"));
    redirect(destination ? `/login?next=${encodeURIComponent(destination)}` : "/login");
  }
  return session;
}

export async function requireWorkspace() {
  const session = await requireSession();
  if (!session.impersonation && (env.requireEmailVerification || !env.pilotMode) && !session.user.emailVerifiedAt) {
    redirect(verificationPath(session.user.email));
  }
  const membership = session.user.memberships[0];
  if (!membership) redirect("/register");
  const workspace = membership.workspace;
  if (!session.impersonation) wakeWorkerAfterResponse(workspace.id);
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
  const staff = await prisma.staffMembership.findUnique({ where: { userId: session.authUser.id } });
  if (session.impersonation || !session.authUser.emailVerifiedAt || staff?.status !== "ACTIVE") redirect("/jumps");
  return { session, user: session.authUser, staff, permissions: effectiveAdminPermissions(staff) };
}

export async function requirePlatformAdmin(permission?: AdminPermission | AdminPermission[]) {
  const identity = await requirePlatformAdminIdentity();
  if (env.requireAdminMfa) {
    const [credential, verified] = await Promise.all([
      adminMfaCredentialStatus(identity.user.id),
      adminMfaSessionIsVerified(identity.session.id, identity.user.id)
    ]);
    const returnTo = safeAdminReturnTo((await headers()).get("x-jitm-admin-return"), firstAdminDestination(identity.permissions));
    if (!credential.enabledAt) redirect(`/account/admin-mfa?setup=1&returnTo=${encodeURIComponent(returnTo)}`);
    if (!verified) redirect(`/account/admin-mfa?verify=1&returnTo=${encodeURIComponent(returnTo)}`);
  }
  const required = permission ? (Array.isArray(permission) ? permission : [permission]) : [];
  const denied = required.find(p => !hasAdminPermission(identity.staff, p));
  if (denied) {
    await prisma.platformAuditEvent.create({ data: { actorUserId: identity.user.id, action: "permission.denied", entityType: "AdminPermission", entityId: denied, outcome: "DENIED" } });
    redirect(`/admin/access-denied?capability=${encodeURIComponent(denied)}`);
  }
  return identity;
}
