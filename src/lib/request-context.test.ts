import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: vi.fn(), trustedProxyCidrs: [] as string[] }));
vi.mock("next/headers", () => ({ headers: state.headers }));
vi.mock("@/lib/env", () => ({ env: { get trustedProxyCidrs() { return state.trustedProxyCidrs; } } }));

import { getRequestMetadata } from "@/lib/request-context";

const CF = "104.16.10.20";
const CLIENT = "203.0.113.9";
const FORGED = "198.51.100.1";

function request(headers: Record<string, string>) {
  state.headers.mockResolvedValue(new Headers(headers));
}
async function ipAddress(headers: Record<string, string>) {
  request(headers);
  return (await getRequestMetadata()).ipAddress;
}

beforeEach(() => { state.trustedProxyCidrs = []; });
afterEach(() => { vi.unstubAllEnvs(); });

describe("getRequestMetadata", () => {
  it("behind Cloudflare, takes the hop before the edge and ignores what the client sent first", async () => {
    await expect(ipAddress({ "x-forwarded-for": `${FORGED}, ${CLIENT}, ${CF}` })).resolves.toBe(CLIENT);
    await expect(ipAddress({ "x-forwarded-for": `${FORGED}, ${CLIENT}, ${CF}, 10.4.5.6` })).resolves.toBe(CLIENT);
    await expect(ipAddress({ "x-forwarded-for": `${CLIENT}, ${CF}`, "cf-connecting-ip": FORGED })).resolves.toBe(CLIENT);
  });

  it("on a direct connection, takes the right-most hop", async () => {
    await expect(ipAddress({ "x-forwarded-for": CLIENT })).resolves.toBe(CLIENT);
    await expect(ipAddress({ "x-forwarded-for": `${FORGED}, ${CLIENT}` })).resolves.toBe(CLIENT);
  });

  it("returns null for garbage instead of storing it, and never reads X-Real-IP", async () => {
    await expect(ipAddress({ "x-forwarded-for": `${CLIENT}, unknown` })).resolves.toBeNull();
    await expect(ipAddress({ "x-forwarded-for": "not an address" })).resolves.toBeNull();
    await expect(ipAddress({ "x-real-ip": CLIENT })).resolves.toBeNull();
    await expect(ipAddress({ "cf-connecting-ip": CLIENT })).resolves.toBeNull();
    await expect(ipAddress({})).resolves.toBeNull();
  });

  it("uses CF-Connecting-IP only when every hop is trusted and the nearest one is Cloudflare", async () => {
    await expect(ipAddress({ "x-forwarded-for": CF, "cf-connecting-ip": CLIENT })).resolves.toBe(CLIENT);
    await expect(ipAddress({ "x-forwarded-for": CF, "cf-connecting-ip": "10.1.1.1" })).resolves.toBeNull();
  });

  it("returns null for internal-only chains rather than a shared proxy address", async () => {
    await expect(ipAddress({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" })).resolves.toBeNull();
    await expect(ipAddress({ "x-forwarded-for": "127.0.0.1", "cf-connecting-ip": CLIENT, "x-real-ip": CLIENT })).resolves.toBeNull();
    await expect(ipAddress({ "x-forwarded-for": "::1" })).resolves.toBeNull();
  });

  it("skips an operator-configured proxy range from TRUSTED_PROXY_CIDRS", async () => {
    const chain = `${CLIENT}, 192.0.2.44`;
    await expect(ipAddress({ "x-forwarded-for": chain })).resolves.toBe("192.0.2.44");
    state.trustedProxyCidrs = ["192.0.2.0/24"];
    await expect(ipAddress({ "x-forwarded-for": chain })).resolves.toBe(CLIENT);
  });

  it("keeps the user agent to 500 characters and the private test check", async () => {
    request({ "user-agent": "x".repeat(600) });
    await expect(getRequestMetadata()).resolves.toEqual({ ipAddress: null, userAgent: "x".repeat(500) });
    vi.stubEnv("PRIVATE_TEST_MODE", "true");
    vi.stubEnv("PRIVATE_TEST_USERNAME", "tester");
    vi.stubEnv("PRIVATE_TEST_PASSWORD", "s".repeat(40));
    request({ "x-forwarded-for": CLIENT });
    await expect(getRequestMetadata()).rejects.toThrow("Private test access is required.");
  });
});
