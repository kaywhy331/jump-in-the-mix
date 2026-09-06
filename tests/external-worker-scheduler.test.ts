import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import scheduler, { runScheduledHandoff } from "../infra/cloudflare-scheduler";

const env = { APP_URL: "https://jump-in-the-mix-test.netlify.app", NETLIFY_WORKER_SECRET: "local-scheduler-fixture-".repeat(3) };
const scheduledTime = Date.parse("2026-09-06T14:00:00Z");
const fetcher = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("external scheduled worker handoff", () => {
  it("awaits the authenticated handoff and releases the response without reading private text", async () => {
    const canceled = vi.fn();
    const response = new Response(new ReadableStream({ cancel: canceled }), { status: 202 });
    fetcher.mockResolvedValue(response);
    await scheduler.scheduled({ scheduledTime, cron: "* * * * *", noRetry() {} }, env);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe(`${env.APP_URL}/.netlify/functions/jump-worker-background`);
    expect(options).toMatchObject({ method: "POST", redirect: "manual", headers: { authorization: `Bearer ${env.NETLIFY_WORKER_SECRET}`, origin: env.APP_URL } });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(canceled).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith({ event: "worker_handoff", scheduledTime, outcome: "accepted" });
  });

  it.each([200, 204, 301, 401, 503])("does not report HTTP %i as accepted work", async status => {
    fetcher.mockResolvedValue(new Response(null, { status }));
    await expect(runScheduledHandoff(env, scheduledTime)).rejects.toThrow("Scheduled worker handoff failed.");
    expect(console.info).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith({ event: "worker_handoff", scheduledTime, outcome: "failed", status });
  });

  it("keeps provider errors and handoff secrets out of logs and thrown errors", async () => {
    fetcher.mockRejectedValue(new Error(`Upstream diagnostics include ${env.NETLIFY_WORKER_SECRET}`));
    await expect(runScheduledHandoff(env, scheduledTime)).rejects.toThrow(/^Scheduled worker handoff failed\.$/);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(env.NETLIFY_WORKER_SECRET);
    expect(console.info).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("aborts a stalled handoff after ten seconds and clears its timer", async () => {
    vi.useFakeTimers();
    fetcher.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(new Error("transport aborted")), { once: true });
    }));
    const pending = expect(runScheduledHandoff(env, scheduledTime)).rejects.toThrow("Scheduled worker handoff failed.");
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("bounds response cleanup even when cancellation never settles", async () => {
    vi.useFakeTimers();
    fetcher.mockResolvedValue(new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), { status: 202 }));
    const pending = expect(runScheduledHandoff(env, scheduledTime)).rejects.toThrow("Scheduled worker handoff failed.");
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(console.info).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("redacts response cleanup failures and clears the deadline after success", async () => {
    vi.useFakeTimers();
    fetcher.mockResolvedValueOnce(new Response(new ReadableStream({ cancel: () => Promise.reject(new Error(env.NETLIFY_WORKER_SECRET)) }), { status: 202 }));
    await expect(runScheduledHandoff(env, scheduledTime)).rejects.toThrow(/^Scheduled worker handoff failed\.$/);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(env.NETLIFY_WORKER_SECRET);
    expect(vi.getTimerCount()).toBe(0);
    fetcher.mockResolvedValueOnce(new Response(null, { status: 202 }));
    await runScheduledHandoff(env, scheduledTime);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["not a URL", "http://example.com", "https://user:password@example.com", "https://example.com/path", "https://example.com?key=private", "https://example.com#private"])("rejects unsafe application origin %s before any handoff", async APP_URL => {
    await expect(runScheduledHandoff({ ...env, APP_URL }, scheduledTime)).rejects.toThrow("valid HTTPS application origin");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["", "short", "a".repeat(32) + "\nprivate"])("rejects an absent or malformed handoff secret before contacting a server", async NETLIFY_WORKER_SECRET => {
    await expect(runScheduledHandoff({ ...env, NETLIFY_WORKER_SECRET }, scheduledTime)).rejects.toThrow("valid worker handoff secret");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("exposes no HTTP handler or public route and declares the secret separately from variables", () => {
    const config = JSON.parse(readFileSync(new URL("../infra/cloudflare-scheduler/wrangler.jsonc", import.meta.url), "utf8"));
    expect(scheduler).not.toHaveProperty("fetch");
    expect(config).toMatchObject({ workers_dev: false, preview_urls: false, routes: [], triggers: { crons: ["* * * * *"] }, secrets: { required: ["NETLIFY_WORKER_SECRET"] } });
    expect(config.vars).not.toHaveProperty("NETLIFY_WORKER_SECRET");
  });
});
