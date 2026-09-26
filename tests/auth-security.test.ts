import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { ACCOUNT_TOKEN_PURPOSES, AUTH_TOKEN_PURPOSES, findUsableAuthToken, hashAuthToken, invalidateAuthTokens, issueAuthToken } from "../src/lib/auth-tokens";
import { passwordValidationError } from "../src/lib/password-policy";
import { prisma } from "../src/lib/prisma";
import { clearRateLimitUnlessBlocked, consumeRateLimit, rateLimitKey, releaseRateLimitAttempt } from "../src/lib/rate-limit";

describe.sequential("authentication security primitives", () => {
  const suffix = randomUUID();
  const email = `auth-${suffix}@example.com`;
  const scope = `test.auth.${suffix}`;

  afterAll(async () => {
    await prisma.verificationToken.deleteMany({ where: { email: { in: [email, `kept-${email}`, `ended-${email}`] } } });
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

  it("keeps spent and replaced links for a day so daily limits can count them, then clears them", async () => {
    const kept = `kept-${email}`;
    for (let issue = 0; issue < 3; issue++) await issueAuthToken(kept, AUTH_TOKEN_PURPOSES.magicLogin, 60_000);
    expect(await prisma.verificationToken.count({ where: { email: kept, purpose: AUTH_TOKEN_PURPOSES.magicLogin } })).toBe(3);
    expect(await prisma.verificationToken.count({ where: { email: kept, purpose: AUTH_TOKEN_PURPOSES.magicLogin, usedAt: null } })).toBe(1);
    await prisma.verificationToken.updateMany({ where: { email: kept, usedAt: { not: null } }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    await issueAuthToken(kept, AUTH_TOKEN_PURPOSES.magicLogin, 60_000);
    // The two day-old spent links are gone; the one replaced just now stays for its day.
    expect(await prisma.verificationToken.count({ where: { email: kept, purpose: AUTH_TOKEN_PURPOSES.magicLogin } })).toBe(2);
  });

  it("ends every outstanding link for an address, or only the account links", async () => {
    const ended = `ended-${email}`;
    for (const purpose of Object.values(AUTH_TOKEN_PURPOSES)) await prisma.verificationToken.create({ data: { email: ended, purpose, tokenHash: hashAuthToken(`${purpose}-${suffix}`), expiresAt: new Date(Date.now() + 60_000) } });
    expect(await invalidateAuthTokens(prisma, ` ${ended.toUpperCase()} `, ACCOUNT_TOKEN_PURPOSES)).toBe(3);
    expect(await prisma.verificationToken.findMany({ where: { email: ended, usedAt: null }, select: { purpose: true }, orderBy: { purpose: "asc" } })).toEqual([{ purpose: AUTH_TOKEN_PURPOSES.invitationOptout }, { purpose: AUTH_TOKEN_PURPOSES.waitlist }]);
    expect(await invalidateAuthTokens(prisma, ended, "all")).toBe(2);
    expect(await prisma.verificationToken.count({ where: { email: ended, usedAt: null } })).toBe(0);
  });

  it("clears a bucket's count unless it is blocking right now", async () => {
    const counting = [`counting-${email}`], blocking = [`blocking-${email}`];
    await consumeRateLimit({ scope, identifiers: counting, limit: 5, windowMs: 60_000 });
    for (let attempt = 0; attempt < 3; attempt++) await consumeRateLimit({ scope, identifiers: blocking, limit: 1, windowMs: 60_000, blockMs: 120_000 });
    await clearRateLimitUnlessBlocked(scope, counting);
    await clearRateLimitUnlessBlocked(scope, blocking);
    expect(await prisma.authRateLimit.findUnique({ where: { key: rateLimitKey(scope, counting) } })).toBeNull();
    expect((await prisma.authRateLimit.findUniqueOrThrow({ where: { key: rateLimitKey(scope, blocking) } })).blockedUntil).toBeInstanceOf(Date);
  });
});

