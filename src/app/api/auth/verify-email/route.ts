import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { AUTH_TOKEN_PURPOSES, hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url));
}

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
    return redirectTo(request, "/verify-email/pending?error=Too%20many%20verification%20attempts.%20Try%20again%20later.");
  }
  if (!token) return redirectTo(request, "/verify-email/pending?error=That%20verification%20link%20is%20invalid.");

  const now = new Date();
  const tokenHash = hashAuthToken(token);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const record = await tx.verificationToken.findFirst({
        where: {
          tokenHash,
          purpose: AUTH_TOKEN_PURPOSES.verifyEmail,
          usedAt: null,
          expiresAt: { gt: now }
        }
      });
      if (!record) return null;
      const claim = await tx.verificationToken.updateMany({
        where: { id: record.id, tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now }
      });
      if (claim.count !== 1) return null;
      const verified = await tx.user.update({
        where: { email: record.email },
        data: { emailVerifiedAt: now },
        select: { id: true, email: true }
      });
      return verified;
    });

    if (!user) return redirectTo(request, "/verify-email/pending?error=That%20verification%20link%20is%20invalid%20or%20expired.");
    await createSession(user.id);
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      include: { workspace: { include: { profile: true } } }
    });
    const destination = new URL(membership?.workspace.profile?.onboardingDone ? "/jumps" : "/onboarding", request.url);
    destination.searchParams.set("verified", "1");
    return NextResponse.redirect(destination);
  } catch (error) {
    console.error("Email verification failed", error);
    return redirectTo(request, `/verify-email/pending?error=${encodeURIComponent("That verification link could not be completed. Request a new one.")}`);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
