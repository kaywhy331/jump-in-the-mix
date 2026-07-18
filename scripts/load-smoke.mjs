import "dotenv/config";
import { performance } from "node:perf_hooks";
import { sendOpsAlert } from "./lib/ops-alert.mjs";

function integerEnv(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function numberEnv(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function percentile(sortedValues, fraction) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * fraction) - 1));
  return sortedValues[index];
}

async function main() {
  const baseUrl = (process.env.LOAD_SMOKE_URL ?? process.env.STAGING_BASE_URL)?.trim();
  if (!baseUrl) throw new Error("LOAD_SMOKE_URL or STAGING_BASE_URL is required.");
  const url = new URL("/api/health/ready", baseUrl);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (!local && process.env.LOAD_TEST_ACKNOWLEDGE !== "true") {
    throw new Error("Set LOAD_TEST_ACKNOWLEDGE=true before running the bounded load probe against a non-local host.");
  }

  const durationSeconds = integerEnv("LOAD_SMOKE_DURATION_SECONDS", 15, 5, 300);
  const concurrency = integerEnv("LOAD_SMOKE_CONCURRENCY", 5, 1, 50);
  const maxErrorRate = numberEnv("LOAD_SMOKE_MAX_ERROR_RATE", 0.01, 0, 1);
  const maxP95Ms = numberEnv("LOAD_SMOKE_MAX_P95_MS", 1000, 1, 60_000);
  const maxRequests = integerEnv("LOAD_SMOKE_MAX_REQUESTS", 5000, 10, 100_000);
  const probeStartedAt = performance.now();
  const deadline = probeStartedAt + durationSeconds * 1000;
  const durations = [];
  const statuses = new Map();
  let completed = 0;
  let failed = 0;
  let startedRequests = 0;

  async function worker() {
    while (performance.now() < deadline && startedRequests < maxRequests) {
      startedRequests += 1;
      const started = performance.now();
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "jump-in-the-mix-load-smoke/1.0" },
          signal: AbortSignal.timeout(10_000),
          cache: "no-store"
        });
        const duration = performance.now() - started;
        durations.push(duration);
        completed += 1;
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
        if (!response.ok) failed += 1;
        await response.arrayBuffer();
      } catch {
        durations.push(performance.now() - started);
        completed += 1;
        failed += 1;
        statuses.set("network-error", (statuses.get("network-error") ?? 0) + 1);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedSeconds = Math.max((performance.now() - probeStartedAt) / 1000, 0.001);
  durations.sort((left, right) => left - right);
  const errorRate = completed ? failed / completed : 1;
  const report = {
    target: url.toString(),
    durationSeconds,
    concurrency,
    maxRequests,
    completed,
    failed,
    errorRate,
    elapsedSeconds,
    requestsPerSecond: completed / elapsedSeconds,
    latencyMs: {
      min: durations[0] ?? 0,
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      p99: percentile(durations, 0.99),
      max: durations.at(-1) ?? 0
    },
    statuses: Object.fromEntries(statuses)
  };
  console.log(JSON.stringify(report, null, 2));

  const failures = [];
  if (!completed) failures.push("no requests completed");
  if (errorRate > maxErrorRate) failures.push(`error rate ${(errorRate * 100).toFixed(2)}% exceeded ${(maxErrorRate * 100).toFixed(2)}%`);
  if (report.latencyMs.p95 > maxP95Ms) failures.push(`p95 ${report.latencyMs.p95.toFixed(1)}ms exceeded ${maxP95Ms}ms`);
  if (failures.length) throw new Error(failures.join("; "));
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Load smoke failed: ${message}`);
  await sendOpsAlert({
    title: "Bounded load smoke failed",
    summary: message,
    details: { command: "load:smoke" }
  });
  process.exitCode = 1;
});
