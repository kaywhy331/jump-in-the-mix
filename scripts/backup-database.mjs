import "dotenv/config";
import { mkdtemp, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
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
import { sendOpsAlert } from "./lib/ops-alert.mjs";

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
    if (!entry.isFile() || !entry.name.endsWith(".jitm-backup.enc")) continue;
    const archive = join(directory, entry.name);
    if (resolve(archive) === resolve(currentArchive)) continue;
    const details = await stat(archive);
    if (details.mtimeMs >= cutoff) continue;
    await unlink(archive);
    await unlink(manifestPath(archive)).catch(() => undefined);
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
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "jitm-backup-"));
  const rawDumpPath = join(temporaryDirectory, "database.dump");

  try {
    const pgDumpVersion = await commandVersion("pg_dump");
    const source = await withDatabaseSnapshot(databaseUrl, async ({ snapshot, snapshotId }) => {
      if (!snapshot.tableCount) throw new Error("Source database contains no application tables.");
      if (snapshot.failedMigrationCount) throw new Error(`Source database has ${snapshot.failedMigrationCount} unfinished migration(s).`);
      await runCommand("pg_dump", [
        "--format=custom", "--no-owner", "--no-privileges", "--compress=6",
        "--schema", quoteIdentifier(identity.schema), "--strict-names",
        "--snapshot", snapshotId, "--file", rawDumpPath
      ], { env: postgresCliEnv(databaseUrl) });
      return snapshot;
    });

    const encryption = await encryptFile(rawDumpPath, outputPath);
    const archiveStat = await stat(outputPath);
    const checksum = await sha256File(outputPath);
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
        captureMethod: "exported-postgres-snapshot"
      },
      tooling: { pgDumpVersion }
    };
    await writeFile(manifestPath(outputPath), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    const removed = await applyRetention(dirname(outputPath), retentionDays, outputPath);

    console.log(JSON.stringify({
      status: "ok",
      archive: outputPath,
      manifest: manifestPath(outputPath),
      bytes: archiveStat.size,
      sha256: checksum,
      removedByRetention: removed
    }, null, 2));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Backup failed: ${message}`);
  await sendOpsAlert({
    title: "Encrypted database backup failed",
    summary: message,
    details: { command: "db:backup" }
  });
  process.exitCode = 1;
});
