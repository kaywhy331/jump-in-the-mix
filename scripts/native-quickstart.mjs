import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.error) {
    console.error(`Unable to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Jump in the Mix native setup\n");
console.log("This path is for developers who already have PostgreSQL running.");
console.log("For the easiest installation, stop here and use start-local.cmd or start-local.sh with Docker.\n");

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  const content = readFileSync(".env", "utf8").replace(
    "DATA_ENCRYPTION_KEY=GENERATE_ME",
    `DATA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`
  );
  writeFileSync(".env", content);
  console.log("Created .env with a secure local encryption key.");
}

const envText = readFileSync(".env", "utf8");
if (!/^DATABASE_URL=postgresql:\/\//m.test(envText)) {
  console.error("DATABASE_URL is missing from .env. Add a PostgreSQL connection string, then rerun this command.");
  process.exit(1);
}

run("npm", ["install"]);
run("npm", ["run", "db:setup"]);

console.log("\nSetup complete. Start these in two terminals:\n");
console.log("  npm run dev");
console.log("  npm run dev:worker\n");
console.log("Then open http://localhost:3000/login?firstRun=1");
