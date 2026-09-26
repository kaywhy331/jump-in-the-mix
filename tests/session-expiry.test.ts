import { describe, expect, it, vi } from "vitest";

// The helper is pure; the module's request-time dependencies are stubbed so the suite needs no database.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/worker-dispatch-after", () => ({ wakeWorkerAfterResponse: vi.fn() }));
import { nextSessionExpiry } from "../src/lib/auth";

const DAY = 24 * 60 * 60 * 1000;
const createdAt = new Date("2026-01-01T00:00:00Z");
const at = (days: number) => new Date(createdAt.getTime() + days * DAY);
const slide = (input: { current: Date; now: Date }) => nextSessionExpiry({ ...input, createdAt, idleDays: 14, maxDays: 90 });

describe("sliding session expiry", () => {
  it("extends a session that is touched past its midpoint by another idle period", () => {
    expect(slide({ current: at(14), now: at(7) })).toEqual(at(21));
  });

  it("never moves an expiry earlier", () => {
    const current = at(30);
    expect(slide({ current, now: at(1) })).toBe(current);
    expect(slide({ current: at(14), now: createdAt })).toEqual(at(14));
  });

  it("never extends beyond the cap counted from creation", () => {
    expect(slide({ current: at(88), now: at(85) })).toEqual(at(90));
  });

  it("returns the current expiry once the cap is reached", () => {
    const current = at(90);
    expect(slide({ current, now: at(95) })).toBe(current);
  });
});
