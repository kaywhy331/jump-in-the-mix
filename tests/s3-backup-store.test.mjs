import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { authenticateBackupManifest } from "../scripts/lib/backup-manifest.mjs";
import { publishBackupBundle, s3BackupConfiguration } from "../scripts/lib/s3-backup-store.mjs";

const key = randomBytes(32).toString("hex"), sourceHash = "b".repeat(64);
const env = { BACKUP_S3_BUCKET: "test-backup-bucket", BACKUP_S3_ACCOUNT_ID: "123456789012", AWS_REGION: "us-west-2" };
const config = s3BackupConfiguration(env), directories = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "jitm-s3-test-")); directories.push(directory);
  const archive = join(directory, "synthetic-test.jitm-backup.enc");
  const archiveBytes = randomBytes(64), stateBytes = randomBytes(96);
  await writeFile(archive, archiveBytes); await writeFile(`${archive}.recovery-state.enc`, stateBytes);
  const manifest = {
    manifestVersion: 2, createdAt: "2026-09-10T00:00:00Z",
    source: { operationsSourceHash: sourceHash, tableDigests: { User: "c".repeat(64) } },
    archive: { file: basename(archive), bytes: archiveBytes.length, sha256: digest(archiveBytes) },
    recoveryState: { version: 1, file: `${basename(archive)}.recovery-state.enc`, bytes: stateBytes.length, sha256: digest(stateBytes) }
  };
  async function save(signed = true) {
    if (signed) manifest.authentication = authenticateBackupManifest(manifest, key);
    await writeFile(`${archive}.manifest.json`, JSON.stringify(manifest));
  }
  await save(); return { archive, manifest, save };
}
function storage() {
  const objects = new Map(), calls = [];
  async function request(args, { signal } = {}) {
    signal?.throwIfAborted();
    const operation = args[1], value = name => args[args.indexOf(name) + 1], objectKey = value("--key");
    calls.push({ operation, objectKey });
    expect(value("--expected-bucket-owner")).toBe(env.BACKUP_S3_ACCOUNT_ID);
    if (operation === "put-object") {
      expect(value("--if-none-match")).toBe("*"); expect(value("--server-side-encryption")).toBe("AES256");
      if (objects.has(objectKey)) throw new Error("PreconditionFailed");
      const bytes = await readFile(value("--body"));
      const checksum = createHash("sha256").update(bytes).digest("base64");
      expect(value("--checksum-sha256")).toBe(checksum);
      objects.set(objectKey, { ContentLength: bytes.length, ChecksumSHA256: checksum, ServerSideEncryption: "AES256" });
      return {};
    }
    expect(operation).toBe("head-object"); expect(value("--checksum-mode")).toBe("ENABLED");
    return objects.get(objectKey);
  }
  return { request, objects, calls };
}
describe("complete encrypted S3 backup publication", () => {
  it("publishes the manifest only after both encrypted files pass stored checksum verification", async () => {
    const f = await fixture(), s = storage();
    const receipt = await publishBackupBundle(f.archive, { config, key, sourceHash, request: s.request });
    expect(s.calls.map(c => c.operation)).toEqual(["put-object", "head-object", "put-object", "head-object", "put-object", "head-object"]);
    expect(s.calls[4].objectKey).toBe(`production/${basename(f.archive)}.manifest.json`);
    expect(receipt.status).toBe("stored"); expect(receipt.objects).toHaveLength(3);
  });
  it.each(["archive", "state", "manifest", "missing", "symlink", "source", "unsigned", "filename"])("rejects invalid %s before any upload", async failure => {
    const f = await fixture(), s = storage();
    if (failure === "archive") await writeFile(f.archive, "corrupt");
    if (failure === "state") await writeFile(`${f.archive}.recovery-state.enc`, "corrupt");
    if (failure === "manifest") { f.manifest.createdAt = "2027-01-01"; await f.save(false); }
    if (failure === "missing") await unlink(`${f.archive}.recovery-state.enc`);
    if (failure === "symlink") { await unlink(`${f.archive}.recovery-state.enc`); await symlink(f.archive, `${f.archive}.recovery-state.enc`); }
    if (failure === "source") { f.manifest.source.operationsSourceHash = "d".repeat(64); await f.save(); }
    if (failure === "unsigned") { delete f.manifest.authentication; await f.save(false); }
    if (failure === "filename") { f.manifest.recoveryState.file = "../another.enc"; await f.save(); }
    await expect(publishBackupBundle(f.archive, { config, key, sourceHash, request: s.request })).rejects.toThrow();
    expect(s.calls).toHaveLength(0);
  });
  it.each(["upload", "checksum", "size", "encryption", "abort"])("does not publish a completion marker after %s failure", async failure => {
    const f = await fixture(), s = storage(), controller = new AbortController();
    const request = async (args, options) => {
      if (failure === "upload") throw Error("offline");
      const result = await s.request(args, options);
      if (args[1] === "head-object") {
        if (failure === "checksum") return { ...result, ChecksumSHA256: "wrong" };
        if (failure === "size") return { ...result, ContentLength: 0 };
        if (failure === "encryption") return { ...result, ServerSideEncryption: "aws:kms" };
        if (failure === "abort") controller.abort();
      }
      return result;
    };
    await expect(publishBackupBundle(f.archive, { config, key, sourceHash, request, signal: controller.signal })).rejects.toThrow();
    expect([...s.objects.keys()].some(k => k.endsWith(".manifest.json"))).toBe(false);
  });
  it("refuses a collision and preserves the earlier complete bundle", async () => {
    const f = await fixture(), s = storage(), options = { config, key, sourceHash, request: s.request };
    await publishBackupBundle(f.archive, options); const before = [...s.objects.entries()];
    await expect(publishBackupBundle(f.archive, options)).rejects.toThrow("PreconditionFailed");
    expect([...s.objects.entries()]).toEqual(before);
  });
  it.each([
    { BACKUP_S3_BUCKET: "https://elsewhere.example" }, { BACKUP_S3_ACCOUNT_ID: "" },
    { BACKUP_S3_PREFIX: "../elsewhere/" }, { BACKUP_S3_PREFIX: "production" }, { AWS_REGION: "" }
  ])("rejects an invalid destination %j", override => {
    expect(() => s3BackupConfiguration({ ...env, ...override })).toThrow();
  });
});
