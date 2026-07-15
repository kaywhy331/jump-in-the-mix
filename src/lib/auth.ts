import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.sessionDays * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt
    }
  });

  const store = await cookies();
  store.set(env.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(env.cookieName)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(env.cookieName);
}

export async function getCurrentSession() {
  const store = await cookies();
  const token = store.get(env.cookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
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

  return session;
}

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireWorkspace() {
  const session = await requireSession();
  const membership = session.user.memberships[0];
  if (!membership) redirect("/register");
  return {
    session,
    user: session.user,
    membership,
    workspace: membership.workspace
  };
}
