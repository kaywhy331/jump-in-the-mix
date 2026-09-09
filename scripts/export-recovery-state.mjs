import "dotenv/config";
import { resolve } from "node:path";
import { captureRecoveryState, writeRecoveryState } from "./lib/recovery-state.mjs";
import { parseBackupKey } from "./lib/backup-archive.mjs";
const stop = new AbortController();
const interrupt = () => stop.abort();
process.once("SIGTERM", interrupt); process.once("SIGINT", interrupt);

async function main() {
  const index = process.argv.indexOf("--output"), output = index >= 0 ? process.argv[index + 1] : undefined;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl || !output) throw new Error("Configure DATABASE_URL and BACKUP_ENCRYPTION_KEY; supply --output FILE.");
  parseBackupKey();
  const state = await captureRecoveryState(databaseUrl, { signal: stop.signal });
  const receipt = await writeRecoveryState(state, resolve(output), undefined, { signal: stop.signal });
  stop.signal.throwIfAborted();
  console.log(JSON.stringify({ status: "captured", ...receipt, continuousCoverage: false, applicationReady: false }));
}
main().catch(() => { console.error("Recovery state export failed. Verify the source, backup key, supported schema/size and a new private output path. No recovery hold was released."); process.exitCode = stop.signal.aborted ? 130 : 1; })
  .finally(() => { process.removeListener("SIGTERM", interrupt); process.removeListener("SIGINT", interrupt); });
