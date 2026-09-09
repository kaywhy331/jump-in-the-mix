import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("administrator MFA boundaries", () => {
  it("gates platform administration after role authorization", () => {
    const auth = read("src/lib/auth.ts");
    expect(auth).toContain("requirePlatformAdminIdentity");
    expect(auth).toContain("env.requireAdminMfa");
    expect(auth).toContain("adminMfaCredentialStatus");
    expect(auth).toContain("adminMfaSessionIsVerified");
    expect(auth).toContain("/account/admin-mfa?setup=1");
    expect(auth).toContain("/account/admin-mfa?verify=1");
  });

  it("keeps enrollment role-only while requiring password confirmation and rate limits", () => {
    const actions = read("src/lib/admin-mfa-actions.ts");
    const page = read("src/app/(staff)/account/admin-mfa/page.tsx");
    expect(actions).toContain("requirePlatformAdminIdentity");
    expect(actions).toContain("bcrypt.compare(currentPassword");
    expect(actions).toContain("auth.admin-mfa.enable");
    expect(actions).toContain("auth.admin-mfa.verify");
    expect(page).toContain("prepareAdminMfaEnrollment");
    expect(page).toContain("QRCode.toDataURL");
  });

  it("stores encrypted secrets, hashed one-time recovery codes, and replay counters", () => {
    const service = read("src/lib/admin-mfa.ts");
    const schema = read("prisma/auth.prisma");
    expect(service).toContain("encryptWithSecret");
    expect(service).toContain("recoveryCodeHash");
    expect(service).toContain("lastUsedCounter");
    expect(service).toContain("recoveryCodeHashes: { has: hash }");
    expect(schema).toContain("model AdminMfaCredential");
    expect(schema).toContain("model AdminMfaSession");
  });

  it("ships an independent production migration", () => {
    const migration = "prisma/migrations/20260717070000_admin_mfa/migration.sql";
    expect(existsSync(migration)).toBe(true);
    expect(read(migration)).toContain('CREATE TABLE "AdminMfaCredential"');
    expect(read(migration)).toContain('CREATE TABLE "AdminMfaSession"');
  });
});
