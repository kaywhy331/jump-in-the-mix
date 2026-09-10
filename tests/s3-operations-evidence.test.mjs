import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { operationsSourceHash } from "../scripts/lib/operations-artifacts.mjs";
import { readS3OperationsArtifactAges } from "../scripts/lib/s3-operations-evidence.mjs";

const url = "postgresql://reader:secret@database.internal:5432/application?schema=public";
const now = new Date("2026-09-10T12:00:00Z"), sourceHash = operationsSourceHash(url);
const env = { BACKUP_S3_BUCKET: "synthetic-backups", BACKUP_S3_ACCOUNT_ID: "123456789012", AWS_REGION: "us-west-2", OPS_RESTORE_S3_KEY: "operations/restore-receipt.json" };
const archiveKey = "production/jump-synthetic.jitm-backup.enc";
const checksum = value => createHash("sha256").update(value).digest("base64");
function fixture(change = () => {}) {
  const manifest = {
    manifestVersion: 2, createdAt: "2026-09-10T10:00:00Z",
    source: { operationsSourceHash: sourceHash, tableDigests: { User: "a".repeat(64) } },
    authentication: { algorithm: "hmac-sha256", tag: "b".repeat(64) },
    archive: { file: "jump-synthetic.jitm-backup.enc", bytes: 100, sha256: "c".repeat(64) },
    recoveryState: { version: 1, file: "jump-synthetic.jitm-backup.enc.recovery-state.enc", bytes: 200, sha256: "d".repeat(64) }
  };
  const receipt = { version: 1, kind: "restore", completedAt: "2026-09-08T12:00:00Z", sourceHash, contentVerified: true, foreignKeysVerified: true, archiveSha256: "e".repeat(64) };
  change(manifest, receipt);
  const files = new Map([[`${archiveKey}.manifest.json`, JSON.stringify(manifest)], [env.OPS_RESTORE_S3_KEY, JSON.stringify(receipt)]]);
  const calls = [];
  const metadata = (bytes, digest) => ({ ContentLength: bytes, ChecksumSHA256: Buffer.from(digest, "hex").toString("base64"), ServerSideEncryption: "AES256" });
  async function request(args) {
    const value = name => args[args.indexOf(name) + 1], key = value("--key"); calls.push({ operation: args[1], key });
    expect(value("--expected-bucket-owner")).toBe(env.BACKUP_S3_ACCOUNT_ID);
    if (args[1] === "list-objects-v2") return { IsTruncated: false, Contents: [{ Key: `${archiveKey}.manifest.json`, LastModified: "2026-09-10T10:01:00Z" }, { Key: "production/incomplete.jitm-backup.enc", LastModified: now.toISOString() }] };
    if (args[1] === "head-object") {
      if (key === archiveKey) return metadata(100, "c".repeat(64));
      if (key === `${archiveKey}.recovery-state.enc`) return metadata(200, "d".repeat(64));
      const body = files.get(key); if (!body) throw Error("Missing object");
      return { ContentLength: Buffer.byteLength(body), ChecksumSHA256: checksum(body), ServerSideEncryption: "AES256" };
    }
    expect(args[1]).toBe("get-object"); expect(files.has(key)).toBe(true);
    await writeFile(args.at(-1), files.get(key)); return {};
  }
  return { request, calls };
}
describe("independent S3 freshness observations", () => {
  it("checks all bundle metadata without downloading customer ciphertext or needing a decryption key", async () => {
    const f = fixture();
    expect(await readS3OperationsArtifactAges(url, now, env, f.request)).toEqual({ backupAgeHours: 2, restoreAgeDays: 2 });
    expect(f.calls.filter(c => c.operation === "get-object").map(c => c.key).sort()).toEqual([env.OPS_RESTORE_S3_KEY, `${archiveKey}.manifest.json`].sort());
  });
  it.each(["source", "future", "filename", "checksum", "missing-state"])("reports an invalid %s backup as unknown while preserving independent restore evidence", async failure => {
    const f = fixture(m => {
      if (failure === "source") m.source.operationsSourceHash = "f".repeat(64);
      if (failure === "future") m.createdAt = "2027-01-01T00:00:00Z";
      if (failure === "filename") m.recoveryState.file = "../../private";
      if (failure === "checksum") m.archive.sha256 = "f".repeat(64);
      if (failure === "missing-state") delete m.recoveryState;
    });
    expect(await readS3OperationsArtifactAges(url, now, env, f.request)).toEqual({ backupAgeHours: null, restoreAgeDays: 2 });
  });
  it.each(["source", "content", "foreign-keys", "future"])("rejects invalid restore %s evidence without changing backup age", async failure => {
    const f = fixture((m, r) => {
      if (failure === "source") r.sourceHash = "f".repeat(64);
      if (failure === "content") r.contentVerified = false;
      if (failure === "foreign-keys") r.foreignKeysVerified = false;
      if (failure === "future") r.completedAt = "2027-01-01T00:00:00Z";
    });
    expect(await readS3OperationsArtifactAges(url, now, env, f.request)).toEqual({ backupAgeHours: 2, restoreAgeDays: null });
  });
  it.each(["truncated-list", "corrupt-manifest", "missing-archive", "wrong-size"])("does not fall back to older backups after %s", async failure => {
    const f = fixture();
    const request = async args => {
      const result = await f.request(args);
      if (failure === "truncated-list" && args[1] === "list-objects-v2") return { ...result, IsTruncated: true };
      if (failure === "corrupt-manifest" && args[1] === "get-object" && args.includes(`${archiveKey}.manifest.json`)) await writeFile(args.at(-1), "corrupt");
      if (failure === "missing-archive" && args[1] === "head-object" && args.includes(archiveKey)) throw Error("Missing object");
      if (failure === "wrong-size" && args[1] === "head-object" && args.includes(archiveKey)) return { ...result, ContentLength: 500 };
      return result;
    };
    expect(await readS3OperationsArtifactAges(url, now, env, request)).toEqual({ backupAgeHours: null, restoreAgeDays: 2 });
  });
  it("reports a storage outage as unknown instead of manufacturing fresh receipts", async () => {
    expect(await readS3OperationsArtifactAges(url, now, env, async () => { throw Error("Offline"); })).toEqual({ backupAgeHours: null, restoreAgeDays: null });
  });
});
