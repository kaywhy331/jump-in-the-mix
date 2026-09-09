import "dotenv/config";
import { open, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { sha256File } from "./lib/backup-archive.mjs";
import { readBackupRecoveryState } from "./lib/recovery-bundle.mjs";
import { privateJson } from "./lib/operations-artifacts.mjs";
import { applySourceCutoff, prepareSourceCutoff, resumePendingSource, verifySourceCutoff } from "./lib/recovery-cutoff.mjs";
import { targetRecoveryCutoff } from "./lib/recovery-target-cutoff.mjs";

const stop = new AbortController(), interrupt = () => stop.abort();
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
function argument(name) {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--")) throw new Error("A required command argument is missing.");
  return value;
}
async function main() {
  const sourceUrl = process.env.DATABASE_URL?.trim(), output = argument("--output"), apply = process.argv.includes("--apply"), verify = process.argv.includes("--verify"), resume = process.argv.includes("--resume-source"), bind = process.argv.includes("--bind-target"), verifyTarget = process.argv.includes("--verify-target");
  if (!sourceUrl || !output || [apply, verify, resume, bind, verifyTarget].filter(Boolean).length > 1) throw new Error("Configure the source identity, operation and a new private output path.");
  const targetUrl = process.env.RESTORE_DATABASE_URL?.trim();
  if ((bind || verifyTarget) && !targetUrl) throw new Error("Configure a separate held restore target.");
  let receipt, state, manifest, plan;
  if (verify || bind || verifyTarget) receipt = (await privateJson(resolve(argument("--receipt") ?? ""))).receipt;
  else if (resume) plan = await privateJson(resolve(argument("--plan") ?? ""));
  else {
    const archive = resolve(argument("--input") ?? "");
    manifest = await privateJson(`${archive}.manifest.json`);
    state = await readBackupRecoveryState(archive, manifest, undefined, { signal: stop.signal });
    if (await sha256File(archive) !== manifest.archive.sha256) throw new Error("The complete encrypted archive is required.");
    if (apply) plan = await privateJson(resolve(argument("--plan") ?? ""));
  }
  const path = resolve(output), file = await open(path, "wx", 0o600); let complete = false;
  try {
    const options = { operator: argument("--operator"), reason: argument("--reason"), signal: stop.signal };
    let result;
    if (bind || verifyTarget) result = await targetRecoveryCutoff(sourceUrl, targetUrl, receipt, { ...options, verifyOnly: verifyTarget });
    else if (verify) result = await verifySourceCutoff(sourceUrl, receipt, options);
    else if (resume) result = await resumePendingSource(sourceUrl, plan, options);
    else if (apply) result = await applySourceCutoff(sourceUrl, state, manifest, plan, options);
    else result = await prepareSourceCutoff(sourceUrl, state, manifest, options);
    await file.writeFile(JSON.stringify(result, null, 2)); await file.sync(); complete = true;
    console.log(JSON.stringify({ status: result.status ?? "plan-ready", applicationReady: false, releaseAllowed: false }));
  } finally { await file.close(); if (!complete) await rm(path, { force: true }); }
}
main().catch(() => {
  console.error("Source finalization did not finish reporting success. The source may now reject connections. Keep services stopped and inspect its cutoff metadata through the maintenance database. Retry the same plan with a new output path only to retrieve a committed receipt; a pending marker requires operator recovery. No target reopening is authorized.");
  process.exitCode = stop.signal.aborted ? 130 : 1;
}).finally(() => { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt); });
