import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authenticateBackupManifest, verifyBackupManifestAuthentication } from "../scripts/lib/backup-manifest.mjs";
const key = randomBytes(32).toString("hex");
function fixture() {
  const manifest = { manifestVersion: 2, archive: { sha256: "a".repeat(64) }, createdAt: "2026-09-08T00:00:00Z", source: { schema: "public", operationsSourceHash: "b".repeat(64), tableCounts: { User: "3" }, tableDigests: { User: "c".repeat(64) } } };
  return { ...manifest, authentication: authenticateBackupManifest(manifest, key) };
}
describe("backup manifest authentication", () => {
  it("authenticates the serialized file despite object key order and whitespace changes", () => {
    const m = fixture(); const reordered = { source: m.source, createdAt: m.createdAt, manifestVersion: m.manifestVersion, archive: m.archive, authentication: m.authentication };
    expect(verifyBackupManifestAuthentication(JSON.parse(JSON.stringify(reordered, null, 2)), key)).toBe(true);
  });
  it.each(["source", "archive", "count", "digest", "time"])("rejects tampered %s evidence", field => {
    const m = fixture();
    if (field === "source") m.source.operationsSourceHash = "d".repeat(64);
    if (field === "archive") m.archive.sha256 = "e".repeat(64);
    if (field === "count") m.source.tableCounts.User = "0";
    if (field === "digest") m.source.tableDigests.User = "f".repeat(64);
    if (field === "time") m.createdAt = "2026-09-09T00:00:00Z";
    expect(() => verifyBackupManifestAuthentication(m, key)).toThrow("authenticated");
  });
  it("does not trust unsigned legacy files or a removed authentication field", () => {
    const m = fixture(); delete m.authentication;
    expect(verifyBackupManifestAuthentication(m, key)).toBe(false);
  });
  it("rejects a wrong key or malformed authentication instead of accepting a legacy downgrade", () => {
    const m = fixture(); expect(() => verifyBackupManifestAuthentication(m, randomBytes(32).toString("hex"))).toThrow("authenticated");
    m.authentication = null; expect(() => verifyBackupManifestAuthentication(m, key)).toThrow("authenticated");
  });
});
