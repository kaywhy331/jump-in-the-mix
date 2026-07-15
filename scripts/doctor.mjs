import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function command(name, args) {
  return spawnSync(name, args, {
    encoding: "utf8",
    shell: process.platform === "win32"
  });
}

let failed = false;
function result(level, message) {
  const labels = { ok: "[OK]", info: "[INFO]", fail: "[FAIL]" };
  console.log(`${labels[level]} ${message}`);
  if (level === "fail") failed = true;
}

console.log("Jump in the Mix doctor\n");
result(Number(process.versions.node.split(".")[0]) >= 22 ? "ok" : "fail", `Node ${process.versions.node} (22+ required for native development)`);
result(existsSync("package.json") ? "ok" : "fail", "package.json present");
result(existsSync("prisma/schema.prisma") ? "ok" : "fail", "Prisma schema present");

if (existsSync(".env")) {
  result("ok", ".env present");
  const env = readFileSync(".env", "utf8");
  result(env.includes("DATA_ENCRYPTION_KEY=GENERATE_ME") ? "fail" : "ok", "local encryption key configured");
} else {
  result("info", ".env is missing; the Docker launcher creates it automatically");
}

const docker = command("docker", ["info"]);
if (docker.error) {
  result("info", "Docker was not found; use native mode only if PostgreSQL is already installed");
} else if (docker.status === 0) {
  result("ok", "Docker engine is running");
  const compose = command("docker", ["compose", "config", "-q"]);
  result(compose.status === 0 ? "ok" : "fail", "Docker Compose configuration");
} else {
  result("info", "Docker is installed but is not running");
}

process.exitCode = failed ? 1 : 0;
