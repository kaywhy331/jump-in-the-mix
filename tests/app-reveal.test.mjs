import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { APP_ROUTES, applyThrottling, assertTestDatabase, blockingFromStart, measurementProfile, summarizeReveal } from "../scripts/measure-app-reveal.mjs";

const require = createRequire(import.meta.url);
const config = require("../.lighthouserc.cjs");
const profile = measurementProfile(config);
const samples = () => APP_ROUTES.flatMap(route => Array.from({ length: profile.numberOfRuns }, (_, index) => ({
  ...route, run: index + 1, revealMs: profile.budgetMs, revealFrameMs: profile.budgetMs,
  firstPaintMs: 100, firstContentfulPaintMs: 120, accountChecks: 2, blockingMs: 80
})));

describe("app reveal measurement", () => {
  it("reads the applied network rates, CPU, viewport, run count and budget from the config", async () => {
    const changed = structuredClone(config);
    changed.ci.collect.settings.throttling.requestLatencyMs += 1;
    changed.ci.collect.settings.throttling.downloadThroughputKbps += 1;
    changed.ci.collect.settings.throttling.uploadThroughputKbps += 1;
    changed.ci.collect.settings.throttling.cpuSlowdownMultiplier += 1;
    changed.ci.collect.settings.screenEmulation.width += 1;
    changed.ci.collect.numberOfRuns += 2;
    changed.ci.assert.assertions["largest-contentful-paint"][1].maxNumericValue += 1;
    const result = measurementProfile(changed);
    const applied = {};
    await applyThrottling({ send: async (method, params) => { applied[method] = params; } }, result);
    expect(applied["Network.emulateNetworkConditions"]).toEqual({ offline: false,
      latency: result.throttling.requestLatencyMs,
      downloadThroughput: Math.floor(result.throttling.downloadThroughputKbps * 1024 / 8),
      uploadThroughput: Math.floor(result.throttling.uploadThroughputKbps * 1024 / 8) });
    expect(applied["Emulation.setCPUThrottlingRate"]).toEqual({ rate: profile.throttling.cpuSlowdownMultiplier + 1 });
    expect(result.context.viewport.width).toBe(profile.context.viewport.width + 1);
    expect(result.numberOfRuns).toBe(profile.numberOfRuns + 2);
    expect(result.budgetMs).toBe(profile.budgetMs + 1);
  });

  it("refuses simulation or warm-cache settings rather than silently changing the method", () => {
    for (const edit of [settings => { settings.throttlingMethod = "simulate"; }, settings => { settings.disableStorageReset = true; }]) {
      const changed = structuredClone(config);
      edit(changed.ci.collect.settings);
      expect(() => measurementProfile(changed)).toThrow(/cold-cache/);
    }
  });

  it("accepts only explicitly named loopback test databases", () => {
    expect(assertTestDatabase("postgresql://test:test@127.0.0.1/jitm_design_uxs12")).toBe("jitm_design_uxs12");
    for (const value of [undefined, "postgresql://test:test@localhost/jitm", "postgresql://test:test@example.com/jitm_design_uxs12", "file:///jitm_design_uxs12"]) {
      expect(() => assertTestDatabase(value)).toThrow(/loopback/);
    }
  });

  it("counts pre-paint long tasks, clips at reveal, and excludes the first 50 ms of each task", () => {
    expect(blockingFromStart([
      { start: 10, duration: 120 }, { start: 200, duration: 40 },
      { start: 300, duration: 200 }, { start: 500, duration: 100 }
    ], 400)).toBe(120);
  });

  it("reports medians, passes the exact ceiling, and enforces only an over-budget median", () => {
    const rows = samples();
    rows[0].revealFrameMs += 1000; // A tail does not replace the three-run median.
    expect(summarizeReveal(rows, profile, true).exitCode).toBe(0);
    rows[1].revealFrameMs += 1;
    expect(summarizeReveal(rows, profile).routes[0].medians.revealFrameMs).toBe(profile.budgetMs + 1);
    expect(summarizeReveal(rows, profile).exitCode).toBe(0);
    expect(summarizeReveal(rows, profile, true).exitCode).toBe(1);
  });

  it("fails incomplete, duplicate, unknown-route or missing-metric evidence even in report mode", () => {
    for (const edit of [
      rows => rows.pop(), rows => { rows[1] = rows[0]; },
      rows => { rows[0].path = "/login"; }, rows => { rows[0].firstPaintMs = null; }
    ]) {
      const rows = samples(); edit(rows);
      expect(summarizeReveal(rows, profile).complete).toBe(false);
      expect(summarizeReveal(rows, profile).exitCode).toBe(1);
    }
  });
});
