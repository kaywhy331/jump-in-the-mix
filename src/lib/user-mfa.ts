import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { decryptWithSecret, encryptWithSecret } from "@/lib/integration-crypto";
import { prisma } from "@/lib/prisma";
import { generateTotpSecret, verifyTotpCode } from "@/lib/totp";

const MFA_ISSUER = "Jump in the Mix";
const PENDING_SETUP_MAX_AGE_MS = 30 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;
const VERIFIED_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const USER_MFA_PENDING_COOKIE = "jitm_mfa_pending";

type MfaSecretEnvelope = { secret: string };

export class UserMfaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserMfaError";
  }
}

function requireEncryptionKey(): string {
  if (!env.dataEncryptionKey.trim()) throw new UserMfaError("MFA requires DATA_ENCRYPTION_KEY to be configured.");
  return env.dataEncryptionKey;
}

function encryptedSecret(secret: string): string {
  return encryptWithSecret({ secret } satisfies MfaSecretEnvelope, requireEncryptionKey());
}

function decryptedSecret(ciphertext: string): string {
  const payload = decryptWithSecret<MfaSecretEnvelope>(ciphertext, requireEncryptionKey());
  if (!payload.secret) throw new UserMfaError("The stored MFA secret is unavailable.");
  return payload.secret;
}

function normalizeRecoveryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function recoveryCodeHash(value: string): string {
  return createHmac("sha256", env.authRateLimitSecret).update(normalizeRecoveryCode(value), "utf8").digest("hex");
}

function recoveryHashes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = randomBytes(6).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

export function userMfaOtpAuthUri(email: string, secret: string): string {
  const account = encodeURIComponent(`${MFA_ISSUER}:${email}`);
  const query = new URLSearchParams({ secret, issuer: MFA_ISSUER, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${account}?${query.toString()}`;
}

export async function prepareUserMfaEnrollment(userId: string): Promise<{ secret: string }> {
  const existing = await prisma.userMfaCredential.findUnique({ where: { userId } });
  if (existing?.enabledAt) throw new UserMfaError("MFA is already enabled.");
  if (existing && Date.now() - existing.updatedAt.getTime() <= PENDING_SETUP_MAX_AGE_MS) {
    return { secret: decryptedSecret(existing.secretCiphertext) };
  }
  const secret = generateTotpSecret();
  await prisma.userMfaCredential.upsert({
    where: { userId },
    create: { userId, secretCiphertext: encryptedSecret(secret), recoveryCodeHashes: [] },
    update: { secretCiphertext: encryptedSecret(secret), recoveryCodeHashes: [], enabledAt: null, lastUsedStep: null }
  });
  return { secret };
}

export async function enableUserMfaCredential(userId: string, code: string): Promise<string[]> {
  const credential = await prisma.userMfaCredential.findUnique({ where: { userId } });
  if (!credential || credential.enabledAt) throw new UserMfaError("Start MFA setup again.");
  const counter = verifyTotpCode(decryptedSecret(credential.secretCiphertext), code, {
    lastUsedCounter: credential.lastUsedStep === null ? null : Number(credential.lastUsedStep)
  });
  if (counter === null) throw new UserMfaError("The authenticator code was not accepted. Check the device time and try again.");
  const recoveryCodes = generateRecoveryCodes();
  const claim = await prisma.userMfaCredential.updateMany({
    where: { userId, enabledAt: null, updatedAt: credential.updatedAt },
    data: { enabledAt: new Date(), lastUsedStep: BigInt(counter), recoveryCodeHashes: recoveryCodes.map(recoveryCodeHash) }
  });
  if (claim.count !== 1) throw new UserMfaError("MFA setup changed in another session. Reload and try again.");
  return recoveryCodes;
}

export async function consumeUserMfaCode(userId: string, code: string): Promise<"totp" | "recovery"> {
  const credential = await prisma.userMfaCredential.findUnique({ where: { userId } });
  if (!credential?.enabledAt) throw new UserMfaError("MFA has not been enabled.");
  const normalized = code.trim();
  if (/^\d{6}$/.test(normalized)) {
    const lastUsedCounter = credential.lastUsedStep === null ? null : Number(credential.lastUsedStep);
    const counter = verifyTotpCode(decryptedSecret(credential.secretCiphertext), normalized, { lastUsedCounter });
    if (counter === null) throw new UserMfaError("The verification code was not accepted.");
    const claim = await prisma.userMfaCredential.updateMany({
      where: { userId, enabledAt: { not: null }, lastUsedStep: credential.lastUsedStep },
      data: { lastUsedStep: BigInt(counter) }
    });
    if (claim.count !== 1) throw new UserMfaError("That verification code was already used.");
    return "totp";
  }
  const hash = recoveryCodeHash(normalized);
  const currentHashes = recoveryHashes(credential.recoveryCodeHashes);
  if (!currentHashes.includes(hash)) throw new UserMfaError("The recovery code was not accepted.");
  const remaining = currentHashes.filter((item) => item !== hash);
  const claim = await prisma.userMfaCredential.updateMany({
    where: { userId, enabledAt: { not: null }, updatedAt: credential.updatedAt },
    data: { recoveryCodeHashes: remaining }
  });
  if (claim.count !== 1) throw new UserMfaError("That recovery code was already used.");
  return "recovery";
}

export async function markUserMfaSessionVerified(sessionId: string, userId: string): Promise<void> {
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId, expiresAt: { gt: new Date() } }, select: { expiresAt: true } });
  if (!session) throw new UserMfaError("The sign-in session expired. Sign in again.");
  const now = new Date();
  const expiresAt = new Date(Math.min(session.expiresAt.getTime(), now.getTime() + VERIFIED_SESSION_MAX_AGE_MS));
  const result = await prisma.userMfaSession.updateMany({
    where: { sessionId, userId, verifiedAt: null, expiresAt: { gt: now } },
    data: { verifiedAt: now, expiresAt }
  });
  if (result.count !== 1) throw new UserMfaError("The MFA challenge is no longer available. Sign in again.");
  const store = await cookies();
  const token = store.get(env.cookieName)?.value;
  if (token) {
    store.set(env.cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: session.expiresAt
    });
  }
  store.delete(USER_MFA_PENDING_COOKIE);
}

export async function markCurrentSessionVerifiedAfterEnrollment(sessionId: string, userId: string): Promise<void> {
  await prisma.userMfaSession.upsert({
    where: { sessionId },
    create: { sessionId, userId, verifiedAt: new Date(), expiresAt: new Date(Date.now() + VERIFIED_SESSION_MAX_AGE_MS) },
    update: { userId, verifiedAt: new Date(), expiresAt: new Date(Date.now() + VERIFIED_SESSION_MAX_AGE_MS) }
  });
  (await cookies()).delete(USER_MFA_PENDING_COOKIE);
}

export async function disableUserMfa(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.userMfaSession.deleteMany({ where: { userId } }),
    prisma.userMfaCredential.deleteMany({ where: { userId } })
  ]);
  (await cookies()).delete(USER_MFA_PENDING_COOKIE);
}

export async function userMfaCredentialStatus(userId: string) {
  const credential = await prisma.userMfaCredential.findUnique({ where: { userId }, select: { enabledAt: true, recoveryCodeHashes: true } });
  return {
    enabledAt: credential?.enabledAt ?? null,
    recoveryCodesRemaining: recoveryHashes(credential?.recoveryCodeHashes).length
  };
}
