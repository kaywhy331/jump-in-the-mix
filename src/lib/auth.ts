import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
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
    await prisma.session.deleteMany({ where: { id: { in: excessSessions.map((item) => item.id) } } });
  }

  const store = await cookies();
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
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  store.delete(env.cookieName);
}

export async function destroyOtherSessions(userId: string, currentSessionId: string): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { userId, id: { not: currentSessionId } } });
  return result.count;
}

export async function destroyAllSessionsForUser(userId: string): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { userId } });
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
            include: {
              workspace: {
                include: { profile: true }
              }
            },
            orderBy: { createdAt: "asc" },
            take: 1
          }
        }
      }
    }
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    store.delete(env.cookieName);
    return null;
  }

  const touchAfterMs = env.sessionTouchMinutes * 60 * 1000;
  if (Date.now() - session.lastSeenAt.getTime() >= touchAfterMs) {
    await prisma.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }

  return session;
}

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireWorkspace() {
  const session = await requireSession();
  if (env.requireEmailVerification && !session.user.emailVerifiedAt) {
    redirect(verificationPath(session.user.email));
  }
  const membership = session.user.memberships[0];
  if (!membership) redirect("/register");
  return {
    session,
    user: session.user,
    membership,
    workspace: membership.workspace
  };
}
