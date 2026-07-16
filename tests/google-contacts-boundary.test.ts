import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Google Contacts boundary", () => {
  it("uses one-time hashed OAuth state, PKCE, and encrypted credentials", () => {
    const google = read("src/lib/google-contacts.ts");
    const callback = read("src/app/api/integrations/google/callback/route.ts");
    expect(google).toContain("tokenHash: hashToken(state)");
    expect(google).toContain("usedAt: null");
    expect(google).toContain("expiresAt: { gt: new Date() }");
    expect(google).toContain('url.searchParams.set("code_challenge", codeChallenge)');
    expect(google).toContain('url.searchParams.set("code_challenge_method", "S256")');
    expect(google).toContain("parameters.code_verifier = codeVerifier");
    expect(google).toContain("encryptIntegrationCredentials({ returnTo: normalizedReturnTo(input.returnTo), codeVerifier })");
    expect(google).toContain("encryptIntegrationCredentials(credentials)");
    expect(callback).toContain("{ returnTo, codeVerifier }");
    expect(callback).toContain("exchangeGoogleAuthorizationCode(code, existingRefreshToken, codeVerifier)");
  });

  it("requires authentication, plan entitlement, and blocks support-view writes", () => {
    for (const path of [
      "src/app/api/integrations/google/preview/route.ts",
      "src/app/api/integrations/google/sync/route.ts",
      "src/app/api/integrations/google/disconnect/route.ts"
    ]) {
      const route = read(path);
      expect(route).toContain("getCurrentSession(");
      expect(route).toContain("session?.user.memberships[0]");
      expect(route).toContain("session.impersonation");
      expect(route).toContain("status: 403");
    }
    expect(read("src/app/api/integrations/google/sync/route.ts")).toContain("PLAN_LIMITS[membership.workspace.planTier].googleContacts");
  });

  it("rate limits OAuth, provider reads, and writes", () => {
    for (const path of [
      "src/app/api/integrations/google/start/route.ts",
      "src/app/api/integrations/google/groups/route.ts",
      "src/app/api/integrations/google/preview/route.ts",
      "src/app/api/integrations/google/sync/route.ts",
      "src/app/api/integrations/google/disconnect/route.ts"
    ]) {
      const route = read(path);
      expect(route).toContain("consumeRateLimit(");
    }
    for (const path of [
      "src/app/api/integrations/google/groups/route.ts",
      "src/app/api/integrations/google/preview/route.ts",
      "src/app/api/integrations/google/sync/route.ts",
      "src/app/api/integrations/google/disconnect/route.ts"
    ]) {
      expect(read(path)).toContain('"Retry-After"');
    }
  });

  it("keeps Google one-way and preserves local Contacts on remote deletion", () => {
    const service = read("src/lib/google-sync-service.ts");
    const google = read("src/lib/google-contacts.ts");
    expect(google).toContain("contacts.readonly");
    expect(service).toContain("Deleted from Google; the local Contact will be preserved.");
    expect(service).toContain("deletedAt: new Date()");
    expect(service).not.toContain("contact.delete(");
    expect(service).not.toContain("contact.deleteMany(");
  });

  it("uses incremental cursors, plan capacity, audit records, and Jump reconciliation", () => {
    const service = read("src/lib/google-sync-service.ts");
    expect(service).toContain("syncToken: connection.syncCursor");
    expect(service).toContain("nextSyncToken");
    expect(service).toContain("PLAN_LIMITS[connection.workspace.planTier].contacts");
    expect(service).toContain('source: "google.contacts"');
    expect(service).toContain('task: "generate-jumps"');
    expect(service).toContain("externalContactLink");
  });

  it("does not let a stale sync overwrite a disconnected or reconnected account", () => {
    const service = read("src/lib/google-sync-service.ts");
    expect(service).toContain("credentialsCiphertext: connection.credentialsCiphertext");
    expect(service).toContain("externalAccountId: connection.externalAccountId");
    expect(service).toContain('status: { not: "REVOKED" }');
    expect(service).toContain('"The Google connection changed while this sync was running."');
  });

  it("never exposes encrypted credentials through the status route", () => {
    const status = read("src/app/api/integrations/google/status/route.ts");
    expect(status).not.toContain("credentialsCiphertext");
    expect(status).not.toContain("accessToken");
    expect(status).not.toContain("refreshToken");
  });

  it("protects administrator integration diagnostics", () => {
    const page = read("src/app/(app)/admin/integrations/page.tsx");
    expect(page).toContain("requirePlatformAdmin()");
    expect(page).not.toContain("credentialsCiphertext");
    expect(page).not.toContain("accessToken");
    expect(page).not.toContain("refreshToken");
  });
});
