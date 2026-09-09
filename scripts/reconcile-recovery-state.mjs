import "dotenv/config";
import { open, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { operationsSourceHash, privateJson } from "./lib/operations-artifacts.mjs";
import { sameDatabase } from "./lib/postgres-ops.mjs";
import { readRecoveryState } from "./lib/recovery-state.mjs";
import { applyRestrictionPlan, prepareRestrictionPlan } from "./lib/recovery-restrictions.mjs";

const stop = new AbortController(), interrupt = () => stop.abort();
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
function argument(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
async function main() {
  const input = argument("--state"), manifestPath = argument("--backup-manifest"), output = argument("--output"), apply = process.argv.includes("--apply");
  const sourceUrl = process.env.DATABASE_URL?.trim(), targetUrl = process.env.RESTORE_DATABASE_URL?.trim();
  if (!input || !manifestPath || !output || !sourceUrl || !targetUrl || sameDatabase(sourceUrl, targetUrl)) throw new Error("Configure separate source/target identities and evidence/output paths.");
  const current = await readRecoveryState(resolve(input), undefined, { signal: stop.signal });
  if (current.sourceHash !== operationsSourceHash(sourceUrl)) throw new Error("The source identity does not match recovery state.");
  const manifest = await privateJson(resolve(manifestPath));
  const plan = apply ? await privateJson(resolve(argument("--plan") ?? "")) : null;
  const path = resolve(output), file = await open(path, "wx", 0o600); let written = false;
  try {
    stop.signal.throwIfAborted();
    const result = apply
      ? await applyRestrictionPlan(targetUrl, current, manifest, plan, { operator: argument("--operator"), reason: argument("--reason"), signal: stop.signal })
      : await prepareRestrictionPlan(targetUrl, current, manifest, undefined, { signal: stop.signal });
    await file.writeFile(JSON.stringify(result, null, 2)); await file.sync(); written = true;
    console.log(JSON.stringify({ status: apply ? result.status : "plan-ready", applicationReady: false, releaseAllowed: false }));
  } finally { await file.close(); if (!written) await rm(path, { force: true }); }
}
main().catch(() => {
  console.error("Recovery correction did not finish reporting success. Keep the target isolated. Verify the authenticated plan, target clients, migration state and private output path. If apply was interrupted, retry the same plan with a new output path to check its committed receipt.");
  process.exitCode = stop.signal.aborted ? 130 : 1;
}).finally(() => { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt); });
