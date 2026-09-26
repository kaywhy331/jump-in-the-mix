import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

// Runs the given vitest arguments against a database created for this run alone, so suites that
// depend on an empty catalog (the first-owner bootstrap, for one) are not contaminated by whatever
// the shared local design database holds, such as the seeded browser-test administrator. The
// database is created from template0 next to the configured jitm_design_ database on loopback,
// migrated, used once, and dropped, whatever the outcome.
const configured = process.env.DATABASE_URL ?? "";
if (!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(configured)) {
  console.error("Isolated test execution needs a disposable jitm_design_ database on loopback in DATABASE_URL.");
  process.exit(1);
}
const database = `jitm_design_isolated_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const admin = new URL(configured); admin.pathname = "/postgres"; admin.search = "";
const isolated = new URL(configured); isolated.pathname = `/${database}`; isolated.search = "";
const client = new Client({ connectionString: admin.href });
await client.connect();
await client.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
let status = 1;
try {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: isolated.href }, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`Running vitest against isolated database ${database}.`);
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...process.argv.slice(2)], { env: { ...process.env, DATABASE_URL: isolated.href }, stdio: "inherit" });
  status = result.status ?? 1;
} finally {
  await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await client.end();
}
process.exit(status);
