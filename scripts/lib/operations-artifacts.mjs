import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { databaseIdentity } from "./postgres-ops.mjs";

export function operationsSourceHash(databaseUrl) {
  const source = databaseIdentity(databaseUrl);
  return createHash("sha256").update(JSON.stringify([source.host, source.port, source.database, source.schema])).digest("hex");
}
export async function privateJson(path, maxBytes = 2 * 1024 * 1024) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error("Invalid operations artifact.");
    // Read through the same descriptor; symlinks and oversized files are rejected.
    const bytes = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await file.read(bytes, 0, maxBytes + 1, 0);
    if (bytesRead > maxBytes) throw new Error("Invalid operations artifact.");
    return JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
  } finally { await file.close(); }
}
export async function writeOperationsReceipt(path, receipt) {
  if (!path) return;
  const target = resolve(path), temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const file = await open(temporary, "wx", 0o600);
  try {
    try { await file.writeFile(JSON.stringify(receipt)); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}
export async function readOperationsArtifactAges(databaseUrl, now = new Date(), source = process.env) {
  const sourceHash = operationsSourceHash(databaseUrl);
  async function age(path, kind) {
    if (!path) return null;
    try {
      const receipt = await privateJson(path, 16 * 1024);
      const time = new Date(receipt.completedAt).getTime();
      if (receipt.version !== 1 || receipt.kind !== kind || receipt.sourceHash !== sourceHash || !Number.isFinite(time) || time > now.getTime() + 300_000) return null;
      if (kind === "backup") {
        if (typeof receipt.archivePath !== "string" || typeof receipt.manifestPath !== "string" || !/^[a-f0-9]{64}$/.test(receipt.archiveSha256)) return null;
        const manifest = await privateJson(receipt.manifestPath);
        const archive = await stat(receipt.archivePath);
        if (!archive.isFile() || archive.size !== manifest.archive?.bytes || manifest.archive?.sha256 !== receipt.archiveSha256 || manifest.manifestVersion !== 2 || manifest.source?.operationsSourceHash !== sourceHash || !manifest.source?.tableDigests) return null;
        const manifestTime = new Date(manifest.createdAt).getTime();
        if (!Number.isFinite(manifestTime) || Math.abs(manifestTime - time) > 300_000) return null;
      } else if (receipt.contentVerified !== true || receipt.foreignKeysVerified !== true || !/^[a-f0-9]{64}$/.test(receipt.archiveSha256)) return null;
      return Math.max(0, now.getTime() - time) / 3600_000;
    } catch { return null; }
  }
  const [backupAgeHours, restoreHours] = await Promise.all([age(source.OPS_BACKUP_RECEIPT_FILE, "backup"), age(source.OPS_RESTORE_RECEIPT_FILE, "restore")]);
  return { backupAgeHours, restoreAgeDays: restoreHours === null ? null : restoreHours / 24 };
}
