import "dotenv/config";
import { resolve } from "node:path";
import { runCommand, databaseIdentity } from "./lib/postgres-ops.mjs";
import { operationsSourceHash, privateJson, writeOperationsReceipt } from "./lib/operations-artifacts.mjs";
import { verifyBackupManifestAuthentication } from "./lib/backup-manifest.mjs";

async function main() {
  const inputIndex = process.argv.indexOf("--input");
  const input = inputIndex >= 0 ? process.argv[inputIndex + 1] : undefined;
  const sourceUrl = process.env.DATABASE_URL?.trim(), targetUrl = process.env.RESTORE_DATABASE_URL?.trim();
  if (!input || !sourceUrl || !targetUrl || !process.env.OPS_RESTORE_RECEIPT_FILE) throw new Error("Configure the source identity, separate loopback restore database and receipt file; supply --input ARCHIVE.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseIdentity(targetUrl).host)) throw new Error("Backup qualification requires a separate empty loopback restore database.");
  const archive = resolve(input), manifest = await privateJson(`${archive}.manifest.json`);
  const sourceHash = operationsSourceHash(sourceUrl);
  if (!verifyBackupManifestAuthentication(manifest)) throw new Error("Backup qualification requires an authenticated manifest.");
  if (manifest.manifestVersion !== 2 || manifest.source?.operationsSourceHash !== sourceHash || !manifest.source?.tableDigests) throw new Error("The backup manifest does not identify the configured source and content verification format.");
  await runCommand(process.execPath, ["scripts/restore-database.mjs", "--input", archive]);
  await runCommand(process.execPath, ["scripts/smoke-restored-database.mjs"]);
  await writeOperationsReceipt(process.env.OPS_RESTORE_RECEIPT_FILE, { version: 1, kind: "restore", completedAt: new Date().toISOString(), sourceHash, archiveSha256: manifest.archive.sha256, contentVerified: true, foreignKeysVerified: true });
  console.log(JSON.stringify({ status: "qualified", contentVerified: true, foreignKeysVerified: true, applicationReady: false, recovery: "held" }));
}
main().catch(() => { console.error("Backup qualification failed. Check the source manifest and isolated restore command output. No successful rehearsal receipt was recorded."); process.exitCode = 1; });
