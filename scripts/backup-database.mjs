import "dotenv/config";
import { mkdir, mkdtemp, open, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { encryptFile, sha256File } from "./lib/backup-archive.mjs";
import {
  commandVersion,
  databaseIdentity,
  postgresCliEnv,
  quoteIdentifier,
  runCommand,
  withDatabaseSnapshot
} from "./lib/postgres-ops.mjs";
import { operationsSourceHash, writeOperationsReceipt } from "./lib/operations-artifacts.mjs";
import { sendOpsAlert } from "./lib/ops-alert.mjs";
import { authenticateBackupManifest } from "./lib/backup-manifest.mjs";
import { recoveryHoldQuery } from "../src/lib/recovery-hold-query.mjs";
import { captureRecoveryStateInTransaction, writeRecoveryState } from "./lib/recovery-state.mjs";
import { backupRecoveryStatePath, recoveryBundleDescriptor } from "./lib/recovery-bundle.mjs";

const stop = new AbortController(), interrupt = () => stop.abort();
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);

async function publish(source, destination, owned) {
  stop.signal.throwIfAborted();
  const file = await open(destination, "wx", 0o600); owned.push(destination);
  try {
    for await (const chunk of createReadStream(source, { signal: stop.signal })) {
      stop.signal.throwIfAborted(); await file.writeFile(chunk);
    }
    await file.sync();
  } finally { await file.close(); }
}

function argument(name) {
  const direct = process.argv.find((item) => item.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function timestampName() {
  return new Date().toISOString().replaceAll(/[-:.]/gu, "");
}

function manifestPath(archivePath) {
  return `${archivePath}.manifest.json`;
}

async function applyRetention(directory, retentionDays, currentArchive) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return [];
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const removed = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    stop.signal.throwIfAborted();
    if (!entry.isFile() || !entry.name.endsWith(".jitm-backup.enc")) continue;
    const archive = join(directory, entry.name);
    if (resolve(archive) === resolve(currentArchive)) continue;
    const details = await stat(archive);
    if (details.mtimeMs >= cutoff) continue;
    stop.signal.throwIfAborted();
    await unlink(archive);
    await rm(manifestPath(archive), { force: true });
    await rm(backupRecoveryStatePath(archive), { force: true });
    removed.push(entry.name);
  }
  return removed;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const backupDirectory = resolve(argument("--directory") ?? process.env.BACKUP_DIR ?? ".backups");
  const outputPath = resolve(
    argument("--output") ?? join(backupDirectory, `jump-in-the-mix-${timestampName()}.jitm-backup.enc`)
  );
  const retentionDays = Number(argument("--retention-days") ?? process.env.BACKUP_RETENTION_DAYS ?? "30");
  const identity = databaseIdentity(databaseUrl);
  const withRecovery = process.argv.includes("--with-recovery-state");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "jitm-backup-"));
  const rawDumpPath = join(temporaryDirectory, "database.dump");
  const encryptedDumpPath = join(temporaryDirectory, "database.enc");
  const encryptedStatePath = join(temporaryDirectory, "state.enc");
  const stagedManifestPath = join(temporaryDirectory, "manifest.json");
  const published = []; let complete = false;

  try {
    const pgDumpVersion = await commandVersion("pg_dump");
    let state;
    const source = await withDatabaseSnapshot(databaseUrl, async ({ client, snapshot, snapshotId }) => {
      if ((await client.query(recoveryHoldQuery)).rows.length) throw new Error("The source has a recovery hold. It cannot replace live backup evidence.");
      if (!snapshot.tableCount) throw new Error("Source database contains no application tables.");
      if (snapshot.failedMigrationCount) throw new Error(`Source database has ${snapshot.failedMigrationCount} unfinished migration(s).`);
      if (withRecovery) state = await captureRecoveryStateInTransaction(client, databaseUrl, { signal: stop.signal });
      await runCommand("pg_dump", [
        "--format=custom", "--no-owner", "--no-privileges", "--compress=6",
        "--schema", quoteIdentifier(identity.schema), "--strict-names",
        "--snapshot", snapshotId, "--file", rawDumpPath
      ], { env: postgresCliEnv(databaseUrl), signal: stop.signal });
      return snapshot;
    }, { signal: stop.signal, statementTimeout: 15_000 });

    const encryption = await encryptFile(rawDumpPath, encryptedDumpPath, undefined, { signal: stop.signal });
    const archiveStat = await stat(encryptedDumpPath);
    const checksum = await sha256File(encryptedDumpPath);
    const manifest = {
      manifestVersion: 2,
      createdAt: new Date().toISOString(),
      archive: {
        file: basename(outputPath),
        bytes: archiveStat.size,
        sha256: checksum,
        ...encryption
      },
      source: {
        ...source,
        operationsSourceHash: operationsSourceHash(databaseUrl),
        captureMethod: "exported-postgres-snapshot"
      },
      tooling: { pgDumpVersion }
    };
    if (state) {
      const proof = await writeRecoveryState(state, encryptedStatePath, undefined, { signal: stop.signal });
      manifest.recoveryState = recoveryBundleDescriptor(state, source, { file: basename(backupRecoveryStatePath(outputPath)), bytes: (await stat(encryptedStatePath)).size, sha256: proof.sha256 });
    }
    manifest.authentication = authenticateBackupManifest(manifest);
    await writeFile(stagedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
    await publish(encryptedDumpPath, outputPath, published);
    if (state) await publish(encryptedStatePath, backupRecoveryStatePath(outputPath), published);
    // The manifest is the final commit marker. A caught pre-publication failure
    // removes only this invocation's files, preserving every existing artifact.
    await publish(stagedManifestPath, manifestPath(outputPath), published);
    complete = true;
    stop.signal.throwIfAborted();
    const removed = await applyRetention(dirname(outputPath), retentionDays, outputPath);
    stop.signal.throwIfAborted();
    await writeOperationsReceipt(process.env.OPS_BACKUP_RECEIPT_FILE, { version: 1, kind: "backup", completedAt: manifest.createdAt, sourceHash: operationsSourceHash(databaseUrl), archivePath: outputPath, manifestPath: manifestPath(outputPath), archiveSha256: checksum });

    console.log(JSON.stringify({
      status: "ok",
      archive: outputPath,
      manifest: manifestPath(outputPath),
      ...(state ? { recoveryState: backupRecoveryStatePath(outputPath), snapshotMatched: true } : {}),
      bytes: archiveStat.size,
      sha256: checksum,
      removedByRetention: removed
    }, null, 2));
  } finally {
    if (!complete) for (const file of published.reverse()) await rm(file, { force: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Backup failed: ${message}`);
  if (!stop.signal.aborted) await sendOpsAlert({
    title: "Encrypted database backup failed",
    summary: "The encrypted backup command failed. Review its private runner logs.",
    details: { command: "db:backup" }
  });
  process.exitCode = stop.signal.aborted ? 130 : 1;
}).finally(() => { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt); });
