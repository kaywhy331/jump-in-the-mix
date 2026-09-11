import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("@/lib/recovery-boundary-client", () => ({ recoveryBoundaryStatus: mocks.status }));
import { proxy, config } from "../src/proxy";
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";
beforeEach(() => { vi.stubEnv("PRIVATE_TEST_MODE", "false"); mocks.status.mockReset().mockResolvedValue("held"); });
afterEach(() => vi.unstubAllEnvs());

describe("recovery hold web boundary", () => {
  it.each(["/contacts", "/contacts/private.png", "/api/auth/magic?token=private", "/api/webhooks/resend", "/_next/data/build/contacts.json"])("holds %s without revealing recovery identifiers", async path => {
    expect(doesProxyMatch({ config, nextConfig: {}, url: `http://localhost${path}` })).toBe(true);
    const response = await proxy(new NextRequest(`http://localhost${path}`));
    expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("retry-after")).toBe("60");
    const body = await response.text(); expect(body).toContain("temporarily unavailable"); expect(body).not.toContain("private"); expect(body).not.toContain("database");
  });
  it.each(["/", "/for/realtors", "/for/consultants", "/for/photographers", "/for/contractors", "/for/recruiters"])("keeps the public experience available during recovery at %s", async path => {
    expect((await proxy(new NextRequest(`http://localhost${path}`))).status).toBe(200);
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("holds Server Actions and does not trust client-supplied bypass headers", async () => {
    const response = await proxy(new NextRequest("http://localhost/register", { method: "POST", headers: { origin: "http://localhost", "next-action": "action", "x-jitm-recovery": "released" } }));
    expect(response.status).toBe(503);
  });
  it("fails closed when the recovery catalog cannot be read", async () => {
    mocks.status.mockResolvedValue("unavailable"); expect((await proxy(new NextRequest("http://localhost/contacts"))).status).toBe(503);
  });
  it("keeps readiness/liveness and named public assets available without exempting mutations", async () => {
    for (const path of ["/api/health/live", "/api/health/ready", "/api/health/recovery-boundary", "/brand-logo.png", "/sw.js"]) expect((await proxy(new NextRequest(`http://localhost${path}`))).status).toBe(200);
    expect(mocks.status).not.toHaveBeenCalled();
    expect((await proxy(new NextRequest("http://localhost/api/health/live", { method: "POST" }))).status).toBe(503);
  });
  it("preserves security headers and normal routing after a successful catalog check", async () => {
    mocks.status.mockResolvedValue("clear"); const response = await proxy(new NextRequest("http://localhost/contacts"));
    expect(response.status).toBe(200); expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
});
