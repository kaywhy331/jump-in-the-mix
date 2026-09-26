import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitInput = {
  scope: string;
  identifiers: Array<string | null | undefined>;
  limit: number;
  windowMs: number;
  blockMs?: number;
};

function normalizedIdentifiers(values: RateLimitInput["identifiers"]): string {
  return values
    .map((value) => value?.trim().toLowerCase() || "unknown")
    .join("|");
}

export function rateLimitKey(scope: string, identifiers: RateLimitInput["identifiers"]): string {
  return createHash("sha256")
    .update(`${env.authRateLimitSecret}|${scope}|${normalizedIdentifiers(identifiers)}`, "utf8")
    .digest("hex");
}

function retryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  const cause = "cause" in error && error.cause && typeof error.cause === "object" ? error.cause : null;
  const originalCode = cause && "originalCode" in cause ? String(cause.originalCode) : "";
  const kind = cause && "kind" in cause ? String(cause.kind) : "";
  return code === "P2034"
    || code === "P2002"
    || (code === "P2028" && message.includes("Unable to start a transaction"))
    || originalCode === "40001"
    || kind === "TransactionWriteConflict";
}

export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitDecision> {
  const key = rateLimitKey(input.scope, input.identifiers);
  const blockMs = input.blockMs ?? input.windowMs;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();
        const existing = await tx.authRateLimit.findUnique({ where: { key } });

        if (!existing) {
          await tx.authRateLimit.create({
            data: {
              key,
              scope: input.scope,
              attempts: 1,
              windowStartedAt: now
            }
          });
          return { allowed: true, remaining: Math.max(input.limit - 1, 0), retryAfterSeconds: 0 };
        }

        if (existing.blockedUntil && existing.blockedUntil > now) {
          return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000), 1)
          };
        }

        const windowExpired = now.getTime() - existing.windowStartedAt.getTime() >= input.windowMs;
        if (windowExpired) {
          await tx.authRateLimit.update({
            where: { key },
            data: { attempts: 1, windowStartedAt: now, blockedUntil: null, scope: input.scope }
          });
          return { allowed: true, remaining: Math.max(input.limit - 1, 0), retryAfterSeconds: 0 };
        }

        const attempts = existing.attempts + 1;
        if (attempts > input.limit) {
          const blockedUntil = new Date(now.getTime() + blockMs);
          await tx.authRateLimit.update({ where: { key }, data: { attempts, blockedUntil } });
          return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(Math.ceil(blockMs / 1000), 1)
          };
        }

        await tx.authRateLimit.update({ where: { key }, data: { attempts, blockedUntil: null } });
        return { allowed: true, remaining: Math.max(input.limit - attempts, 0), retryAfterSeconds: 0 };
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 5_000 });
    } catch (error) {
      if (!retryableTransactionError(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }

  return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(input.windowMs / 1000) };
}

export async function clearRateLimit(scope: string, identifiers: RateLimitInput["identifiers"]): Promise<void> {
  await prisma.authRateLimit.deleteMany({ where: { key: rateLimitKey(scope, identifiers) } });
}

export async function releaseRateLimitAttempt(scope: string, identifiers: RateLimitInput["identifiers"]): Promise<void> {
  await prisma.authRateLimit.updateMany({
    where: {
      key: rateLimitKey(scope, identifiers),
      attempts: { gt: 0 },
      blockedUntil: null
    },
    data: { attempts: { decrement: 1 } }
  });
}

/** Clears a bucket's count unless it is blocking right now: an active block or step-up runs its course. */
export async function clearRateLimitUnlessBlocked(scope: string, identifiers: RateLimitInput["identifiers"], now = new Date()): Promise<void> {
  await prisma.authRateLimit.deleteMany({ where: { key: rateLimitKey(scope, identifiers), OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }] } });
}

/*
 * Known device. A browser that has signed in to an account (or reset its password) keeps a signed
 * HttpOnly marker for that account. Abuse controls aimed at strangers — the email-wide password
 * step-up and the per-address daily email limits — do not apply to it, so nobody can use them to lock
 * the owner out of a browser they already use. The marker names no account (an HMAC over the account
 * id and the time it was set) and holds up to KNOWN_DEVICE_ENTRIES accounts, newest first.
 */
const KNOWN_DEVICE_ENTRIES = 3;
const DAY_SECONDS = 24 * 60 * 60;

function knownDeviceLifetimeSeconds(): number {
  const days = Number(env.sessionMaxDays);
  return Math.round((Number.isFinite(days) && days > 0 ? Math.min(days, 400) : 90) * DAY_SECONDS);
}

function knownDeviceSignature(userId: string, issuedAt: number): string {
  return createHmac("sha256", env.authRateLimitSecret).update(`jitm-known-device:v1:${userId}:${issuedAt}`, "utf8").digest("base64url");
}

function knownDeviceEntries(value: string | null | undefined, nowSeconds: number): Array<{ issuedAt: number; signature: string; raw: string }> {
  if (!value || value.length > 1024) return [];
  return value.split("~").flatMap(raw => {
    const match = /^(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(raw);
    const issuedAt = match ? Number(match[1]) : NaN;
    return match && issuedAt <= nowSeconds + 300 && nowSeconds - issuedAt < knownDeviceLifetimeSeconds() ? [{ issuedAt, signature: match[2], raw }] : [];
  });
}

function entryMatches(entry: { issuedAt: number; signature: string }, userId: string): boolean {
  const expected = Buffer.from(knownDeviceSignature(userId, entry.issuedAt), "utf8"), received = Buffer.from(entry.signature, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function knownDeviceCookieName(): string {
  return `${env.cookieName}_device`;
}

/** True when the browser's marker says it has signed in to this account within the marker's lifetime. */
export function isKnownDevice(value: string | null | undefined, userId: string, now = new Date()): boolean {
  return knownDeviceEntries(value, Math.floor(now.getTime() / 1000)).some(entry => entryMatches(entry, userId));
}

/** The marker to set after a successful sign-in: this account first, then the browser's other accounts. */
export function knownDeviceCookie(value: string | null | undefined, userId: string, now = new Date()) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const others = knownDeviceEntries(value, nowSeconds).filter(entry => !entryMatches(entry, userId)).map(entry => entry.raw);
  const entry = `${nowSeconds}.${knownDeviceSignature(userId, nowSeconds)}`;
  return {
    name: knownDeviceCookieName(),
    value: [entry, ...others].slice(0, KNOWN_DEVICE_ENTRIES).join("~"),
    options: { httpOnly: true, sameSite: "lax" as const, secure: env.secureSessionCookie, path: "/", maxAge: knownDeviceLifetimeSeconds() }
  };
}
