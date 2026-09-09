import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("authentication request boundary", () => {
  it("routes public authentication forms through hardened action modules", () => {
    const login = readFileSync("src/app/login/page.tsx", "utf8");
    const register = readFileSync("src/app/register/page.tsx", "utf8");
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(login).toContain('from "@/lib/auth-actions"');
    expect(register).toContain('from "@/lib/auth-actions"');
    expect(register).toContain("registerAction");
    expect(register).toContain("pilotRegistrationOpen");
    expect(login).toContain("requestMagicLinkAction");
    expect(login).toContain("SocialSignInOptions");
    expect(register).toContain("validAccessToken");
    expect(register).toContain("referralAccessInvite");
    expect(register).not.toContain("requestInviteAction");
    expect(shell).toContain('from "@/lib/auth-actions"');
  });

  it("rejects untrusted browser mutation origins while keeping webhook routes available", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toMatch(/export\s+(?:async\s+)?function\s+proxy\(/);
    expect(proxy).toContain('request.headers.get("origin")');
    expect(proxy).toContain('request.headers.get("sec-fetch-site")');
    expect(proxy).toContain('/api/webhooks/');
    expect(proxy).toContain("status: 403");
    expect(proxy).toContain("Content-Security-Policy");
    expect(proxy).toContain("'strict-dynamic'");
    expect(proxy).toContain('requestHeaders.set("x-nonce", nonce)');
    expect(proxy).toContain('origin === "https://appleid.apple.com"');
  });

  it("keeps Server Actions same-origin by default and constrains request size", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain("allowedOrigins");
    expect(config).toContain('bodySizeLimit: "1mb"');
  });

  it("rate limits authenticated Jump action events", () => {
    const route = readFileSync("src/app/api/jumps/[jumpId]/actions/route.ts", "utf8");
    expect(route).toContain("consumeRateLimit(");
    expect(route).toContain('scope: "api.jump-action"');
    expect(route).toContain("status: 429");
    expect(route).toContain('"Retry-After"');
  });

  it("provides one-time email verification, password reset, and session revocation workflows", () => {
    const actions = readFileSync("src/lib/auth-actions.ts", "utf8");
    expect(actions).toContain("issueAuthToken(");
    expect(actions).toContain("AUTH_TOKEN_PURPOSES.verifyEmail");
    expect(actions).toContain("AUTH_TOKEN_PURPOSES.resetPassword");
    expect(actions).toContain("AUTH_TOKEN_PURPOSES.magicLogin");
    expect(actions).toContain("destroyOtherSessions(");
    expect(actions).toContain("destroyAllSessionsForUser(");
    expect(actions).toContain("rotateSession(session.id, user.id)");
    expect(readFileSync("src/lib/auth.ts", "utf8")).toContain('sameSite: "strict"');
  });

  it("ships hosted identity storage and one-time OAuth protections", () => {
    const social = readFileSync("src/lib/social-auth.ts", "utf8");
    const migration = readFileSync("prisma/migrations/20260904180000_hosted_auth/migration.sql", "utf8");
    expect(social).toContain('code_challenge_method", "S256"');
    expect(social).toContain("stateHash: hashOAuthValue(state)");
    expect(social).toContain("usedAt: null");
    expect(social).toContain("claimed.count !== 1");
    expect(social).toContain("identityNonceMatches(result.payload.nonce, nonce)");
    expect(migration).toContain('ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL');
    expect(migration).toContain('CREATE TABLE "AuthIdentity"');
    expect(migration).toContain('CREATE TABLE "AuthOAuthState"');
  });
});
