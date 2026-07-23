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
    expect(register).not.toMatch(/referral|planIntent/i);
    expect(shell).toContain('from "@/lib/auth-actions"');
  });

  it("rejects untrusted browser mutation origins while keeping webhook routes available", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toContain("export function proxy");
    expect(proxy).toContain('request.headers.get("origin")');
    expect(proxy).toContain('request.headers.get("sec-fetch-site")');
    expect(proxy).toContain('/api/webhooks/');
    expect(proxy).toContain("status: 403");
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
    expect(actions).toContain("destroyOtherSessions(");
    expect(actions).toContain("destroyAllSessionsForUser(");
  });
});
