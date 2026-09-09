import { spawn } from "node:child_process";

// This qualification kills child processes and interrupts their database
// connections. The test creates and drops only its own disposable database.
if (!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Worker qualification requires a disposable jitm_design_ database on loopback.");
}
const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/worker-runtime.integration.test.ts"], {
  env: { ...process.env, RUN_WORKER_UNATTENDED_TESTS: "true" }, stdio: "inherit"
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
