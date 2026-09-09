import "dotenv/config";
import { open, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { privateJson } from "./lib/operations-artifacts.mjs";
import { applyRecoveryRelease, prepareRecoveryRelease } from "./lib/recovery-release.mjs";

const stop = new AbortController(), interrupt = () => stop.abort();
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
function argument(name) {
  const i = process.argv.indexOf(name), value = process.argv[i + 1];
  if (i < 0 || !value || value.startsWith("--")) throw new Error("A required command argument is missing.");
  return value;
}
async function main() {
  const sourceUrl = process.env.DATABASE_URL?.trim(), targetUrl = process.env.RESTORE_DATABASE_URL?.trim();
  if (!sourceUrl || !targetUrl) throw new Error("Configure the source and separate restore target.");
  const applying = process.argv.includes("--apply"), source = await privateJson(resolve(argument("--receipt")));
  const output = resolve(argument("--output")), files = [];
  let complete = false;
  try {
    // Reserve every output before preparing credentials or committing changes.
    files.push({ path: output, file: await open(output, "wx", 0o600) });
    if (!applying) {
      const path = resolve(argument("--enrollment-output"));
      files.push({ path, file: await open(path, "wx", 0o600) });
    }
    let result;
    if (applying) {
      const plan = await privateJson(resolve(argument("--plan")));
      const verification = await privateJson(resolve(argument("--verification-file")), 1024);
      if (verification.planId !== plan.id || typeof verification.code !== "string") throw new Error("The authenticator verification must identify this plan.");
      result = await applyRecoveryRelease(sourceUrl, targetUrl, source.receipt, plan, { mfaCode: verification.code, operator: argument("--operator"), reason: argument("--reason"), signal: stop.signal });
      await files[0].file.writeFile(JSON.stringify(result, null, 2));
    } else {
      result = await prepareRecoveryRelease(sourceUrl, targetUrl, source.receipt, { ownerEmail: argument("--owner-email"), signal: stop.signal });
      await files[0].file.writeFile(JSON.stringify(result.plan, null, 2));
      await files[1].file.writeFile(JSON.stringify(result.enrollment, null, 2));
    }
    for (const { file } of files) await file.sync();
    complete = true;
    console.log(JSON.stringify({ status: result.status ?? "release-plan-ready", readinessVerified: false }));
  } finally {
    for (const { file, path } of files) { await file.close(); if (!complete) await rm(path, { force: true }); }
  }
}
main().catch(() => {
  console.error("Recovery reopening did not finish reporting success. Keep services stopped and inspect the target hold and release receipt. Retry the same reviewed plan with a new output path to retrieve a committed receipt. Credentials and account details are never printed.");
  process.exitCode = stop.signal.aborted ? 130 : 1;
}).finally(() => { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt); });
