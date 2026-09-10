import { lstat } from "node:fs/promises";
import { basename } from "node:path";
import { sha256File } from "./backup-archive.mjs";
import { verifyBackupManifestAuthentication } from "./backup-manifest.mjs";
import { privateJson } from "./operations-artifacts.mjs";
import { runCommand } from "./postgres-ops.mjs";

const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function s3BackupConfiguration(env = process.env) {
  const bucket = env.BACKUP_S3_BUCKET?.trim();
  const region = env.AWS_REGION?.trim();
  const owner = env.BACKUP_S3_ACCOUNT_ID?.trim();
  const prefix = env.BACKUP_S3_PREFIX?.trim() || "production/";
  assert(typeof bucket === "string" && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket), "Configure BACKUP_S3_BUCKET with a plain S3 bucket name.");
  assert(typeof region === "string" && /^[a-z]{2}-[a-z]+-\d$/.test(region), "Configure AWS_REGION.");
  assert(typeof owner === "string" && /^\d{12}$/.test(owner), "Configure BACKUP_S3_ACCOUNT_ID with the expected bucket owner.");
  assert(/^(?:[a-zA-Z0-9_-]+\/)+$/.test(prefix), "BACKUP_S3_PREFIX must contain simple directory names and end with a slash.");
  return { bucket, region, owner, prefix };
}

async function awsJson(args, { signal } = {}) {
  // Credentials stay in the AWS credential chain, never command arguments or logs.
  // CLI diagnostics can contain endpoint details; report only the failed operation.
  try {
    const result = await runCommand("aws", [...args, "--output", "json", "--no-cli-pager", "--cli-connect-timeout", "15", "--cli-read-timeout", "120"], {
      capture: true, signal,
      env: { AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: "true", AWS_PAGER: "", AWS_MAX_ATTEMPTS: "3", AWS_RETRY_MODE: "standard" }
    });
    return JSON.parse(result.stdout);
  } catch {
    signal?.throwIfAborted();
    throw new Error(`S3 ${args[1]} failed. Check the backup runner credential, network and bucket policy.`);
  }
}

async function fileProof(path, expected) {
  const info = await lstat(path);
  assert(info.isFile() && info.size > 0 && info.size <= 5 * 1024 ** 3, "Backup upload requires a regular file between 1 byte and 5 GiB.");
  const sha256 = await sha256File(path);
  if (expected) assert(info.size === expected.bytes && sha256 === expected.sha256, "Backup bundle file does not match its authenticated manifest.");
  return { path, bytes: info.size, sha256, checksum: Buffer.from(sha256, "hex").toString("base64") };
}

export async function publishBackupBundle(archive, { config = s3BackupConfiguration(), key, sourceHash, signal, request = awsJson } = {}) {
  signal?.throwIfAborted();
  const manifestPath = `${archive}.manifest.json`;
  const manifest = await privateJson(manifestPath);
  assert(verifyBackupManifestAuthentication(manifest, key), "S3 publication requires an authenticated manifest.");
  assert(manifest.manifestVersion === 2 && manifest.source?.operationsSourceHash === sourceHash && /^[a-f0-9]{64}$/.test(sourceHash ?? "") && manifest.source?.tableDigests, "Backup source identity does not match this runner.");
  assert(/^[a-zA-Z0-9_-]+\.jitm-backup\.enc$/.test(basename(archive)) && manifest.archive?.file === basename(archive), "Backup archive filename is invalid.");
  assert(manifest.recoveryState?.version === 1 && manifest.recoveryState.file === `${basename(archive)}.recovery-state.enc`, "S3 publication requires the complete recovery bundle.");
  assert(Number.isFinite(Date.parse(manifest.createdAt)), "Backup capture time is invalid.");
  // Validate every local file before starting an upload. The private staging
  // directory belongs to this invocation and is not modified during publication.
  const files = [
    await fileProof(archive, manifest.archive),
    await fileProof(`${archive}.recovery-state.enc`, manifest.recoveryState),
    await fileProof(manifestPath)
  ];
  const objects = [];
  for (const file of files) {
    signal?.throwIfAborted();
    const objectKey = `${config.prefix}${basename(file.path)}`;
    const target = ["--bucket", config.bucket, "--key", objectKey, "--expected-bucket-owner", config.owner, "--region", config.region];
    await request(["s3api", "put-object", ...target, "--body", file.path, "--if-none-match", "*", "--server-side-encryption", "AES256", "--checksum-algorithm", "SHA256", "--checksum-sha256", file.checksum], { signal });
    const stored = await request(["s3api", "head-object", ...target, "--checksum-mode", "ENABLED"], { signal });
    assert(stored.ContentLength === file.bytes && stored.ChecksumSHA256 === file.checksum && stored.ServerSideEncryption === "AES256", "Stored backup verification failed.");
    objects.push({ key: objectKey, bytes: file.bytes, sha256: file.sha256 });
  }
  // The authenticated manifest is uploaded last, only after both encrypted
  // files passed S3 checksum verification. Incomplete attempts expire normally;
  // this credential never needs object deletion or overwrite permission.
  return { status: "stored", bucket: config.bucket, createdAt: manifest.createdAt, sourceHash, manifestKey: objects[2].key, objects };
}
