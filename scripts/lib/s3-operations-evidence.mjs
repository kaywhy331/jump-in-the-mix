import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { awsJson, s3BackupConfiguration } from "./s3-backup-store.mjs";
import { operationsSourceHash, privateJson } from "./operations-artifacts.mjs";

const assert = value => { if (!value) throw Error("Offsite operations evidence is invalid."); };
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

// This is a metadata/checksum observation with a read-only storage credential.
// It needs no decryption key and does not claim a new restore qualification.
export async function readS3OperationsArtifactAges(databaseUrl, now = new Date(), env = process.env, request = awsJson) {
  const empty = { backupAgeHours: null, restoreAgeDays: null };
  let config;
  try { config = s3BackupConfiguration(env); } catch { return empty; }
  const sourceHash = operationsSourceHash(databaseUrl), signal = AbortSignal.timeout(30_000);
  const directory = await mkdtemp(join(tmpdir(), "jitm-operations-evidence-"));
  const common = ["--bucket", config.bucket, "--expected-bucket-owner", config.owner, "--region", config.region];
  let counter = 0;
  const head = key => request(["s3api", "head-object", ...common, "--key", key, "--checksum-mode", "ENABLED"], { signal });
  const checksum = value => Buffer.from(value, "hex").toString("base64");
  function age(value) { const time = Date.parse(value); assert(Number.isFinite(time) && time <= now.getTime() + 300_000); return Math.max(0, now.getTime() - time) / 3600000; }
  async function json(key, limit) {
    const metadata = await head(key);
    assert(Number.isSafeInteger(metadata.ContentLength) && metadata.ContentLength > 0 && metadata.ContentLength <= limit && metadata.ServerSideEncryption === "AES256");
    const file = join(directory, `${counter++}.json`);
    await request(["s3api", "get-object", ...common, "--key", key, "--range", `bytes=0-${limit - 1}`, file], { signal });
    const bytes = await readFile(file);
    assert(bytes.length === metadata.ContentLength && createHash("sha256").update(bytes).digest("base64") === metadata.ChecksumSHA256);
    return privateJson(file, limit);
  }
  async function backupAge() {
    // Bound listing to one page: the daily, seven-day prefix is small. If an
    // unexpectedly large inventory appears, fail visibly rather than use an
    // incomplete page and silently select an older backup.
    const inventory = await request(["s3api", "list-objects-v2", ...common, "--prefix", config.prefix, "--max-keys", "1000", "--no-paginate"], { signal });
    assert(!inventory.IsTruncated && Array.isArray(inventory.Contents));
    const candidates = inventory.Contents.filter(item => typeof item.Key === "string" && item.Key.startsWith(config.prefix) && /^[a-zA-Z0-9_-]+\.jitm-backup\.enc\.manifest\.json$/.test(item.Key.slice(config.prefix.length)));
    assert(candidates.every(item => Number.isFinite(Date.parse(item.LastModified))));
    candidates.sort((a, b) => Date.parse(b.LastModified) - Date.parse(a.LastModified));
    const latest = candidates[0]; assert(latest);
    const manifest = await json(latest.Key, 2 * 1024 * 1024);
    const archiveKey = latest.Key.slice(0, -".manifest.json".length);
    assert(manifest.manifestVersion === 2 && manifest.source?.operationsSourceHash === sourceHash && manifest.source?.tableDigests && manifest.authentication?.algorithm === "hmac-sha256" && hash(manifest.authentication.tag));
    assert(manifest.archive?.file === archiveKey.slice(config.prefix.length) && manifest.recoveryState?.version === 1 && manifest.recoveryState.file === `${manifest.archive.file}.recovery-state.enc`);
    for (const [key, proof] of [[archiveKey, manifest.archive], [`${archiveKey}.recovery-state.enc`, manifest.recoveryState]]) {
      assert(Number.isSafeInteger(proof.bytes) && proof.bytes > 0 && hash(proof.sha256));
      const stored = await head(key);
      assert(stored.ContentLength === proof.bytes && stored.ChecksumSHA256 === checksum(proof.sha256) && stored.ServerSideEncryption === "AES256");
    }
    return age(manifest.createdAt);
  }
  async function restoreAge() {
    const key = env.OPS_RESTORE_S3_KEY?.trim();
    assert(typeof key === "string" && /^operations\/[a-zA-Z0-9_-]+\.json$/.test(key));
    const receipt = await json(key, 16 * 1024);
    assert(receipt.version === 1 && receipt.kind === "restore" && receipt.sourceHash === sourceHash && receipt.contentVerified === true && receipt.foreignKeysVerified === true && hash(receipt.archiveSha256));
    return age(receipt.completedAt) / 24;
  }
  try {
    const [backup, restore] = await Promise.allSettled([backupAge(), restoreAge()]);
    return { backupAgeHours: backup.status === "fulfilled" ? backup.value : null, restoreAgeDays: restore.status === "fulfilled" ? restore.value : null };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
