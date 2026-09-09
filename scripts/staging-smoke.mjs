import "dotenv/config";
import { runCommand } from "./lib/postgres-ops.mjs";
import { sendOpsAlert } from "./lib/ops-alert.mjs";

async function main() {
  if (!process.env.STAGING_BASE_URL?.trim()) throw new Error("STAGING_BASE_URL is required.");
  if (!process.env.STAGING_SMOKE_USER_EMAIL?.trim() || !process.env.STAGING_SMOKE_USER_PASSWORD?.trim()) {
    throw new Error("STAGING_SMOKE_USER_EMAIL and STAGING_SMOKE_USER_PASSWORD are required.");
  }
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  await runCommand(executable, ["playwright", "test", "--config=playwright.staging.config.ts"]);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Staging smoke failed: ${message}`);
  await sendOpsAlert({
    title: "Production-like staging smoke failed",
    summary: "The staging smoke checks failed. Review the restricted CI result.",
    details: { command: "smoke:staging", target: process.env.STAGING_BASE_URL ?? null }
  });
  process.exitCode = 1;
});
