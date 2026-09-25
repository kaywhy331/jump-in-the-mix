import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "known-device-test-secret-000000000000001", cookieName: "jitm_session", secureSessionCookie: true, sessionMaxDays: 90 } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { isKnownDevice, knownDeviceCookie, knownDeviceCookieName } from "../src/lib/rate-limit";

const DAY = 24 * 60 * 60 * 1000;

describe("the known-device marker", () => {
  it("is a signed HttpOnly Lax cookie that names no account and matches only the account that signed in", () => {
    const marker = knownDeviceCookie(undefined, "user-1");
    expect(marker.name).toBe(knownDeviceCookieName());
    expect(marker.name).toBe("jitm_session_device");
    expect(marker.options).toEqual({ httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 90 * 24 * 60 * 60 });
    expect(marker.value).not.toContain("user-1");
    expect(marker.value).toMatch(/^\d{10}\.[A-Za-z0-9_-]{43}$/);
    expect(isKnownDevice(marker.value, "user-1")).toBe(true);
    expect(isKnownDevice(marker.value, "user-2")).toBe(false);
    expect(isKnownDevice(undefined, "user-1")).toBe(false);
  });

  it("refuses a tampered, stretched or expired marker", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    const { value } = knownDeviceCookie(undefined, "user-1", now);
    const [issued, signature] = value.split(".");
    expect(isKnownDevice(`${Number(issued) + 3600}.${signature}`, "user-1", now)).toBe(false);
    expect(isKnownDevice(`${issued}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`, "user-1", now)).toBe(false);
    expect(isKnownDevice(value, "user-1", new Date(now.getTime() + 89 * DAY))).toBe(true);
    expect(isKnownDevice(value, "user-1", new Date(now.getTime() + 91 * DAY))).toBe(false);
    expect(isKnownDevice("x".repeat(2000), "user-1", now)).toBe(false);
  });

  it("keeps up to three accounts for one browser, newest first, refreshing an account's own entry", () => {
    let value: string | undefined;
    for (const [index, user] of ["a", "b", "c", "d"].entries()) value = knownDeviceCookie(value, user, new Date(Date.UTC(2026, 8, 25, 12, index))).value;
    expect(value!.split("~")).toHaveLength(3);
    expect(["d", "c", "b"].every(user => isKnownDevice(value, user, new Date(Date.UTC(2026, 8, 25, 13))))).toBe(true);
    expect(isKnownDevice(value, "a", new Date(Date.UTC(2026, 8, 25, 13)))).toBe(false);
    const refreshed = knownDeviceCookie(value, "b", new Date(Date.UTC(2026, 8, 25, 14))).value.split("~");
    expect(refreshed).toHaveLength(3);
    expect(isKnownDevice(refreshed[0], "b", new Date(Date.UTC(2026, 8, 25, 14)))).toBe(true);
  });
});
