import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import {
  adminDatabaseUrl,
  databaseIdentity,
  databaseUrlWithDatabase,
  postgresCliUrl,
  quoteIdentifier,
  runCommand
} from "./lib/postgres-ops.mjs";
import { sendOpsAlert } from "./lib/ops-alert.mjs";

async function main() {
  const sourceUrl = process.env.DATABASE_URL?.trim();
  if (!sourceUrl) throw new Error("DATABASE_URL is required for the backup/restore rehearsal.");
  if (!process.env.BACKUP_ENCRYPTION_KEY?.trim()) throw new Error("BACKUP_ENCRYPTION_KEY is required for the backup/restore rehearsal.");

  const source = databaseIdentity(sourceUrl);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const targetDatabase = `jitm_restore_${suffix}`;
  const targetUrl = databaseUrlWithDatabase(sourceUrl, targetDatabase, source.schema);
  const artifactsDirectory = resolve(".artifacts", "backup-restore");
  const archivePath = resolve(artifactsDirectory, `rehearsal-${suffix}.jitm-backup.enc`);
  const keepArtifacts = process.env.KEEP_BACKUP_ARTIFACT === "1";
  await mkdir(artifactsDirectory, { recursive: true });

  const admin = new Client({ connectionString: postgresCliUrl(adminDatabaseUrl(sourceUrl)) });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(targetDatabase)} TEMPLATE template0`);
    await runCommand(process.execPath, ["scripts/backup-database.mjs", "--output", archivePath, "--retention-days", "0"]);
    await runCommand(process.execPath, [
      "scripts/restore-database.mjs",
      "--input",
      archivePath
    ], { env: { RESTORE_DATABASE_URL: targetUrl } });
    await runCommand(process.execPath, [
      "scripts/smoke-restored-database.mjs"
    ], { env: { RESTORE_DATABASE_URL: targetUrl } });

    console.log(JSON.stringify({
      status: "ok",
      sourceDatabase: source.database,
      restoredDatabase: targetDatabase,
      archive: archivePath,
      artifactsRetained: keepArtifacts
    }, null, 2));
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(targetDatabase)} WITH (FORCE)`).catch(() => undefined);
    await admin.end().catch(() => undefined);
    if (!keepArtifacts) {
      await rm(archivePath, { force: true });
      await rm(`${archivePath}.manifest.json`, { force: true });
    }
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Backup/restore rehearsal failed: ${message}`);
  await sendOpsAlert({
    title: "Backup/restore rehearsal failed",
    summary: message,
    details: { command: "db:rehearse-restore" }
  });
  process.exitCode = 1;
});
