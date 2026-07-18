import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const AUTH_TOKEN_PURPOSES = {
  verifyEmail: "verify_email",
  resetPassword: "reset_password"
} as const;

export type AuthTokenPurpose = typeof AUTH_TOKEN_PURPOSES[keyof typeof AUTH_TOKEN_PURPOSES];

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
