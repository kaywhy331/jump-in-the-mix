import { describe, expect, it } from "vitest";
import { publicIndexOrigin, publicTrust, publicTrustConfigurationIssues } from "../src/lib/public-trust";
import { productionConfigurationIssues } from "../src/lib/env";

const details = { PUBLIC_OPERATOR_NAME: "Fixture operator", PUBLIC_SUPPORT_EMAIL: "support@example.test", PUBLIC_BACKUP_RETENTION_NOTICE: "Fixture backups expire after 30 days. Deleted records remain isolated until that expiry." };
const hosted = { NODE_ENV: "production" as const, APP_URL: "https://app.example.test", DATABASE_URL: "postgresql://example.invalid/app", AUTH_RATE_LIMIT_SECRET: "a".repeat(32), DATA_ENCRYPTION_KEY: "b".repeat(32), AUTH_REQUIRE_ADMIN_MFA: "true", AUTH_REQUIRE_EMAIL_VERIFICATION: "true", RESEND_API_KEY: "fixture", RESEND_WEBHOOK_SECRET: "fixture", EMAIL_FROM: "fixture@example.test", PILOT_MODE: "false", DEMO_MODE: "false" };

describe("public operator and privacy configuration", () => {
  it("does not invent public identity or retention defaults", () => {
    expect(publicTrust({})).toBeNull();
    expect(publicTrustConfigurationIssues({})).toHaveLength(3);
    expect(productionConfigurationIssues(hosted)).toEqual(publicTrustConfigurationIssues({}));
    expect(productionConfigurationIssues({ ...hosted, ...details })).toEqual([]);
  });
  it("returns only the reviewed public fields and trims their values", () => {
    expect(publicTrust({ ...details, PUBLIC_OPERATOR_NAME: "  Fixture operator  ", RESEND_API_KEY: "private-fixture" })).toEqual({ operatorName: "Fixture operator", supportEmail: details.PUBLIC_SUPPORT_EMAIL, backupRetentionNotice: details.PUBLIC_BACKUP_RETENTION_NOTICE });
  });
  it("rejects malformed addresses, control characters and unbounded notices", () => {
    for (const value of ["", "mailto:support@example.test", "support@example.test\r\nBcc:other@example.test", "support@localhost", "space here@example.test"]) expect(publicTrust({ ...details, PUBLIC_SUPPORT_EMAIL: value })).toBeNull();
    expect(publicTrust({ ...details, PUBLIC_OPERATOR_NAME: "Name\nAnother line" })).toBeNull();
    expect(publicTrust({ ...details, PUBLIC_BACKUP_RETENTION_NOTICE: "short" })).toBeNull();
    expect(publicTrust({ ...details, PUBLIC_BACKUP_RETENTION_NOTICE: "x".repeat(1201) })).toBeNull();
  });
  it("keeps private loopback qualification usable without publishing a fictitious operator", () => {
    expect(productionConfigurationIssues({ ...hosted, APP_URL: "http://127.0.0.1:3000", PILOT_MODE: "true" })).toEqual([]);
    expect(publicTrust(hosted)).toBeNull();
  });
  it("publishes a canonical origin only for a configured public production site", () => {
    expect(publicIndexOrigin({ ...hosted, ...details })).toBe("https://app.example.test");
    for (const mode of ["PRIVATE_TEST_MODE", "PILOT_MODE", "DEMO_MODE"]) expect(publicIndexOrigin({ ...hosted, ...details, [mode]: "true" })).toBeNull();
    expect(publicIndexOrigin(hosted)).toBeNull();
    expect(publicIndexOrigin({ ...hosted, ...details, NODE_ENV: "development" })).toBeNull();
  });
  it("refuses credentials, paths, query strings and invalid origins in discovery documents", () => {
    for (const value of ["invalid", "http://app.example.test", "https://user:password@app.example.test", "https://app.example.test/private", "https://app.example.test/?token=private", "https://app.example.test/#fragment", "https://localhost", "https://[::1]"]) expect(publicIndexOrigin({ ...hosted, ...details, APP_URL: value })).toBeNull();
  });
});
