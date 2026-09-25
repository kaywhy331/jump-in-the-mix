import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const AUTH_TOKEN_PURPOSES = {
  verifyEmail: "verify_email",
  resetPassword: "reset_password",
  magicLogin: "magic_login",
  waitlist: "waitlist",
  invitationOptout: "invitation_optout"
} as const;

export type AuthTokenPurpose = typeof AUTH_TOKEN_PURPOSES[keyof typeof AUTH_TOKEN_PURPOSES];

/** The links that open or recover an account, as opposed to waitlist and invitation-email links. */
export const ACCOUNT_TOKEN_PURPOSES: AuthTokenPurpose[] = [AUTH_TOKEN_PURPOSES.verifyEmail, AUTH_TOKEN_PURPOSES.resetPassword, AUTH_TOKEN_PURPOSES.magicLogin];

/*
 * Spent and replaced links stay for a day (they can never be used again) so the per-address daily limits
 * can match each link to its entry in the email send ledger (email-budget.ts: authEmailsSentToday).
 */
export const ISSUED_TOKEN_MEMORY_MS = 24 * 60 * 60 * 1000;

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function issueAuthToken(email: string, purpose: AuthTokenPurpose, ttlMs: number): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashAuthToken(rawToken);
  const now = new Date();

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({
      where: {
        email: normalizedEmail,
        purpose,
        createdAt: { lte: new Date(now.getTime() - ISSUED_TOKEN_MEMORY_MS) },
        OR: [{ usedAt: { not: null } }, { expiresAt: { lte: now } }]
      }
    }),
    prisma.verificationToken.updateMany({
      where: { email: normalizedEmail, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    }),
    prisma.verificationToken.create({
      data: {
        email: normalizedEmail,
        tokenHash,
        purpose,
        expiresAt: new Date(now.getTime() + ttlMs)
      }
    })
  ]);

  return rawToken;
}

export async function findUsableAuthToken(token: string, purpose: AuthTokenPurpose) {
  if (!token) return null;
  return prisma.verificationToken.findFirst({
    where: {
      tokenHash: hashAuthToken(token),
      purpose,
      usedAt: null,
      expiresAt: { gt: new Date() }
    }
  });
}

/**
 * Ends every outstanding link for an address (all purposes, or the listed ones) in the caller's
 * transaction. Links belong to an address, not an account, so an address that stops belonging to an
 * account must not keep a working sign-in, reset or verification link.
 */
export async function invalidateAuthTokens(tx: Prisma.TransactionClient, email: string, purposes: AuthTokenPurpose[] | "all", now = new Date()): Promise<number> {
  const result = await tx.verificationToken.updateMany({
    where: { email: email.trim().toLowerCase(), usedAt: null, ...(purposes === "all" ? {} : { purpose: { in: purposes } }) },
    data: { usedAt: now }
  });
  return result.count;
}
