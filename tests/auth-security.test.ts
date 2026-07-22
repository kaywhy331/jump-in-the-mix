import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AUTH_TOKEN_PURPOSES, findUsableAuthToken, hashAuthToken, issueAuthToken } from "../src/lib/auth-tokens";
import { passwordValidationError } from "../src/lib/password-policy";
import { prisma } from "../src/lib/prisma";
import { consumeRateLimit, rateLimitKey, releaseRateLimitAttempt } from "../src/lib/rate-limit";

describe.sequential("authentication security primitives", () => {
  const suffix = randomUUID();
  const email = `auth-${suffix}@example.com`;
  const scope = `test.auth.${suffix}`;

  afterAll(async () => {
    await prisma.verificationToken.deleteMany({ where: { email } });
    await prisma.authRateLimit.deleteMany({ where: { scope } });
  });

  it("enforces a length-first password policy", () => {
    expect(passwordValidationError("short-pass")).toMatch(/12 characters/i);
    expect(passwordValidationError("a secure passphrase")).toBeNull();
    expect(passwordValidationError("🙂".repeat(30))).toMatch(/72 bytes/i);
  });

  it("stores only hashed one-time tokens and invalidates the previous active token", async () => {
    const first = await issueAuthToken(email, AUTH_TOKEN_PURPOSES.verifyEmail, 60_000);
    const second = await issueAuthToken(email, AUTH_TOKEN_PURPOSES.verifyEmail, 60_000);

    expect(first).not.toBe(second);
    expect(await findUsableAuthToken(first, AUTH_TOKEN_PURPOSES.verifyEmail)).toBeNull();
    const usable = await findUsableAuthToken(second, AUTH_TOKEN_PURPOSES.verifyEmail);
    expect(usable?.tokenHash).toBe(hashAuthToken(second));
    expect(usable?.tokenHash).not.toContain(second);
  });

  it("blocks a database-backed bucket after the configured attempt limit", async () => {
    const input = { scope, identifiers: [email, "127.0.0.1"], limit: 2, windowMs: 60_000, blockMs: 120_000 };
    const first = await consumeRateLimit(input);
    const second = await consumeRateLimit(input);
    const third = await consumeRateLimit(input);

    expect(first).toMatchObject({ allowed: true, remaining: 1 });
    expect(second).toMatchObject({ allowed: true, remaining: 0 });
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);

    const stored = await prisma.authRateLimit.findUnique({ where: { key: rateLimitKey(scope, input.identifiers) } });
    expect(stored?.scope).toBe(scope);
    expect(stored?.blockedUntil).toBeInstanceOf(Date);
  });

  it("isolates rate-limit buckets by identifier", async () => {
    const decision = await consumeRateLimit({
      scope,
      identifiers: [`other-${email}`],
      limit: 1,
      windowMs: 60_000
    });
    expect(decision.allowed).toBe(true);
  });

  it("releases a successful attempt without clearing earlier failures", async () => {
    const identifiers = [`successful-${email}`, "127.0.0.1"];
    const input = { scope, identifiers, limit: 3, windowMs: 60_000 };

    await consumeRateLimit(input);
    await consumeRateLimit(input);
    await releaseRateLimitAttempt(scope, identifiers);

    const stored = await prisma.authRateLimit.findUniqueOrThrow({ where: { key: rateLimitKey(scope, identifiers) } });
    expect(stored.attempts).toBe(1);
    expect(stored.blockedUntil).toBeNull();
  });
});
