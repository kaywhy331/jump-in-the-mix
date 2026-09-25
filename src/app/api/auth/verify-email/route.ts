import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { AUTH_TOKEN_PURPOSES, hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { withSignedError } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, env.appUrl));
}

// Presence only: a stale cookie still lands on /jumps, which sends the person to sign in.
function hasSessionCookie(request: Request): boolean {
  const prefix = `${env.cookieName}=`;
  return (request.headers.get("cookie") ?? "").split(";").some((part) => {
    const cookie = part.trim();
    return cookie.startsWith(prefix) && cookie.length > prefix.length;
  });
}

type Outcome =
  | { status: "verified"; user: { id: string; email: string } }
  | { status: "already-verified" }
  | { status: "invalid" };

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const metadata = await getRequestMetadata();
  const decision = await consumeRateLimit({
    scope: "auth.verify.consume.ip",
    identifiers: [metadata.ipAddress],
    limit: 30,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000
  });
  if (!decision.allowed) {
    return redirectTo(request, withSignedError("/verify-email/pending", "Too many verification attempts. Try again later."));
  }
  if (!token) return redirectTo(request, withSignedError("/verify-email/pending", "That verification link is invalid."));

  const now = new Date();
  const tokenHash = hashAuthToken(token);
  try {
    const outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
      const record = await tx.verificationToken.findFirst({
        where: {
          tokenHash,
          purpose: AUTH_TOKEN_PURPOSES.verifyEmail,
          usedAt: null,
          expiresAt: { gt: now }
        }
      });
      if (!record) {
        // A link that was already opened (a mail scanner, a second tap) or that lapsed after a newer
        // one was used still belongs to a verified account. Say so instead of reporting an error.
        const spent = await tx.verificationToken.findUnique({ where: { tokenHash }, select: { email: true, purpose: true } });
        if (spent?.purpose !== AUTH_TOKEN_PURPOSES.verifyEmail) return { status: "invalid" };
        const account = await tx.user.findUnique({ where: { email: spent.email }, select: { emailVerifiedAt: true } });
        return account?.emailVerifiedAt ? { status: "already-verified" } : { status: "invalid" };
      }
      const claim = await tx.verificationToken.updateMany({
        where: { id: record.id, tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now }
      });
      if (claim.count !== 1) return { status: "invalid" };
      const verified = await tx.user.update({
        where: { email: record.email },
        data: { emailVerifiedAt: now },
        select: { id: true, email: true }
      });
      return { status: "verified", user: verified };
    });

    if (outcome.status === "already-verified") return redirectTo(request, hasSessionCookie(request) ? "/jumps?verified=1" : "/login?verified=1");
    if (outcome.status === "invalid") return redirectTo(request, withSignedError("/verify-email/pending", "That verification link is invalid or expired."));
    await createSession(outcome.user.id);
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: outcome.user.id },
      include: { workspace: { include: { profile: true } } }
    });
    const destination = new URL(membership?.workspace.profile?.onboardingDone ? "/jumps" : "/onboarding", env.appUrl);
    destination.searchParams.set("verified", "1");
    return NextResponse.redirect(destination);
  } catch (error) {
    console.error("Email verification failed", error);
    return redirectTo(request, withSignedError("/verify-email/pending", "That verification link could not be completed. Request a new one."));
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
