import "dotenv/config";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { Client } from "pg";
import { captureRecoveryState, compareRecoveryState, readRecoveryState } from "./lib/recovery-state.mjs";
import { verifyBackupManifestAuthentication } from "./lib/backup-manifest.mjs";
import { operationsSourceHash, privateJson } from "./lib/operations-artifacts.mjs";
import { postgresCliUrl, sameDatabase } from "./lib/postgres-ops.mjs";
import { readRecoveryHold } from "./lib/recovery-hold.mjs";
const stop = new AbortController();
const interrupt = () => stop.abort();
process.once("SIGTERM", interrupt); process.once("SIGINT", interrupt);

function argument(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
async function main() {
  const input = argument("--state"), backup = argument("--backup-manifest"), output = argument("--output");
  const sourceUrl = process.env.DATABASE_URL?.trim(), targetUrl = process.env.RESTORE_DATABASE_URL?.trim();
  if (!input || !backup || !output || !sourceUrl || !targetUrl || sameDatabase(sourceUrl, targetUrl)) throw new Error("Configure separate source and restore identities; supply state, backup manifest and a new private report path.");
  const manifest = await privateJson(resolve(backup));
  if (!verifyBackupManifestAuthentication(manifest)) throw new Error("An authenticated backup manifest is required.");
  const current = await readRecoveryState(resolve(input), undefined, { signal: stop.signal });
  if (current.sourceHash !== operationsSourceHash(sourceUrl)) throw new Error("Recovery state source differs from DATABASE_URL.");
  const client = new Client({ connectionString: postgresCliUrl(targetUrl), connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  await client.connect();
  let hold;
  try { hold = await readRecoveryHold(client); } finally { await client.end(); }
  if (!hold) throw new Error("The target must remain under a recovery hold.");
  const restored = await captureRecoveryState(targetUrl, { targetHold: hold, signal: stop.signal });
  const report = compareRecoveryState(current, restored, { hold, manifest });
  stop.signal.throwIfAborted();
  await writeFile(resolve(output), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ status: "review-required", recoveryId: hold.id, applicationReady: false, mutationsApplied: 0, releaseAllowed: false }));
}
main().catch(() => { console.error("Recovery review failed. Verify the authenticated source evidence, target hold, schema and a new private report path. No database changes or hold release were performed."); process.exitCode = stop.signal.aborted ? 130 : 1; })
  .finally(() => { process.removeListener("SIGTERM", interrupt); process.removeListener("SIGINT", interrupt); });
