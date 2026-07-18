import "dotenv/config";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { decryptFile, sha256File } from "./lib/backup-archive.mjs";
import {
  assertDatabaseEmpty,
  collectDatabaseSnapshot,
  commandVersion,
  compareSnapshots,
  databaseIdentity,
  postgresCliEnv,
  runCommand,
  sameDatabase
} from "./lib/postgres-ops.mjs";
import { sendOpsAlert } from "./lib/ops-alert.mjs";

function argument(name) {
  const direct = process.argv.find((item) => item.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function loadManifest(path) {
  const raw = await readFile(path, "utf8");
  const manifest = JSON.parse(raw);
  if (manifest?.manifestVersion !== 1 || !manifest?.archive?.sha256 || !manifest?.source) {
    throw new Error("Backup manifest is missing required version, checksum, or source snapshot fields.");
  }
  return manifest;
}

async function main() {
  const archiveInput = argument("--input");
  if (!archiveInput) throw new Error("Pass the encrypted archive with --input <path>.");
  const archivePath = resolve(archiveInput);
  await access(archivePath);

  const targetUrl = process.env.RESTORE_DATABASE_URL?.trim();
  if (!targetUrl) throw new Error("RESTORE_DATABASE_URL is required. Database credentials are not accepted as command-line arguments.");
  if (process.env.DATABASE_URL && sameDatabase(process.env.DATABASE_URL, targetUrl)) {
    throw new Error("Restore target must be a different database from DATABASE_URL. In-place production restores are intentionally blocked.");
  }
  const target = databaseIdentity(targetUrl);

  const manifestFile = resolve(argument("--manifest") ?? `${archivePath}.manifest.json`);
  const manifest = await loadManifest(manifestFile);
  const checksum = await sha256File(archivePath);
  if (checksum !== manifest.archive.sha256) {
    throw new Error("Encrypted archive checksum does not match its manifest.");
  }

  await assertDatabaseEmpty(targetUrl);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "jitm-restore-"));
  const rawDumpPath = join(temporaryDirectory, "database.dump");
  try {
    const pgRestoreVersion = await commandVersion("pg_restore");
    await decryptFile(archivePath, rawDumpPath);
    await runCommand("pg_restore", [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      rawDumpPath
    ], { env: postgresCliEnv(targetUrl) });

    const restored = await collectDatabaseSnapshot(targetUrl);
    const differences = compareSnapshots(manifest.source, restored);
    if (differences.length) {
      throw new Error(`Restored database did not match the backup manifest: ${differences.join("; ")}`);
    }

    console.log(JSON.stringify({
      status: "ok",
      targetDatabase: target.database,
      targetSchema: target.schema,
      tableCount: restored.tableCount,
      appliedMigrations: restored.appliedMigrationNames.length,
      pgRestoreVersion,
      manifestVerified: true
    }, null, 2));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Restore failed: ${message}`);
  await sendOpsAlert({
    title: "Database restore failed",
    summary: message,
    details: { command: "db:restore" }
  });
  process.exitCode = 1;
});
