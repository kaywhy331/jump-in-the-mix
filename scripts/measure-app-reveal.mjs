import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { userAgents } from "lighthouse/core/config/constants.js";
import { enableNetworkThrottling, enableCPUThrottling } from "lighthouse/core/lib/emulation.js";
import { assertServerPortAvailable } from "./run-lighthouse.mjs";

const require = createRequire(import.meta.url);
export const APP_ROUTES = [
  { name: "Today", path: "/jumps" }, { name: "Contacts", path: "/contacts" },
  { name: "Mixes", path: "/mixes" }, { name: "Journey", path: "/journey" },
  { name: "Calendar", path: "/calendar" }
];
const CONTENT_SELECTOR = "[data-browser-scope]";
const ACCOUNT_CHECK_PATH = "/api/auth/browser-context";
const LONG_TASK_THRESHOLD_MS = 50; // Long Tasks API definition, including work before first paint.

export function measurementProfile(config) {
  const { settings, numberOfRuns, startServerReadyTimeout } = config.ci.collect;
  const screen = settings.screenEmulation;
  const throttle = settings.throttling;
  const budgetMs = config.ci.assert.assertions["largest-contentful-paint"][1].maxNumericValue;
  if (settings.throttlingMethod !== "devtools" || settings.formFactor !== "mobile" ||
      screen.disabled || !screen.mobile || settings.disableStorageReset !== false ||
      !Number.isInteger(numberOfRuns) || numberOfRuns < 1 ||
      ![budgetMs, startServerReadyTimeout, screen.width, screen.height, screen.deviceScaleFactor,
        throttle.requestLatencyMs, throttle.downloadThroughputKbps, throttle.uploadThroughputKbps,
        throttle.cpuSlowdownMultiplier].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("App reveal requires the cold-cache DevTools phone profile in .lighthouserc.cjs");
  }
  return {
    numberOfRuns, budgetMs, timeout: startServerReadyTimeout,
    context: { viewport: { width: screen.width, height: screen.height },
      deviceScaleFactor: screen.deviceScaleFactor, isMobile: screen.mobile, hasTouch: true,
      locale: settings.locale, userAgent: settings.emulatedUserAgent || userAgents.mobile,
      serviceWorkers: "block" },
    throttling: { ...throttle }
  };
}

export async function applyThrottling(cdp, profile) {
  const session = { sendCommand: (method, params) => cdp.send(method, params) };
  await enableNetworkThrottling(session, profile.throttling);
  await enableCPUThrottling(session, profile.throttling);
}

export function assertTestDatabase(value) {
  let database;
  try { database = new URL(value); } catch { /* Report without exposing the connection string. */ }
  if (!database || !["postgres:", "postgresql:"].includes(database.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
      !/^\/jitm_design_[a-z0-9_]+$/.test(database.pathname)) {
    throw new Error("DATABASE_URL must explicitly name a loopback jitm_design_<slice> database");
  }
  return database.pathname.slice(1);
}

// Injected before any page script. In-page clocks avoid including automation/IPC latency.
export function observeReveal({ selector }) {
  const tasks = [];
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) tasks.push({ start: entry.startTime, duration: entry.duration });
  });
  observer.observe({ type: "longtask", buffered: true });
  const visible = () => {
    const content = document.querySelector(selector);
    return content && !content.inert && content.getBoundingClientRect().width > 0 &&
      content.getBoundingClientRect().height > 0 &&
      content.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  };
  const check = () => {
    if (!visible()) { requestAnimationFrame(check); return; }
    const revealMs = performance.now();
    // Let the newly visible content cross a paint boundary, as in UXD-04.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!visible()) { requestAnimationFrame(check); return; }
      for (const entry of observer.takeRecords()) tasks.push({ start: entry.startTime, duration: entry.duration });
      observer.disconnect();
      window.__appReveal = {
        revealMs, revealFrameMs: performance.now(),
        firstPaintMs: performance.getEntriesByName("first-paint")[0]?.startTime ?? null,
        firstContentfulPaintMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
        tasks
      };
    }));
  };
  requestAnimationFrame(check);
}

export function blockingFromStart(tasks, endMs) {
  return tasks.reduce((sum, task) => sum + Math.max(0,
    Math.min(task.start + task.duration, endMs) - task.start - LONG_TASK_THRESHOLD_MS), 0);
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function summarizeReveal(samples, profile, enforce = false) {
  const metrics = ["revealMs", "revealFrameMs", "firstPaintMs", "firstContentfulPaintMs", "accountChecks", "blockingMs"];
  const complete = samples.length === APP_ROUTES.length * profile.numberOfRuns &&
    APP_ROUTES.every(route => {
      const rows = samples.filter(sample => sample.path === route.path);
      return rows.length === profile.numberOfRuns && new Set(rows.map(row => row.run)).size === rows.length &&
        rows.every(row => row.run >= 1 && row.run <= profile.numberOfRuns && Number.isInteger(row.run) &&
          metrics.every(key => Number.isFinite(row[key]) && row[key] >= 0));
    });
  const routes = APP_ROUTES.map(route => {
    const rows = samples.filter(sample => sample.path === route.path);
    const medians = Object.fromEntries(metrics.map(key => [key, rows.length ? median(rows.map(row => row[key])) : null]));
    return { ...route, medians, overBudget: medians.revealFrameMs > profile.budgetMs };
  });
  return { complete, budgetMs: profile.budgetMs, mode: enforce ? "enforce" : "report", routes,
    exitCode: !complete || (enforce && routes.some(route => route.overBudget)) ? 1 : 0 };
}

async function startServer(origin, buildDir, timeout, outputDir) {
  await assertServerPortAvailable({ startServerCommand: true, url: [origin] });
  const standalone = path.join(buildDir, "standalone");
  await cp("public", path.join(standalone, "public"), { recursive: true });
  await cp(path.join(buildDir, "static"), path.join(standalone, buildDir, "static"), { recursive: true });
  const log = createWriteStream(path.join(outputDir, "server.log"));
  const server = spawn(process.execPath, ["--import", "./scripts/browser-mail-fixture.mjs", path.join(standalone, "server.js")], {
    stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "production",
      HOSTNAME: "127.0.0.1", PORT: new URL(origin).port, APP_URL: origin, PLAYWRIGHT_BASE_URL: origin,
      PILOT_MODE: "true", DEMO_MODE: "false", BILLING_ENABLED: "false", AUTOMATIC_CUSTOMER_EMAIL: "false",
      PLAYWRIGHT_MAIL_FIXTURE: "1", RESEND_API_KEY: "jitm-e2e-mail-fixture", EMAIL_FROM: "test@example.test" }
  });
  server.stdout.pipe(log, { end: false });
  server.stderr.pipe(log, { end: false });
  const exited = new Promise(resolve => server.once("close", resolve));
  const stop = async () => { if (server.exitCode === null) server.kill("SIGTERM"); await exited; log.end(); };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Production server startup timed out; see server.log")), timeout);
      const finish = error => { clearTimeout(timer); error ? reject(error) : resolve(); };
      server.once("error", error => finish(error));
      server.once("exit", () => finish(new Error("Production server exited; see server.log")));
      let output = "";
      server.stdout.on("data", data => { output += data; if (output.includes("Ready")) finish(); });
    });
    return stop;
  } catch (error) { await stop(); throw error; }
}

async function main() {
  const { values } = parseArgs({ options: { enforce: { type: "boolean", default: false }, help: { type: "boolean" } } });
  if (values.help) {
    console.log("npm run test:app-reveal [-- --enforce]\nRequires npm run build, a seeded loopback jitm_design_<slice> DATABASE_URL, and E2E_USER_EMAIL/E2E_USER_PASSWORD (or DEMO_USER_EMAIL/DEMO_USER_PASSWORD). Loads .env; PORT selects an unused local port. Report mode ignores budget failures, not execution errors. JSON and server logs go to .artifacts/app-reveal. No CI wiring.");
    return;
  }
  const database = assertTestDatabase(process.env.DATABASE_URL);
  const email = process.env.E2E_USER_EMAIL || process.env.DEMO_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD || process.env.DEMO_USER_PASSWORD;
  if (!email || !password) throw new Error("Set synthetic E2E_USER_EMAIL/E2E_USER_PASSWORD before measuring");
  const config = require(path.resolve(".lighthouserc.cjs"));
  const profile = measurementProfile(config);
  const origin = new URL(config.ci.collect.url[0]).origin;
  const buildDir = process.env.JITM_BUILD_DIR || ".next";
  const buildId = (await readFile(path.join(buildDir, "BUILD_ID"), "utf8")).trim();
  const startedAt = new Date().toISOString();
  const outputDir = path.resolve(".artifacts/app-reveal", startedAt.replace(/[:.]/g, "-") + `-${process.pid}`);
  await mkdir(outputDir, { recursive: true });
  const sha256 = async file => createHash("sha256").update(await readFile(file)).digest("hex");
  const evidence = { startedAt, database, origin, buildId, profile,
    commit: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim(),
    configSha256: await sha256(".lighthouserc.cjs"), runnerSha256: await sha256(new URL(import.meta.url)),
    lockSha256: await sha256("package-lock.json"), node: process.version, samples: [] };
  console.log(`App reveal evidence: ${outputDir}\nCold cache; ${profile.numberOfRuns} runs/route; budget ${profile.budgetMs} ms; ${values.enforce ? "enforce" : "report-only"}.`);
  let stopServer;
  let browser;
  let interrupted = false;
  const interrupt = () => { interrupted = true; void browser?.close(); };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    stopServer = await startServer(origin, buildDir, profile.timeout, outputDir);
    const launch = () => chromium.launch({ executablePath: config.ci.collect.chromePath });
    browser = await launch();
    evidence.browser = browser.version();
    const login = await browser.newContext(profile.context);
    const page = await login.newPage();
    page.setDefaultTimeout(profile.timeout);
    await page.goto(`${origin}/login`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await Promise.all([page.waitForURL(`${origin}/jumps`), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
    await page.locator(CONTENT_SELECTOR).waitFor({ state: "visible" });
    const cookies = await login.cookies(); // Session only, kept in memory; never write credentials/cookies to evidence.
    await browser.close();
    for (const route of APP_ROUTES) {
      for (let run = 1; run <= profile.numberOfRuns; run++) {
        if (interrupted) throw new Error("Measurement interrupted");
        browser = await launch(); // A fresh browser profile per sample, including the first after sign-in.
        const context = await browser.newContext(profile.context);
        await context.addCookies(cookies);
        await context.addInitScript(observeReveal, { selector: CONTENT_SELECTOR });
        const page = await context.newPage();
        page.setDefaultTimeout(profile.timeout);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.clearBrowserCache");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp.send("Network.setBypassServiceWorker", { bypass: true });
        await applyThrottling(cdp, profile);
        let accountChecks = 0;
        cdp.on("Network.requestWillBeSent", ({ request }) => {
          if (new URL(request.url).pathname === ACCOUNT_CHECK_PATH) accountChecks++;
        });
        const failures = [];
        page.on("pageerror", () => failures.push("Uncaught page error"));
        page.on("response", response => { if (response.status() >= 400) failures.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
        const url = `${origin}${route.path}`;
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: profile.timeout });
        if (!response?.ok() || page.url() !== url) throw new Error(`${route.name}: unexpected response or signed-out redirect`);
        await page.waitForFunction(() => window.__appReveal !== undefined);
        const timing = await page.evaluate(() => window.__appReveal);
        if (failures.length) throw new Error(`${route.name}: ${failures.join(", ")}`);
        evidence.samples.push({ ...route, run, ...timing, accountChecks,
          blockingMs: blockingFromStart(timing.tasks, timing.revealFrameMs) });
        console.log(`${route.name} ${run}/${profile.numberOfRuns}: reveal ${timing.revealFrameMs.toFixed(0)} ms`);
        await browser.close();
      }
    }
  } catch (error) { evidence.error = error.message; }
  finally {
    try { await browser?.close(); await stopServer?.(); }
    finally { process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt); }
  }
  const summary = summarizeReveal(evidence.samples, profile, values.enforce);
  if (evidence.error || interrupted) { summary.complete = false; summary.exitCode = 1; }
  await writeFile(path.join(outputDir, "results.json"), JSON.stringify({ ...evidence, summary }, null, 2) + "\n");
  for (const route of summary.routes) {
    const m = route.medians;
    const status = m.revealFrameMs === null ? "MISSING" : route.overBudget ? "OVER BUDGET" : "within budget";
    console.log(`${route.name}: median reveal ${m.revealFrameMs?.toFixed(0) ?? "missing"} ms; first paint ${m.firstPaintMs?.toFixed(0) ?? "missing"} ms; account checks ${m.accountChecks ?? "missing"}; blocking from navigation start to reveal ${m.blockingMs?.toFixed(0) ?? "missing"} ms; ${status}`);
  }
  if (evidence.error) console.error(evidence.error);
  process.exitCode = summary.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
