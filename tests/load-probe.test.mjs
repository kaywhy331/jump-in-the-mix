import { createServer } from "node:http";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { customerRoutes, loadOptions, readLoadAccounts, runLoadProbe } from "../scripts/lib/load-probe.mjs";

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function server(handler) {
  const instance = createServer(handler);
  await new Promise(resolve => instance.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise(resolve => { instance.closeAllConnections(); instance.close(resolve); }));
  return `http://127.0.0.1:${instance.address().port}`;
}
const account = { marker: "LOAD_ACCOUNT_ONE", cookie: `session=${"a".repeat(32)}` };
const other = { marker: "LOAD_ACCOUNT_TWO", cookie: `session=${"b".repeat(32)}` };
const options = (origin, mode = "health") => loadOptions({ LOAD_SMOKE_URL: origin, LOAD_SMOKE_MODE: mode, LOAD_SMOKE_DURATION_SECONDS: "5", LOAD_SMOKE_MAX_REQUESTS: "60", LOAD_SMOKE_CONCURRENCY: "3", LOAD_SMOKE_MAX_P95_MS: "1000" });

it("includes the complete response body in latency and counts each request once", async () => {
  let received = 0;
  const origin = await server((request, response) => {
    received++; response.writeHead(200, { "Content-Type": "application/json" }); response.flushHeaders();
    setTimeout(() => response.end('{"status":"ready"}'), 80);
  });
  const result = await runLoadProbe({ ...options(origin), maxRequests: 12 });
  expect(result.passed).toBe(true); expect(result.completed).toBe(12); expect(received).toBe(13);
  expect(result.latencyMs.min).toBeGreaterThanOrEqual(65);
  expect(result.latencyMs.p50 - result.ttfbMs.p50).toBeGreaterThan(50);
});

it("records a failed body read once even after successful response headers", async () => {
  let received = 0;
  const origin = await server((request, response) => {
    if (++received === 1) { response.end('{"status":"ready"}'); return; }
    response.writeHead(200); response.write('{"status":'); setTimeout(() => response.destroy(), 10);
  });
  const result = await runLoadProbe({ ...options(origin), maxRequests: 10 });
  expect(result.completed).toBe(10); expect(result.failed).toBe(10); expect(result.passed).toBe(false);
  expect(result.statuses).toEqual({ "200": 10 });
});

it("checks each authenticated route and keeps account cookies out of its report", async () => {
  const origin = await server((request, response) => {
    const route = customerRoutes.find(route => route.path === request.url);
    const identity = request.headers.cookie === account.cookie ? account : other;
    response.setHeader("Content-Type", "text/html"); response.end(`<h1>${route.heading}</h1><p>${identity.marker}</p>`);
  });
  const result = await runLoadProbe(options(origin, "customer"), [account, other]);
  expect(result.passed).toBe(true); expect(result.completed).toBe(60); expect(Object.keys(result.routes)).toHaveLength(6);
  expect(Object.values(result.routes).every(route => route.completed === 10)).toBe(true);
  const output = JSON.stringify(result); expect(output).not.toContain(account.cookie); expect(output).not.toContain(account.marker);
});

it.each(["login", "other-account", "streamed-error"])("rejects a 200 %s response as customer qualification", async kind => {
  const origin = await server((request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(kind === "login" ? '<h1>Sign in</h1>' : `<h1>Contacts</h1><p>${kind === "other-account" ? other.marker : account.marker}</p>${kind === "streamed-error" ? 'NEXT_REDIRECT' : ''}`);
  });
  const result = await runLoadProbe(options(origin, "customer"), [account, other]);
  expect(result.passed).toBe(false); expect(result.completed).toBe(0); expect(result.warmup.failed).toBe(1);
});

it("never follows a redirect carrying a session cookie", async () => {
  let leaked = false;
  const destination = await server((request, response) => { leaked = true; response.end("wrong destination"); });
  const origin = await server((request, response) => { response.writeHead(302, { Location: destination }); response.end(); });
  expect((await runLoadProbe(options(origin, "customer"), [account])).passed).toBe(false);
  expect(leaked).toBe(false);
});

it("does not qualify a customer run with insufficient measured coverage", async () => {
  const origin = await server((request, response) => {
    const route = customerRoutes.find(route => route.path === request.url);
    const identity = request.headers.cookie === account.cookie ? account : other;
    response.setHeader("Content-Type", "text/html"); response.end(`<h1>${route.heading}</h1>${identity.marker}`);
  });
  const result = await runLoadProbe({ ...options(origin, "customer"), maxRequests: 10 }, [account, other]);
  expect(result.passed).toBe(false); expect(result.failed).toBe(0);
  expect(result.failures).toContain("The measured run did not cover every account and route.");
  expect(result.failures.some(failure => failure.includes("fewer than 10"))).toBe(true);
});

it("bounds response buffering", async () => {
  const origin = await server((request, response) => { response.end("x".repeat(4 * 1024 * 1024 + 1)); });
  const result = await runLoadProbe(options(origin));
  expect(result.passed).toBe(false); expect(result.warmup.failures).toEqual({ "response-too-large": 1 });
});

it("requires exact-origin private credentials and rejects duplicate or unsafe cookies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jitm-load-input-")); cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "accounts.json"); const origin = "http://127.0.0.1:3123";
  const write = accounts => writeFile(path, JSON.stringify({ origin, accounts }), { mode: 0o600 });
  await write([account, other]); expect(await readLoadAccounts(path, origin)).toEqual([account, other]);
  await expect(readLoadAccounts(path, "http://127.0.0.1:3124")).rejects.toThrow("exact probe origin");
  await write([account, account]); await expect(readLoadAccounts(path, origin)).rejects.toThrow("distinct");
  await write([{ ...account, cookie: `${account.cookie}\r\nSecret: extra` }]); await expect(readLoadAccounts(path, origin)).rejects.toThrow("single session");
  await write([account]); await chmod(path, 0o644); await expect(readLoadAccounts(path, origin)).rejects.toThrow("private regular file");
});

it("requires acknowledgment for non-local hosts and rejects URL credentials or unbounded input", () => {
  expect(() => options("https://example.com")).toThrow("ACKNOWLEDGE");
  expect(() => options("http://example.com")).toThrow("https origin");
  expect(() => options("http://user:secret@127.0.0.1")).toThrow("without credentials");
  expect(() => options("http://127.0.0.1/?token=secret")).toThrow("query strings");
  expect(() => loadOptions({ LOAD_SMOKE_URL: "http://[::1]", LOAD_SMOKE_MAX_REQUESTS: "100001" })).toThrow("100000");
  expect(loadOptions({ LOAD_SMOKE_URL: "https://example.com", LOAD_TEST_ACKNOWLEDGE: "true" }).origin).toBe("https://example.com");
});
