import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parse } from "dotenv";

const root = resolve(import.meta.dirname, "..");
const environmentPath = resolve(root, process.env.PILOT_ENV_FILE || ".env");
const backupsPath = resolve(root, ".backups");
const composeArguments = ["compose", "--env-file", environmentPath, "-f", "docker-compose.yml", "-f", "compose.pilot.yml"];

function fail(message) {
  console.error(`Pilot command failed: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function compose(args) {
  run("docker", [...composeArguments, ...args]);
}

function composeResult(args) {
  return spawnSync("docker", [...composeArguments, ...args], {
    cwd: root,
    encoding: "utf8",
    shell: false
  });
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function waitForHealthEndpoint(path, label) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const result = composeResult(["exec", "-T", "web", "curl", "-fsS", `http://localhost:3000${path}`]);
    if (result.status === 0) {
      console.log(`${label}: ${result.stdout.trim()}`);
      return;
    }
    if (attempt < 60) wait(2_000);
  }
  fail(`${label} did not become ready within 120 seconds. Run npm run pilot:logs.`);
}

function replaceSetting(content, name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "mu");
  return pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
}

function readEnvironment() {
  if (!existsSync(environmentPath)) fail(`${environmentPath} is missing. Run npm run pilot:init first.`);
  return { ...parse(readFileSync(environmentPath)), ...process.env };
}

function validateEnvironment({ requireBackup = false, requireRestore = false } = {}) {
  const values = readEnvironment();
  const weak = /^(?:change[-_ ]?me|generate[-_ ]?me|jitm|password|secret|example)$/iu;
  const required = [
    ["POSTGRES_PASSWORD", 16],
    ["AUTH_RATE_LIMIT_SECRET", 32],
    ["DATA_ENCRYPTION_KEY", 32]
  ];
  if (requireBackup) required.push(["BACKUP_ENCRYPTION_KEY", 32]);
  for (const [name, minimum] of required) {
    const value = values[name]?.trim() ?? "";
    if (value.length < minimum || weak.test(value)) fail(`${name} must be a unique value with at least ${minimum} characters.`);
  }
  if (values.PILOT_MODE?.toLowerCase() !== "true") fail("PILOT_MODE must be true.");
  if (values.DEMO_MODE?.toLowerCase() !== "false") fail("DEMO_MODE must be false.");
  if (requireRestore && !values.RESTORE_DATABASE_URL?.trim()) {
    fail("RESTORE_DATABASE_URL must point to a separate, empty PostgreSQL database.");
  }
  return values;
}

function initialize() {
  if (existsSync(environmentPath)) fail(".env already exists. It was not changed.");
  copyFileSync(resolve(root, ".env.example"), environmentPath);
  let content = readFileSync(environmentPath, "utf8");
  const databasePassword = randomBytes(24).toString("hex");
  const settings = {
    NODE_ENV: "production",
    PILOT_MODE: "true",
    APP_URL: "http://127.0.0.1:3000",
    AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
    DATA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    DEMO_MODE: "false",
    DEMO_USER_EMAIL: "",
    DEMO_USER_PASSWORD: "",
    RESET_DEMO_DATA: "false",
    POSTGRES_PASSWORD: databasePassword,
    DATABASE_URL: `postgresql://jitm:${databasePassword}@localhost:5432/jitm?schema=public`,
    BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("hex")
  };
  for (const [name, value] of Object.entries(settings)) content = replaceSetting(content, name, value);
  writeFileSync(environmentPath, content, { encoding: "utf8", mode: 0o600, flag: "w" });
  try { chmodSync(environmentPath, 0o600); } catch { /* Windows applies its own ACLs. */ }
  console.log(`Created ${environmentPath} with unique pilot secrets. No account credentials were generated.`);
  console.log("Run npm run pilot:up, then open /register to create the one owner account.");
}

function backup() {
  validateEnvironment({ requireBackup: true });
  compose(["--profile", "ops", "run", "--rm", "--build", "operations", "npm", "run", "db:backup"]);
}

function restore() {
  validateEnvironment({ requireBackup: true, requireRestore: true });
  const input = process.argv.slice(3).find((item) => !item.startsWith("--"));
  if (!input) fail("Pass a backup filename from .backups after --, plus --confirm=RESTORE.");
  if (!process.argv.slice(3).includes("--confirm=RESTORE")) {
    fail("Restore requires --confirm=RESTORE. It only restores into the separate empty RESTORE_DATABASE_URL target.");
  }
  const archive = resolve(backupsPath, input);
  if (!archive.startsWith(`${backupsPath}\\`) && !archive.startsWith(`${backupsPath}/`)) fail("The backup must be inside .backups.");
  if (!existsSync(archive) || !existsSync(`${archive}.manifest.json`)) fail("The encrypted backup or adjacent manifest is missing.");
  compose(["--profile", "ops", "run", "--rm", "--build", "operations", "npm", "run", "db:restore", "--", "--input", `/backups/${basename(archive)}`]);
}

function health() {
  validateEnvironment();
  compose(["ps", "-a"]);
  waitForHealthEndpoint("/api/health/ready", "Web readiness");
  waitForHealthEndpoint("/api/health/worker", "Worker readiness");
  compose(["run", "--rm", "--no-deps", "setup", "npx", "prisma", "migrate", "status"]);
}

function upgrade() {
  validateEnvironment({ requireBackup: true });
  console.log("Creating the required pre-upgrade backup...");
  backup();
  compose(["build", "--pull", "setup", "web", "worker"]);
  compose(["run", "--rm", "setup"]);
  compose(["up", "-d", "--no-deps", "--force-recreate", "web", "worker"]);
  health();
  console.log("Upgrade checks passed. Retain the pre-upgrade backup until the pilot has been exercised.");
}

function resetPassword() {
  validateEnvironment();
  const email = process.argv.slice(3).find((item) => !item.startsWith("--"));
  if (!email) fail("Pass the owner's email after --, for example: npm run pilot:reset-password -- owner@example.com");
  compose(["--profile", "ops", "run", "--rm", "--build", "operations", "npx", "tsx", "scripts/issue-password-reset-link.ts", email]);
}

const command = process.argv[2];
switch (command) {
  case "init": initialize(); break;
  case "up":
    validateEnvironment({ requireBackup: true });
    compose(["up", "-d", "--build", "postgres", "setup", "web", "worker"]);
    health();
    break;
  case "down": compose(["down", "--remove-orphans"]); break;
  case "status": compose(["ps", "-a"]); break;
  case "logs": compose(["logs", "--tail=200", "-f", "postgres", "setup", "web", "worker"]); break;
  case "backup": backup(); break;
  case "restore": restore(); break;
  case "health": health(); break;
  case "upgrade": upgrade(); break;
  case "reset-password": resetPassword(); break;
  default: fail("Choose init, up, down, status, logs, backup, restore, health, upgrade, or reset-password.");
}
