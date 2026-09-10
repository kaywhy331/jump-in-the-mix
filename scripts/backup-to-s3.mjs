import "dotenv/config";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runCommand } from "./lib/postgres-ops.mjs";
import { operationsSourceHash } from "./lib/operations-artifacts.mjs";
import { parseBackupKey } from "./lib/backup-archive.mjs";
import { publishBackupBundle, s3BackupConfiguration } from "./lib/s3-backup-store.mjs";

const stop = new AbortController();
const interrupt = () => stop.abort();
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);

async function main() {
  const config = s3BackupConfiguration();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Configure DATABASE_URL for the backup source.");
  parseBackupKey();
  const sourceHash = operationsSourceHash(databaseUrl);
  const temporary = await mkdtemp(join(tmpdir(), "jitm-s3-backup-"));
  try {
    const name = `jump-in-the-mix-${new Date().toISOString().replaceAll(/[-:.]/gu, "")}-${randomUUID()}.jitm-backup.enc`;
    const archive = join(temporary, name);
    await runCommand(process.execPath, ["scripts/backup-database.mjs", "--with-recovery-state", "--output", archive, "--retention-days", "0"], {
      capture: true, signal: stop.signal,
      // A local capture does not establish offsite success. Let the scheduler
      // report failure; it must not send customer mail or reset monitor evidence.
      env: { OPS_BACKUP_RECEIPT_FILE: "", OPS_ALERT_WEBHOOK_URL: "" }
    });
    console.log(JSON.stringify(await publishBackupBundle(archive, { config, sourceHash, signal: stop.signal })));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch(() => {
  console.error("Scheduled encrypted backup failed; no successful offsite receipt was reported. Check runner configuration, database access and S3 permissions.");
  process.exitCode = stop.signal.aborted ? 130 : 1;
}).finally(() => { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt); });
