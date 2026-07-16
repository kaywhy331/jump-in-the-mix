import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Google Contacts boundary", () => {
  it("uses one-time hashed OAuth state and encrypted credentials", () => {
    const google = read("src/lib/google-contacts.ts");
    expect(google).toContain("tokenHash: hashToken(state)");
    expect(google).toContain("usedAt: null");
    expect(google).toContain("expiresAt: { gt: new Date() }");
    expect(google).toContain("encryptIntegrationCredentials(credentials)");
    expect(google).not.toContain("refreshToken:");
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

  it("rate limits provider reads and writes", () => {
    for (const path of [
      "src/app/api/integrations/google/groups/route.ts",
      "src/app/api/integrations/google/preview/route.ts",
      "src/app/api/integrations/google/sync/route.ts",
      "src/app/api/integrations/google/disconnect/route.ts"
    ]) {
      const route = read(path);
      expect(route).toContain("consumeRateLimit(");
      expect(route).toContain('"Retry-After"');
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
    expect(service).toContain("ExternalContactLink");
  });

  it("never exposes encrypted credentials through the status route", () => {
    const status = read("src/app/api/integrations/google/status/route.ts");
    expect(status).not.toContain("credentialsCiphertext");
    expect(status).not.toContain("accessToken");
    expect(status).not.toContain("refreshToken");
  });
});
