import { describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertServerPortAvailable, cleanupChromeProfiles, measurementExitCode, summarizeReports } from "../scripts/run-lighthouse.mjs";

const startedAt = "2026-10-16T00:00:00.000Z";
const url = "http://127.0.0.1:3000/for/photographers";
const collect = {
  url: [url], numberOfRuns: 3,
  settings: { throttlingMethod: "devtools", throttling: { cpuSlowdownMultiplier: 4 }, disableStorageReset: false }
};
function report(index, lcp = 2100 + index) {
  return {
    requestedUrl: url, finalDisplayedUrl: url, fetchTime: `2026-10-16T00:01:0${index}.000Z`,
    configSettings: structuredClone(collect.settings), runWarnings: [],
    audits: {
      "largest-contentful-paint": { numericValue: lcp },
      "first-contentful-paint": { numericValue: 1800 + index },
      interactive: { numericValue: 3000 + index },
      "total-blocking-time": { numericValue: 100 },
      "cumulative-layout-shift": { numericValue: 0 },
      "network-requests": { details: { items: [{ url, statusCode: 200 }] } }
    },
    categories: { performance: { score: 0.95 }, accessibility: { score: 1 }, "best-practices": { score: 1 } }
  };
}
const samples = () => [report(1), report(2), report(3)];

describe("Lighthouse collection evidence", () => {
  it("retains chronological tails, warnings and the difference between median LCP and the asserted representative run", () => {
    const reports = [report(3, 2100), report(1, 2000), report(2, 3200)];
    reports[2].runWarnings = ["A diagnostic warning"];
    const summary = summarizeReports(reports, collect, startedAt);
    expect(summary.complete).toBe(true);
    expect(summary.routes[0].lcp).toEqual({ min: 2000, median: 2100, max: 3200 });
    expect(summary.routes[0].assertedLcp).toBe(3200);
    expect(summary.routes[0].samples.map(sample => sample.lcp)).toEqual([2000, 3200, 2100]);
    expect(summary.routes[0].samples[1].warnings).toEqual(["A diagnostic warning"]);
    expect(measurementExitCode(1, summary)).toBe(1);
  });

  it("rejects the reproduced partial-collection false success even when the collected URL passed", () => {
    const summary = summarizeReports(samples(), { ...collect, url: [url, "http://127.0.0.1:3000/"] }, startedAt);
    expect(summary.errors).toContain("Expected 6 reports; received 3");
    expect(measurementExitCode(0, summary)).toBe(1);
  });

  it.each([
    ["duplicate", reports => { reports[2] = structuredClone(reports[1]); }],
    ["stale", reports => { reports[0].fetchTime = "2026-10-15T00:00:00.000Z"; }],
    ["runtime error", reports => { reports[0].runtimeError = { code: "NO_FCP" }; }],
    ["wrong route", reports => { reports[0].requestedUrl += "/other"; }],
    ["redirect", reports => { reports[0].finalDisplayedUrl = "http://127.0.0.1:3000/login"; }],
    ["different CPU", reports => { reports[0].configSettings.throttling.cpuSlowdownMultiplier = 1; }],
    ["warm storage", reports => { reports[0].configSettings.disableStorageReset = true; }],
    ["missing LCP", reports => { reports[0].audits["largest-contentful-paint"].numericValue = null; }],
    ["missing category", reports => { reports[0].categories.performance.score = null; }],
    ["unhealthy dependency", reports => { reports[0].audits["network-requests"].details.items.push({ url: "http://127.0.0.1:3000/manifest.webmanifest", statusCode: 503 }); }],
    ["missing network evidence", reports => { delete reports[0].audits["network-requests"]; }]
  ])("fails closed on %s evidence", (_name, change) => {
    const reports = samples();
    change(reports);
    const summary = summarizeReports(reports, collect, startedAt);
    expect(summary.errors.length).toBeGreaterThan(0);
    expect(measurementExitCode(0, summary)).toBe(1);
  });

  it("does not convert a signalled collector or failed budget into success", () => {
    const summary = summarizeReports(samples(), collect, startedAt);
    expect(measurementExitCode(null, summary)).toBe(1);
    expect(measurementExitCode(2, summary)).toBe(2);
    expect(measurementExitCode(0, summary)).toBe(0);
  });

  it("reports an empty collection as incomplete", () => {
    const summary = summarizeReports([], collect, startedAt);
    expect(summary.routes[0].lcp).toBeNull();
    expect(measurementExitCode(0, summary)).toBe(1);
  });

  it("refuses to reuse a listening server and permits the same port after it closes", async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const local = { startServerCommand: "node server.js", url: [`http://127.0.0.1:${server.address().port}/`] };
    try { await expect(assertServerPortAvailable(local)).rejects.toThrow("EADDRINUSE"); }
    finally { await new Promise(resolve => server.close(resolve)); }
    await expect(assertServerPortAvailable(local)).resolves.toBeUndefined();
  });

  it("does not start an app server for an external origin", async () => {
    await expect(assertServerPortAvailable({ startServerCommand: "node server.js", url: ["https://example.test/"] })).rejects.toThrow("127.0.0.1");
  });

  it("does not kill an unrelated live process named by a stale Chrome PID file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "lighthouse-evidence-test-"));
    const profile = path.join(directory, "lighthouse.test");
    try {
      await mkdir(profile);
      await writeFile(path.join(profile, "chrome.pid"), String(process.pid));
      await expect(cleanupChromeProfiles(directory)).rejects.toThrow(/ownership|manually/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
