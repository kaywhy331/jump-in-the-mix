import { createHash } from "node:crypto";
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
  return code === "P2034" || code === "P2002";
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
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!retryableTransactionError(error) || attempt === 2) throw error;
    }
  }

  return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(input.windowMs / 1000) };
}

export async function clearRateLimit(scope: string, identifiers: RateLimitInput["identifiers"]): Promise<void> {
  await prisma.authRateLimit.deleteMany({ where: { key: rateLimitKey(scope, identifiers) } });
}
