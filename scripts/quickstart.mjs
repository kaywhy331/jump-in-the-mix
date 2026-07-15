import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const command = process.platform === "win32" ? "powershell.exe" : "bash";
const args = process.platform === "win32"
  ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve(root, "start-local.ps1")]
  : [resolve(root, "start-local.sh")];

const result = spawnSync(command, args, {
  cwd: root,
  stdio: "inherit",
  shell: false
});

if (result.error) {
  console.error(`Unable to run the local launcher: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
