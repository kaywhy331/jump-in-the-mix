import "dotenv/config";
import { loadOptions, readLoadAccounts, runLoadProbe } from "./lib/load-probe.mjs";
import { sendOpsAlert } from "./lib/ops-alert.mjs";

async function main() {
  const options = loadOptions();
  const accounts = options.mode === "customer" ? await readLoadAccounts(process.env.LOAD_SMOKE_ACCOUNTS_FILE, options.origin) : [];
  const report = await runLoadProbe(options, accounts);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) throw new Error(report.failures.join(" "));
}

main().catch(async error => {
  console.error(`Load smoke failed: ${error instanceof Error ? error.message : "Probe failed."}`);
  await sendOpsAlert({ title: "Bounded load smoke failed", summary: "The bounded load probe failed. Review the restricted probe result.", details: { command: "load:smoke" } });
  process.exitCode = 1;
});
