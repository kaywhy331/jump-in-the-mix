import { readFile, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";

export const customerRoutes = [
  { name: "contacts", path: "/contacts", heading: "Contacts" },
  { name: "contact-search", path: "/contacts?q=Load", heading: "Contacts" },
  { name: "contact-page-2", path: "/contacts?page=2", heading: "Contacts" },
  { name: "mixes", path: "/mixes", heading: "Mixes" },
  { name: "today", path: "/jumps", heading: "Today" },
  { name: "follow-up-history", path: "/jumps?range=all&status=done", heading: "Today" }
];

export function loadOptions(source = process.env) {
  const number = (name, fallback, min, max, integer = true) => {
    const value = Number(source[name] ?? fallback);
    if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) throw new Error(`${name} must be ${integer ? "an integer " : ""}between ${min} and ${max}.`);
    return value;
  };
  let origin;
  try {
    const url = new URL(source.LOAD_SMOKE_URL?.trim() || source.STAGING_BASE_URL?.trim() || "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || !(url.protocol === "https:" || (local && url.protocol === "http:"))) throw new Error();
    if (!local && source.LOAD_TEST_ACKNOWLEDGE !== "true") throw new Error("acknowledgment");
    origin = url.origin;
  } catch (error) {
    if (error.message === "acknowledgment") throw new Error("Set LOAD_TEST_ACKNOWLEDGE=true before probing a non-local host.");
    throw new Error("Set LOAD_SMOKE_URL to an https origin, or an http loopback origin, without credentials, paths or query strings.");
  }
  const mode = source.LOAD_SMOKE_MODE ?? "health";
  if (!["health", "customer"].includes(mode)) throw new Error("LOAD_SMOKE_MODE must be health or customer.");
  return {
    origin, mode,
    durationSeconds: number("LOAD_SMOKE_DURATION_SECONDS", 15, 5, 300),
    concurrency: number("LOAD_SMOKE_CONCURRENCY", 5, 1, 50),
    maxRequests: number("LOAD_SMOKE_MAX_REQUESTS", 5000, 10, 100_000),
    maxErrorRate: number("LOAD_SMOKE_MAX_ERROR_RATE", 0.01, 0, 1, false),
    maxP95Ms: number("LOAD_SMOKE_MAX_P95_MS", 1000, 1, 60_000)
  };
}

export async function readLoadAccounts(path, origin) {
  if (!path) throw new Error("LOAD_SMOKE_ACCOUNTS_FILE is required for customer mode.");
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > 64 * 1024 || (process.platform !== "win32" && (metadata.mode & 0o077))) throw new Error("The accounts file must be a private regular file, at most 64 KiB (chmod 600).");
  let input;
  try { input = JSON.parse(await readFile(path, "utf8")); } catch { throw new Error("The private accounts file is not valid JSON."); }
  if (!input || input.origin !== origin || !Array.isArray(input.accounts) || input.accounts.length < 1 || input.accounts.length > 50) throw new Error("The accounts file must match the exact probe origin and contain 1–50 accounts.");
  const markers = new Set(), cookies = new Set();
  return input.accounts.map(account => {
    // Synthetic account names are rendered in the authenticated app shell.
    if (!account || !/^[A-Za-z0-9_-]{12,100}$/.test(account.marker ?? "") || !/^[A-Za-z0-9_-]{1,100}=[A-Za-z0-9_-]{20,500}$/.test(account.cookie ?? "") || [...markers].some(marker => marker.includes(account.marker) || account.marker.includes(marker)) || cookies.has(account.cookie)) throw new Error("Accounts require distinct synthetic markers and single session cookies.");
    markers.add(account.marker); cookies.add(account.cookie);
    return { marker: account.marker, cookie: account.cookie };
  });
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}
function distribution(values) {
  return { min: values.length ? values.reduce((a, b) => Math.min(a, b)) : 0, p50: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99), max: values.length ? values.reduce((a, b) => Math.max(a, b)) : 0 };
}
function summarize(samples) {
  const failed = samples.filter(sample => sample.failure).length;
  const counts = key => Object.fromEntries([...new Set(samples.map(sample => sample[key]))].filter(Boolean).map(value => [value, samples.filter(sample => sample[key] === value).length]));
  return { completed: samples.length, failed, errorRate: samples.length ? failed / samples.length : 1, latencyMs: distribution(samples.map(sample => sample.duration)), ttfbMs: distribution(samples.flatMap(sample => sample.ttfb === null ? [] : [sample.ttfb])), responseBytes: distribution(samples.map(sample => sample.bytes)), statuses: counts("status"), failures: counts("failure"), redirects: counts("redirect") };
}

export async function runLoadProbe(options, accounts = []) {
  if (options.mode === "customer" && !accounts.length) throw new Error("Customer mode requires authenticated accounts.");
  const routes = options.mode === "customer" ? customerRoutes : [{ name: "readiness", path: "/api/health/ready" }];
  const identities = options.mode === "customer" ? accounts : [null];
  const samples = [], warmup = [];
  async function request(route, account) {
    const started = performance.now();
    const sample = { route: route.name, account: identities.indexOf(account), status: "network-error", failure: null, ttfb: null, duration: 0, bytes: 0 };
    let reader;
    try {
      const response = await fetch(new URL(route.path, options.origin), { headers: { "User-Agent": "jump-in-the-mix-load-smoke/2.0", ...(account ? { Cookie: account.cookie } : {}) }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000) });
      sample.ttfb = performance.now() - started;
      sample.status = String(response.status);
      if (response.status >= 300 && response.status < 400) {
        const location = new URL(response.headers.get("location") || "/", options.origin).pathname;
        sample.redirect = ["/login", "/onboarding", "/register", "/verify-email/pending"].includes(location) ? location : "other";
      }
      reader = response.body?.getReader();
      const chunks = [];
      if (reader) while (true) {
        const part = await reader.read();
        if (part.done) break;
        sample.bytes += part.value.byteLength;
        if (sample.bytes > 4 * 1024 * 1024) { sample.failure = "response-too-large"; await reader.cancel(); break; }
        chunks.push(part.value);
      }
      if (!sample.failure) {
        const body = Buffer.concat(chunks).toString("utf8");
        if (response.status !== 200) sample.failure = "http-status";
        else if (account) {
          const headings = [...body.matchAll(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/gi)].map(match => match[1].replace(/<[^>]*>/g, "").trim());
          if (!response.headers.get("content-type")?.includes("text/html") || !headings.includes(route.heading) || !body.includes(account.marker) || /NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK|\"digest\":\"\d+\"/.test(body)) sample.failure = "unexpected-page";
          if (accounts.some(other => other !== account && body.includes(other.marker))) sample.failure = "account-isolation";
        } else {
          try { if (JSON.parse(body).status !== "ready") sample.failure = "unexpected-health"; } catch { sample.failure = "unexpected-health"; }
        }
      }
    } catch { sample.failure = "network-or-body-error"; }
    finally { reader?.releaseLock(); sample.duration = performance.now() - started; }
    return sample;
  }
  // First observations are separate from measured throughput, not cold-start proof.
  for (const account of identities) for (const route of routes) {
    const sample = await request(route, account); warmup.push(sample);
    if (sample.failure) return { ...options, passed: false, failures: ["Warmup did not reach the expected authenticated page or health response."], warmup: summarize(warmup), routes: {}, completed: 0 };
  }
  const started = performance.now(), deadline = started + options.durationSeconds * 1000;
  let issued = 0;
  await Promise.all(Array.from({ length: options.concurrency }, async () => {
    while (performance.now() < deadline && issued < options.maxRequests) {
      const index = issued++;
      samples.push(await request(routes[index % routes.length], identities[Math.floor(index / routes.length) % identities.length]));
    }
  }));
  const elapsedSeconds = (performance.now() - started) / 1000;
  const report = { ...options, ...summarize(samples), accounts: identities.length, measuredAccounts: new Set(samples.map(sample => sample.account)).size, warmup: summarize(warmup), elapsedSeconds, requestsPerSecond: samples.length / Math.max(elapsedSeconds, 0.001), routes: Object.fromEntries(routes.map(route => [route.name, summarize(samples.filter(sample => sample.route === route.name))])) };
  const failures = [];
  for (const [name, result] of Object.entries(report.routes)) {
    if (result.completed < 10) failures.push(`${name}: fewer than 10 measured requests; increase the duration or request allowance.`);
    else {
      if (result.errorRate > options.maxErrorRate) failures.push(`${name}: error rate exceeded the limit.`);
      if (result.latencyMs.p95 > options.maxP95Ms) failures.push(`${name}: full-response p95 exceeded ${options.maxP95Ms}ms.`);
    }
  }
  if (identities.some((_, index) => routes.some(route => !samples.some(sample => sample.account === index && sample.route === route.name)))) failures.push("The measured run did not cover every account and route.");
  if (samples.some(sample => sample.failure === "account-isolation")) failures.push("Account isolation failed.");
  return { ...report, passed: failures.length === 0, failures };
}
