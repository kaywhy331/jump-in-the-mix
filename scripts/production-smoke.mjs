#!/usr/bin/env node
// Read-only production smoke for Jump in the Mix.
//
// Usage:
//   node scripts/production-smoke.mjs                              # checks https://jumpinthemix.com
//   node scripts/production-smoke.mjs --base http://127.0.0.1:3100 # any other deployment
//   node scripts/production-smoke.mjs --skip worker,hsts           # skip checks by id or group
//   node scripts/production-smoke.mjs --timeout 20000              # per-request timeout in ms (default 15000)
//
// What it checks, with GET requests only and no credentials:
//   health     /api/health/live, /api/health/ready and /api/health/worker answer 200
//   pages      /, /login, /faq, /terms, /privacy and /for/contractors answer 200 with the expected <title>
//              (and /login renders its password field)
//   redirects  /jumps, /contacts, /mixes, /journey and /more send a signed-out visitor to /login
//   headers    Content-Security-Policy with a per-response nonce, Strict-Transport-Security and X-Frame-Options
// It prints a JSON summary and exits 1 when any check fails (2 for a usage error). It never calls an
// endpoint that writes and it does not import src/lib/staging-smoke-account.ts: nothing here signs in.

const DEFAULT_BASE = "https://jumpinthemix.com";
const SITE = "Jump in the Mix";
const HEALTH = ["live", "ready", "worker"];
const PAGES = [
  { path: "/", title: `Client Follow-Up App | ${SITE}` },
  { path: "/login", title: `Sign in | ${SITE}`, bodyIncludes: 'name="password"' },
  { path: "/faq", title: `Client follow-up questions | ${SITE}` },
  { path: "/terms", title: `Terms of use | ${SITE}` },
  { path: "/privacy", title: `Privacy | ${SITE}` },
  { path: "/for/contractors", title: `Contractor Follow-Up Software | ${SITE}` }
];
const SIGNED_IN = ["/jumps", "/contacts", "/mixes", "/journey", "/more"];
const REDIRECT_STATUSES = new Set([302, 303, 307, 308]);

function usage(message) {
  console.error(`${message}\nUsage: node scripts/production-smoke.mjs [--base <url>] [--skip <ids>] [--timeout <ms>]`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = { base: DEFAULT_BASE, skip: new Set(), timeout: 15_000 };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = () => { const next = argv[++index]; if (next === undefined) usage(`${argument} needs a value.`); return next; };
    if (argument === "--help" || argument === "-h") usage("Read-only production smoke.");
    else if (argument === "--base") options.base = value();
    else if (argument === "--skip") for (const id of value().split(",")) if (id.trim()) options.skip.add(id.trim());
    else if (argument === "--timeout") { options.timeout = Number(value()); if (!Number.isInteger(options.timeout) || options.timeout < 1_000) usage("--timeout must be a whole number of milliseconds, at least 1000."); }
    else usage(`Unknown argument: ${argument}`);
  }
  let base;
  try { base = new URL(options.base); } catch { usage(`--base must be a URL, got ${options.base}`); }
  if (!["http:", "https:"].includes(base.protocol)) usage("--base must use http or https.");
  if (base.username || base.password) usage("--base must not carry credentials; this smoke is credential-free.");
  if (base.search || base.hash) usage("--base must not carry a query or fragment.");
  options.base = base.origin + base.pathname.replace(/\/+$/, "");
  return options;
}

function decodeEntities(text) {
  return text.replace(/&(amp|lt|gt|quot|#39|#x27|#x2F);/g, (_, entity) => ({ amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'", "#x27": "'", "#x2F": "/" })[entity]);
}

function pageTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : null;
}

async function get(url, timeout) {
  // GET only, redirects left unfollowed so a redirect is observed rather than silently resolved.
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { "user-agent": "jitm-production-smoke/1 (read-only)", accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(timeout)
  });
  const body = await response.text();
  return { status: response.status, headers: response.headers, body };
}

function nonceOf(policy) {
  return policy?.match(/'nonce-([^']+)'/)?.[1] ?? null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  const checks = [];
  const responses = new Map();
  const skipped = (id, group) => options.skip.has(id) || options.skip.has(group);
  const record = (check) => { checks.push(check); return check; };
  const fetchPath = async (path) => {
    if (!responses.has(path)) responses.set(path, get(`${options.base}${path}`, options.timeout).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })));
    return responses.get(path);
  };

  for (const probe of HEALTH) {
    const path = `/api/health/${probe}`;
    if (skipped(probe, "health")) { record({ id: probe, group: "health", url: path, ok: null, skipped: true }); continue; }
    const result = await fetchPath(path);
    if (result.error) { record({ id: probe, group: "health", url: path, ok: false, detail: result.error }); continue; }
    let reported = null;
    try { reported = JSON.parse(result.body)?.status ?? null; } catch { /* not JSON */ }
    record({ id: probe, group: "health", url: path, ok: result.status === 200, status: result.status, expected: 200, detail: reported ? `status: ${reported}` : undefined });
  }

  for (const page of PAGES) {
    const id = `page:${page.path}`;
    if (skipped(id, "pages")) { record({ id, group: "pages", url: page.path, ok: null, skipped: true }); continue; }
    const result = await fetchPath(page.path);
    if (result.error) { record({ id, group: "pages", url: page.path, ok: false, detail: result.error }); continue; }
    const title = pageTitle(result.body);
    const problems = [];
    if (result.status !== 200) problems.push(`status ${result.status}`);
    if (title !== page.title) problems.push(`title ${JSON.stringify(title)}`);
    if (page.bodyIncludes && !result.body.includes(page.bodyIncludes)) problems.push(`body lacks ${page.bodyIncludes}`);
    record({ id, group: "pages", url: page.path, ok: problems.length === 0, status: result.status, expected: `200, <title>${page.title}</title>${page.bodyIncludes ? `, body contains ${page.bodyIncludes}` : ""}`, detail: problems.length ? problems.join("; ") : undefined });
  }

  for (const path of SIGNED_IN) {
    const id = `redirect:${path}`;
    if (skipped(id, "redirects")) { record({ id, group: "redirects", url: path, ok: null, skipped: true }); continue; }
    const result = await fetchPath(path);
    if (result.error) { record({ id, group: "redirects", url: path, ok: false, detail: result.error }); continue; }
    const location = result.headers.get("location");
    let target = null;
    try { target = location ? new URL(location, options.base) : null; } catch { /* unparseable Location */ }
    const ok = REDIRECT_STATUSES.has(result.status) && target?.pathname === "/login";
    record({ id, group: "redirects", url: path, ok, status: result.status, expected: "302/303/307/308 to /login", detail: ok ? undefined : `location ${JSON.stringify(location)}` });
  }

  // Headers are read from two public documents so the nonce can be shown to change per response.
  const sample = await fetchPath("/login"), second = await fetchPath("/");
  const header = (name) => (sample.error ? null : sample.headers.get(name));
  const headerChecks = [
    { id: "csp", expected: "Content-Security-Policy with script-src and a 'nonce-…' source", test: () => { const policy = header("content-security-policy"); return { ok: Boolean(policy && /script-src/.test(policy) && nonceOf(policy)), detail: policy ? undefined : "header missing" }; } },
    { id: "nonce", expected: "a different CSP nonce on each response", test: () => { const first = nonceOf(header("content-security-policy")), next = second.error ? null : nonceOf(second.headers.get("content-security-policy")); return { ok: Boolean(first && next && first !== next), detail: first && next ? (first === next ? "nonce repeated across responses" : undefined) : "nonce missing" }; } },
    { id: "hsts", expected: "Strict-Transport-Security with max-age", test: () => { const value = header("strict-transport-security"); return { ok: Boolean(value && /max-age=\d+/.test(value)), detail: value ? undefined : "header missing" }; } },
    { id: "x-frame-options", expected: "X-Frame-Options: DENY", test: () => { const value = header("x-frame-options"); return { ok: value?.toUpperCase() === "DENY", detail: value ? `value ${value}` : "header missing" }; } }
  ];
  for (const check of headerChecks) {
    if (skipped(check.id, "headers")) { record({ id: check.id, group: "headers", url: "/login", ok: null, skipped: true }); continue; }
    if (sample.error) { record({ id: check.id, group: "headers", url: "/login", ok: false, detail: sample.error }); continue; }
    const outcome = check.test();
    record({ id: check.id, group: "headers", url: "/login", ok: outcome.ok, expected: check.expected, detail: outcome.ok ? undefined : outcome.detail });
  }

  const finishedAt = new Date();
  const summary = {
    base: options.base,
    startedAt: startedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    total: checks.length,
    passed: checks.filter((check) => check.ok === true).length,
    failed: checks.filter((check) => check.ok === false).length,
    skipped: checks.filter((check) => check.skipped).length,
    checks
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.failed ? 1 : 0;
}

main().catch((error) => {
  console.error(`Production smoke could not run: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
