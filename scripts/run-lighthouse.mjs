import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, readFile, readdir, copyFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, isDeepStrictEqual } from "node:util";

const require = createRequire(import.meta.url);
const { computeRepresentativeRuns } = require("@lhci/utils/src/representative-runs.js");
const metricIds = {
  lcp: "largest-contentful-paint", fcp: "first-contentful-paint",
  tbt: "total-blocking-time", cls: "cumulative-layout-shift"
};

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    min: sorted[0],
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    max: sorted.at(-1)
  };
}

// Completeness is separate from LHCI's budget assertions. In LHCI 0.15.1 an
// interrupted collect child can return a null status that autorun treats as 0.
export function summarizeReports(reports, collect, startedAt) {
  const errors = [];
  const urls = collect.url;
  const expectedCount = urls.length * collect.numberOfRuns;
  if (reports.length !== expectedCount) errors.push(`Expected ${expectedCount} reports; received ${reports.length}`);
  const seen = new Set();
  const routes = [];
  for (const report of reports) {
    const identity = `${report.requestedUrl} ${report.fetchTime}`;
    if (seen.has(identity)) errors.push(`Duplicate sample: ${identity}`);
    seen.add(identity);
    if (!urls.includes(report.requestedUrl)) errors.push(`Unexpected route: ${report.requestedUrl}`);
    if (!(Date.parse(report.fetchTime) >= Date.parse(startedAt))) errors.push(`Stale or undated sample: ${identity}`);
    if (report.runtimeError) errors.push(`Runtime error: ${identity}: ${report.runtimeError.code}`);
    if (report.finalDisplayedUrl !== report.requestedUrl) errors.push(`Unexpected navigation: ${identity}`);
    for (const key of ["throttlingMethod", "formFactor", "screenEmulation", "throttling", "disableStorageReset", "locale"]) {
      if (collect.settings[key] !== undefined && !isDeepStrictEqual(report.configSettings?.[key], collect.settings[key])) {
        errors.push(`Unexpected ${key}: ${identity}`);
      }
    }
    for (const id of Object.values(metricIds)) {
      if (!Number.isFinite(report.audits?.[id]?.numericValue)) errors.push(`Missing ${id}: ${identity}`);
    }
    for (const id of ["performance", "accessibility", "best-practices"]) {
      if (!Number.isFinite(report.categories?.[id]?.score)) errors.push(`Missing ${id} score: ${identity}`);
    }
    if (!Array.isArray(report.audits?.["network-requests"]?.details?.items)) errors.push(`Missing network evidence: ${identity}`);
    for (const request of report.audits?.["network-requests"]?.details?.items ?? []) {
      if (request.statusCode >= 400) errors.push(`HTTP ${request.statusCode}: ${request.url} (${identity})`);
    }
  }
  for (const url of urls) {
    const group = reports.filter(report => report.requestedUrl === url).sort((a, b) => a.fetchTime.localeCompare(b.fetchTime));
    if (group.length !== collect.numberOfRuns) errors.push(`${url}: expected ${collect.numberOfRuns} samples; received ${group.length}`);
    const [representative] = computeRepresentativeRuns([group.map(report => [report, report])]);
    const samples = group.map(report => ({
      fetchedAt: report.fetchTime,
      ...Object.fromEntries(Object.entries(metricIds).map(([key, id]) => [key, report.audits?.[id]?.numericValue ?? null])),
      performance: report.categories?.performance?.score ?? null,
      accessibility: report.categories?.accessibility?.score ?? null,
      bestPractices: report.categories?.["best-practices"]?.score ?? null,
      benchmarkIndex: report.environment?.benchmarkIndex,
      lighthouseVersion: report.lighthouseVersion,
      browser: report.environment?.hostUserAgent,
      settings: report.configSettings,
      warnings: report.runWarnings ?? [],
      lcpElement: report.audits?.["largest-contentful-paint-element"]?.details,
      representative: report === representative
    }));
    routes.push({
      url, samples,
      lcp: samples.length && samples.every(sample => Number.isFinite(sample.lcp)) ? distribution(samples.map(sample => sample.lcp)) : null,
      // LHCI median-run uses proximity to median FCP/interactive, not median LCP.
      assertedLcp: representative?.audits?.["largest-contentful-paint"]?.numericValue ?? null
    });
  }
  return { expectedCount, actualCount: reports.length, complete: errors.length === 0, errors, routes };
}

export function measurementExitCode(status, summary) {
  return status === 0 && summary.complete ? 0 : (status || 1);
}

export async function assertServerPortAvailable(collect) {
  if (!collect.startServerCommand) return;
  const origins = [...new Set(collect.url.map(url => new URL(url).origin))];
  if (origins.length !== 1) throw new Error("The Lighthouse app server requires one local origin");
  const url = new URL(origins[0]);
  if (url.hostname !== "127.0.0.1") throw new Error("The Lighthouse app server must use 127.0.0.1");
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", error => reject(new Error(`Lighthouse server port is unavailable (${url.origin}): ${error.code}`)));
    probe.listen(Number(url.port || 80), url.hostname, () => probe.close(resolve));
  });
}

export async function cleanupChromeProfiles(directory) {
  const cleaned = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("lighthouse.")) continue;
    const profile = path.join(directory, entry.name);
    const pid = Number(await readFile(path.join(profile, "chrome.pid"), "utf8").catch(() => ""));
    if (!Number.isInteger(pid) || pid <= 1) continue;
    // Chrome launches detached from LHCI. Verify the unique profile and process
    // group before signalling; never kill by browser name or a stale PID alone.
    if (process.platform !== "linux") throw new Error(`Check leftover Chrome profile manually: ${profile}`);
    const cmdline = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(error => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (!cmdline) continue;
    const statText = await readFile(`/proc/${pid}/stat`, "utf8").catch(error => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (!statText) continue;
    const stat = statText.split(") ").at(-1).split(" ");
    if (!cmdline.replaceAll("\0", " ").includes(`--user-data-dir=${profile} `) || Number(stat[2]) !== pid) {
      throw new Error(`Cannot verify Chrome ownership for ${profile}`);
    }
    try { process.kill(-pid, "SIGTERM"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
    let exited = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const state = await readFile(`/proc/${pid}/stat`, "utf8").catch(error => {
        if (error.code === "ENOENT") return "";
        throw error;
      });
      if (!state || state.split(") ").at(-1).startsWith("Z ")) { exited = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!exited) throw new Error(`Chrome ${pid} did not exit after cleanup`);
    cleaned.push({ pid, profile, exited });
  }
  return cleaned;
}

function hostSnapshot() {
  return { at: new Date().toISOString(), platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model,
    cpuCount: os.cpus().length, loadAverage: os.loadavg(), totalMemory: os.totalmem(), freeMemory: os.freemem() };
}

async function digest(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function main() {
  const { values } = parseArgs({ options: { config: { type: "string", default: ".lighthouserc.cjs" } } });
  const configPath = path.resolve(values.config);
  const config = require(configPath);
  const startedAt = new Date().toISOString();
  const outputDir = path.resolve(config.ci.upload.outputDir, startedAt.replace(/[:.]/g, "-") + `-${process.pid}`);
  await mkdir(outputDir, { recursive: true });
  const metadata = {
    startedAt, hostBefore: hostSnapshot(), node: process.version,
    lhciVersion: require("@lhci/cli/package.json").version,
    lighthouseVersion: require("lighthouse/package.json").version,
    chromeVersion: spawnSync(config.ci.collect.chromePath, ["--version"], { encoding: "utf8" }).stdout?.trim(),
    commit: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim(),
    configSha256: await digest(configPath), lockSha256: await digest("package-lock.json"),
    runnerSha256: await digest(new URL(import.meta.url)),
    buildId: (await readFile(".next/BUILD_ID", "utf8")).trim(),
    collect: config.ci.collect, assertions: config.ci.assert.assertions
  };
  await writeFile(path.join(outputDir, "conditions.json"), JSON.stringify(metadata, null, 2) + "\n");
  console.log(`Lighthouse evidence: ${outputDir}`);
  await assertServerPortAvailable(config.ci.collect);
  // Keep Unix socket paths short even when the task's worktree path is long.
  const chromeTmp = await mkdtemp(path.join(os.tmpdir(), "jitm-lighthouse-"));
  let interrupted = false;
  const status = await new Promise((resolve, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(process.execPath, [require.resolve("@lhci/cli/src/cli.js"), "autorun", `--config=${configPath}`,
      `--upload.outputDir=${outputDir}`, "--failOnUploadFailure"], {
      stdio: "inherit", detached: grouped,
      env: { ...process.env, HOSTNAME: "127.0.0.1", TMPDIR: chromeTmp, TMP: chromeTmp, TEMP: chromeTmp }
    });
    const stop = signal => {
      interrupted = true;
      try {
        if (grouped) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) { if (error.code !== "ESRCH") throw error; }
    };
    const onInterrupt = () => stop("SIGINT");
    const onTerminate = () => stop("SIGTERM");
    const detach = () => {
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onTerminate);
    };
    process.on("SIGINT", onInterrupt);
    process.on("SIGTERM", onTerminate);
    child.on("error", error => { detach(); reject(error); });
    child.on("exit", code => {
      detach();
      // A signalled LHCI collect process can orphan its app server. The group
      // belongs solely to this invocation; clean it even if autorun returned 0.
      if (grouped) {
        try { process.kill(-child.pid, "SIGTERM"); }
        catch (error) { if (error.code !== "ESRCH") { reject(error); return; } }
      }
      resolve(code);
    });
  });
  let browserCleanup = [];
  let cleanupError;
  try { browserCleanup = await cleanupChromeProfiles(chromeTmp); }
  catch (error) { cleanupError = error.message; }
  if (!cleanupError) await rm(chromeTmp, { recursive: true, force: true });
  // Also retain partial reports after collection errors; autorun skips upload then.
  const files = await readdir(".lighthouseci").catch(() => []);
  const reports = [];
  for (const file of files.filter(file => /^lhr-.*\.json$/.test(file))) {
    await copyFile(path.join(".lighthouseci", file), path.join(outputDir, file));
    reports.push(JSON.parse(await readFile(path.join(".lighthouseci", file), "utf8")));
  }
  if (files.includes("assertion-results.json")) {
    await copyFile(".lighthouseci/assertion-results.json", path.join(outputDir, "assertion-results.json"));
  }
  const summary = summarizeReports(reports, config.ci.collect, startedAt);
  summary.browserCleanup = browserCleanup;
  if (cleanupError) { summary.errors.push(cleanupError); summary.complete = false; }
  summary.lhciExitCode = status;
  summary.interrupted = interrupted;
  summary.exitCode = measurementExitCode(interrupted ? 1 : status, summary);
  summary.hostAfter = hostSnapshot();
  await writeFile(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  for (const route of summary.routes) {
    console.log(`${route.url}: LCP samples [${route.samples.map(sample => sample.lcp).join(", ")}]; median ${route.lcp?.median ?? "missing"}; asserted ${route.assertedLcp ?? "missing"} ms`);
    for (const sample of route.samples) for (const warning of sample.warnings) console.warn(`${route.url}: ${warning}`);
  }
  for (const error of summary.errors) console.error(error);
  process.exitCode = summary.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
