import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The dedicated Netlify probe reads the hold through the same bounded reader as the Next.js
// route. pg is replaced so the tests control how long the catalog read takes: a cold database
// compute that answers inside the deadline is "clear", one that does not is "unavailable".
const pg = vi.hoisted(() => ({ query: vi.fn(), options: undefined as Record<string, unknown> | undefined }));
vi.mock("pg", () => ({
  Pool: class {
    constructor(options: Record<string, unknown>) { pg.options = options; }
    query = (...args: unknown[]) => pg.query(...args);
    listenerCount() { return 1; }
    on() { return this; }
  }
}));
import handler from "../netlify/functions/recovery-boundary";
import { RECOVERY_CONNECT_TIMEOUT_MS, RECOVERY_QUERY_TIMEOUT_MS, RECOVERY_READ_DEADLINE_MS } from "../src/lib/recovery-hold-budget.mjs";

const answerAfter = (ms: number, rows: unknown[]) => () => new Promise((resolve) => setTimeout(() => resolve({ rows }), ms));
const get = () => handler(new Request("https://jump-in-the-mix-test.netlify.app/.netlify/functions/recovery-boundary"));

beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("DATABASE_URL", "postgresql://probe:probe@db.example.test:5432/jitm"); pg.query.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("recovery-boundary function", () => {
  it("answers a warm database at once with the boundary shape and no caching", async () => {
    pg.query.mockImplementation(answerAfter(20, []));
    const pending = get();
    await vi.advanceTimersByTimeAsync(20);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    await expect(response.json()).resolves.toEqual({ status: "clear" });
    pg.query.mockImplementation(answerAfter(20, [{ value: "jitm.recovery_hold=restore-2026-09-15" }]));
    const held = get();
    await vi.advanceTimersByTimeAsync(20);
    await expect((await held).json()).resolves.toEqual({ status: "held" });
  });

  it("gives a cold database compute the connect budget and still answers clear inside the deadline", async () => {
    // A suspended compute wakes in a few seconds; the read completes at 4.5 s, inside the 7 s deadline.
    pg.query.mockImplementation(answerAfter(4_500, []));
    const pending = get();
    await vi.advanceTimersByTimeAsync(4_499);
    await vi.advanceTimersByTimeAsync(1);
    await expect((await pending).json()).resolves.toEqual({ status: "clear" });
    expect(pg.options).toMatchObject({ connectionTimeoutMillis: RECOVERY_CONNECT_TIMEOUT_MS, query_timeout: RECOVERY_QUERY_TIMEOUT_MS, max: 2 });
    expect(RECOVERY_CONNECT_TIMEOUT_MS + RECOVERY_QUERY_TIMEOUT_MS).toBeLessThanOrEqual(RECOVERY_READ_DEADLINE_MS);
  });

  it("fails closed at the deadline when the read is still outstanding, and discards the late answer", async () => {
    pg.query.mockImplementation(answerAfter(9_000, []));
    const pending = get();
    await vi.advanceTimersByTimeAsync(RECOVERY_READ_DEADLINE_MS);
    await expect((await pending).json()).resolves.toEqual({ status: "unavailable" });
    await vi.advanceTimersByTimeAsync(3_000);
    // The next probe reads again; nothing was cached from the late answer.
    pg.query.mockImplementation(answerAfter(10, [{ value: "jitm.recovery_hold=x" }]));
    const next = get();
    await vi.advanceTimersByTimeAsync(10);
    await expect((await next).json()).resolves.toEqual({ status: "held" });
  });

  it("fails closed on a read error or a missing connection string", async () => {
    pg.query.mockRejectedValue(new Error("connection terminated"));
    await expect((await get()).json()).resolves.toEqual({ status: "unavailable" });
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NETLIFY_DB_URL", "");
    await expect((await get()).json()).resolves.toEqual({ status: "unavailable" });
  });

  it("refuses anything but a safe read", async () => {
    const response = await handler(new Request("https://jump-in-the-mix-test.netlify.app/.netlify/functions/recovery-boundary", { method: "POST" }));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(pg.query).not.toHaveBeenCalled();
  });
});
