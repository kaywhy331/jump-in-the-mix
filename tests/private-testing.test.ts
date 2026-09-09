vi.mock("@/lib/recovery-hold", () => ({ databaseRecoveryStatus: async () => "clear" }));
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { productionConfigurationIssues, sessionCookieSecure } from "../src/lib/env";
import { privateTestRequestAuthorized } from "../src/lib/private-test";
import { proxy } from "../src/proxy";
import { getRequestMetadata } from "../src/lib/request-context";

const requestHeaders = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: requestHeaders }));

const testEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  APP_URL: "https://jump-in-the-mix-test.netlify.app",
  DATABASE_URL: "postgresql://test.invalid/testing",
  AUTH_RATE_LIMIT_SECRET: "r".repeat(32),
  DATA_ENCRYPTION_KEY: "e".repeat(32),
  PRIVATE_TEST_MODE: "true",
  PRIVATE_TEST_USERNAME: "tester",
  PRIVATE_TEST_PASSWORD: "s".repeat(40),
  PILOT_MODE: "false",
  AUTH_REQUIRE_EMAIL_VERIFICATION: "false"
};
const authorization = `Basic ${Buffer.from(`tester:${testEnvironment.PRIVATE_TEST_PASSWORD}`).toString("base64")}`;
function configure() {
  for (const [key, value] of Object.entries(testEnvironment)) vi.stubEnv(key, value);
}
afterEach(() => vi.unstubAllEnvs());

describe("private test deployments", () => {
  it("permits password testing behind a strong access password while retaining HTTPS and secure cookies", () => {
    expect(productionConfigurationIssues(testEnvironment)).toEqual([]);
    expect(sessionCookieSecure(testEnvironment)).toBe(true);
    expect(productionConfigurationIssues({ ...testEnvironment, APP_URL: "http://example.com" })).toContain("APP_URL must be a public https origin");
    expect(productionConfigurationIssues({ ...testEnvironment, DEMO_MODE: "true" })).toContain("DEMO_MODE must be false");
  });

  it("keeps the public hosted requirements and rejects incomplete optional provider configuration", () => {
    const publicIssues = productionConfigurationIssues({ ...testEnvironment, PRIVATE_TEST_MODE: "false" });
    expect(publicIssues).toContain("AUTH_REQUIRE_EMAIL_VERIFICATION must be true for hosted production");
    expect(publicIssues).toContain("RESEND_API_KEY is required for hosted production");
    expect(publicIssues).not.toContain("Google sign-in credentials are required for hosted production");
    expect(publicIssues).not.toContain("Apple sign-in credentials are required for hosted production");
    expect(productionConfigurationIssues({ ...testEnvironment, AUTH_GOOGLE_CLIENT_ID: "partial" })).toContain("Google sign-in credentials are required for hosted production");
    expect(productionConfigurationIssues({ ...testEnvironment, AUTH_REQUIRE_EMAIL_VERIFICATION: "true" })).toContain("RESEND_API_KEY is required for hosted production");
  });

  it("fails closed for missing secrets, invalid usernames, and expired temporary deployments", () => {
    const headers = new Headers({ authorization });
    expect(privateTestRequestAuthorized(headers, testEnvironment)).toBe(true);
    for (const override of [
      { PRIVATE_TEST_PASSWORD: "" }, { PRIVATE_TEST_USERNAME: "" },
      { PRIVATE_TEST_USERNAME: "user:password" }, { PRIVATE_TEST_EXPIRES_AT: "invalid" },
      { PRIVATE_TEST_EXPIRES_AT: "2020-01-01T00:00:00Z" }, { PILOT_MODE: "true" }
    ]) {
      const source = { ...testEnvironment, ...override };
      expect(productionConfigurationIssues(source).length).toBeGreaterThan(0);
      expect(privateTestRequestAuthorized(headers, source)).toBe(false);
    }
    expect(privateTestRequestAuthorized(new Headers(), testEnvironment)).toBe(false);
    expect(privateTestRequestAuthorized(new Headers({ authorization: authorization.slice(0, -1) + "x" }), testEnvironment)).toBe(false);
  });

  it("challenges page, API, OAuth, and Server Action requests before application work", async () => {
    configure();
    for (const path of ["/", "/register", "/api/health/ready", "/api/auth/oauth/google/start", "/_next/data/build/login.json"]) {
      const response = await proxy(new NextRequest(new URL(path, testEnvironment.APP_URL)));
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Basic");
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    const action = await proxy(new NextRequest(new URL("/register", testEnvironment.APP_URL), { method: "POST", headers: { origin: testEnvironment.APP_URL! } }));
    expect(action.status).toBe(401);
    const allowed = await proxy(new NextRequest(new URL("/login", testEnvironment.APP_URL), { headers: { authorization } }));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    vi.stubEnv("PRIVATE_TEST_PASSWORD", "");
    expect((await proxy(new NextRequest(new URL("/login", testEnvironment.APP_URL), { headers: { authorization } }))).status).toBe(503);
  });

  it("allows only the authenticated background handoff to omit the site password", async () => {
    configure();
    const secret = "worker-secret".repeat(4);
    vi.stubEnv("NETLIFY_WORKER_SECRET", secret);
    const headers = { authorization: `Bearer ${secret}`, origin: testEnvironment.APP_URL! };
    expect((await proxy(new NextRequest(new URL("/.netlify/functions/jump-worker-background", testEnvironment.APP_URL), { method: "POST", headers }))).status).toBe(200);
    expect((await proxy(new NextRequest(new URL("/register", testEnvironment.APP_URL), { method: "POST", headers }))).status).toBe(401);
    expect((await proxy(new NextRequest(new URL("/.netlify/functions/jump-worker-background", testEnvironment.APP_URL), { headers }))).status).toBe(401);
  });

  it("enforces the same access password inside authentication actions", async () => {
    configure();
    requestHeaders.mockResolvedValue(new Headers());
    await expect(getRequestMetadata()).rejects.toThrow("Private test access is required");
    requestHeaders.mockResolvedValue(new Headers({ authorization, "user-agent": "test-browser" }));
    await expect(getRequestMetadata()).resolves.toMatchObject({ userAgent: "test-browser" });
  });
});
