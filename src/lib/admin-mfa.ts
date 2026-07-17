import { createHmac, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { decryptWithSecret, encryptWithSecret } from "@/lib/integration-crypto";
import { prisma } from "@/lib/prisma";
import { generateTotpSecret, verifyTotpCode } from "@/lib/totp";

const MFA_ISSUER = "Jump in the Mix";
const PENDING_SETUP_MAX_AGE_MS = 30 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;

type MfaSecretEnvelope = { secret: string };

export class AdminMfaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminMfaError";
  }
}

function requireEncryptionKey(): string {
  if (!env.dataEncryptionKey.trim()) {
    throw new AdminMfaError("Administrator MFA requires DATA_ENCRYPTION_KEY to be configured.");
  }
  return env.dataEncryptionKey;
}

function encryptedSecret(secret: string): string {
  return encryptWithSecret({ secret } satisfies MfaSecretEnvelope, requireEncryptionKey());
}

function decryptedSecret(ciphertext: string): string {
  const payload = decryptWithSecret<MfaSecretEnvelope>(ciphertext, requireEncryptionKey());
  if (!payload.secret) throw new AdminMfaError("The stored administrator MFA secret is unavailable.");
  return payload.secret;
}

function normalizeRecoveryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function recoveryCodeHash(value: string): string {
  return createHmac("sha256", env.authRateLimitSecret)
    .update(normalizeRecoveryCode(value), "utf8")
    .digest("hex");
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = randomBytes(6).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

export function adminMfaOtpAuthUri(email: string, secret: string): string {
  const account = encodeURIComponent(`${MFA_ISSUER}:${email}`);
  const query = new URLSearchParams({ secret, issuer: MFA_ISSUER, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${account}?${query.toString()}`;
}

export async function prepareAdminMfaEnrollment(userId: string): Promise<{ secret: string }> {
  const existing = await prisma.adminMfaCredential.findUnique({ where: { userId } });
  if (existing?.enabledAt) throw new AdminMfaError("Administrator MFA is already enabled.");

  if (existing && Date.now() - existing.updatedAt.getTime() <= PENDING_SETUP_MAX_AGE_MS) {
    return { secret: decryptedSecret(existing.secretCiphertext) };
  }

  const secret = generateTotpSecret();
  await prisma.adminMfaCredential.upsert({
    where: { userId },
    create: { userId, secretCiphertext: encryptedSecret(secret) },
    update: {
      secretCiphertext: encryptedSecret(secret),
      recoveryCodeHashes: [],
      enabledAt: null,
      lastUsedCounter: null
    }
  });
  return { secret };
}

export async function enableAdminMfaCredential(userId: string, code: string): Promise<string[]> {
  const credential = await prisma.adminMfaCredential.findUnique({ where: { userId } });
  if (!credential || credential.enabledAt) throw new AdminMfaError("Start administrator MFA setup again.");
  const secret = decryptedSecret(credential.secretCiphertext);
  const counter = verifyTotpCode(secret, code, { lastUsedCounter: credential.lastUsedCounter });
  if (counter === null) throw new AdminMfaError("The authenticator code was not accepted. Check the device time and try again.");

  const recoveryCodes = generateRecoveryCodes();
  const enabledAt = new Date();
  const claim = await prisma.adminMfaCredential.updateMany({
    where: { userId, enabledAt: null, updatedAt: credential.updatedAt },
    data: {
      enabledAt,
      lastUsedCounter: counter,
      recoveryCodeHashes: recoveryCodes.map(recoveryCodeHash)
    }
  });
  if (claim.count !== 1) throw new AdminMfaError("Administrator MFA setup changed in another session. Reload and try again.");
  return recoveryCodes;
}

export async function consumeAdminMfaCode(userId: string, code: string): Promise<"totp" | "recovery"> {
  const credential = await prisma.adminMfaCredential.findUnique({ where: { userId } });
  if (!credential?.enabledAt) throw new AdminMfaError("Administrator MFA has not been enabled.");

  const normalized = code.trim();
  if (/^\d{6}$/.test(normalized)) {
    const counter = verifyTotpCode(decryptedSecret(credential.secretCiphertext), normalized, {
      lastUsedCounter: credential.lastUsedCounter
    });
    if (counter === null) throw new AdminMfaError("The administrator verification code was not accepted.");
    const claim = await prisma.adminMfaCredential.updateMany({
      where: {
        userId,
        enabledAt: { not: null },
        lastUsedCounter: credential.lastUsedCounter
      },
      data: { lastUsedCounter: counter }
    });
    if (claim.count !== 1) throw new AdminMfaError("That administrator verification code was already used.");
    return "totp";
  }

  const hash = recoveryCodeHash(normalized);
  if (!credential.recoveryCodeHashes.includes(hash)) throw new AdminMfaError("The administrator recovery code was not accepted.");
  const remaining = credential.recoveryCodeHashes.filter((item) => item !== hash);
  const claim = await prisma.adminMfaCredential.updateMany({
    where: { userId, enabledAt: { not: null }, recoveryCodeHashes: { has: hash } },
    data: { recoveryCodeHashes: remaining }
  });
  if (claim.count !== 1) throw new AdminMfaError("That administrator recovery code was already used.");
  return "recovery";
}

export async function markAdminMfaSessionVerified(sessionId: string, userId: string): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.adminMfaMaxAgeMinutes * 60 * 1000);
  await prisma.adminMfaSession.upsert({
    where: { sessionId },
    create: { sessionId, userId, verifiedAt: now, expiresAt },
    update: { userId, verifiedAt: now, expiresAt }
  });
}

export async function adminMfaSessionIsVerified(sessionId: string, userId: string): Promise<boolean> {
  const record = await prisma.adminMfaSession.findFirst({
    where: { sessionId, userId, expiresAt: { gt: new Date() } },
    select: { sessionId: true }
  });
  return Boolean(record);
}

export async function clearAdminMfaSession(sessionId: string): Promise<void> {
  await prisma.adminMfaSession.deleteMany({ where: { sessionId } });
}

export async function clearAdminMfaSessionsForUser(userId: string, exceptSessionId?: string): Promise<void> {
  await prisma.adminMfaSession.deleteMany({
    where: { userId, ...(exceptSessionId ? { sessionId: { not: exceptSessionId } } : {}) }
  });
}

export async function adminMfaCredentialStatus(userId: string) {
  const credential = await prisma.adminMfaCredential.findUnique({
    where: { userId },
    select: { enabledAt: true, recoveryCodeHashes: true }
  });
  return {
    enabledAt: credential?.enabledAt ?? null,
    recoveryCodesRemaining: credential?.recoveryCodeHashes.length ?? 0
  };
}
