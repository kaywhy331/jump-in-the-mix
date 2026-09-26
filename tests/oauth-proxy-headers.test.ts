vi.mock("@/lib/recovery-boundary-client", () => ({ recoveryBoundaryStatus: async () => "clear" }));
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../src/proxy";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
const APP_URL = "https://jumpinthemix.test";
const environment: NodeJS.ProcessEnv = { NODE_ENV: "production", APP_URL, DATABASE_URL: "postgresql://test.invalid/testing", AUTH_RATE_LIMIT_SECRET: "r".repeat(32), DATA_ENCRYPTION_KEY: "e".repeat(32), PILOT_MODE: "false" };
afterEach(() => vi.unstubAllEnvs());

describe("Google and Apple sign-in hops", () => {
  it("are never passed on as a referrer or cached, like the invitation page they start from", async () => {
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
    for (const path of ["/api/auth/oauth/google/start?invite=token-value", "/api/auth/oauth/apple/start?invite=token-value", "/api/auth/oauth/google/callback?code=c&state=s", "/register?invite=token-value"]) {
      const response = await proxy(new NextRequest(new URL(path, APP_URL)));
      expect(response.headers.get("referrer-policy"), path).toBe("no-referrer");
      expect(response.headers.get("cache-control"), path).toContain("no-store");
    }
    expect((await proxy(new NextRequest(new URL("/login", APP_URL)))).headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});
