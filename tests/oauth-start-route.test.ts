import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rate: vi.fn(), authorize: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "oauth-start-test-secret-00000000000001" } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "203.0.113.9", userAgent: "vitest" }) }));
vi.mock("@/lib/social-auth", () => ({ createSocialAuthorization: mocks.authorize }));
import { GET as googleStart } from "../src/app/api/auth/oauth/google/start/route";
import { GET as appleStart } from "../src/app/api/auth/oauth/apple/start/route";
import { verifiedErrorMessage } from "../src/lib/form-errors";

const start = (provider: "google" | "apple") => (provider === "google" ? googleStart : appleStart)(new Request(`https://jumpinthemix.com/api/auth/oauth/${provider}/start?returnTo=%2Fcontacts`));
const shown = (response: Response) => { const url = new URL(response.headers.get("location")!); expect(url.pathname).toBe("/login"); return verifiedErrorMessage(Object.fromEntries(url.searchParams)); };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 29, retryAfterSeconds: 0 });
  mocks.authorize.mockResolvedValue(new URL("https://accounts.google.com/o/oauth2/v2/auth?state=fixture"));
});

describe.each(["google", "apple"] as const)("%s sign-in start", provider => {
  it("counts every start against the client address before storing a state row", async () => {
    const response = await start(provider);
    expect(response.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=fixture");
    expect(mocks.rate).toHaveBeenCalledWith(expect.objectContaining({ scope: "auth.oauth.start.ip", identifiers: ["203.0.113.9"], limit: 30 }));
    expect(mocks.authorize).toHaveBeenCalledWith(provider.toUpperCase(), "/contacts");
    expect(mocks.rate.mock.invocationCallOrder[0]).toBeLessThan(mocks.authorize.mock.invocationCallOrder[0]);
  });

  it("stops at the limit without creating a state row", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 900 });
    expect(shown(await start(provider))).toBe("Too many sign-in attempts. Try again in 15 minutes.");
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it("signs only our fixed wording for the sign-in page", async () => {
    const name = provider === "google" ? "Google" : "Apple";
    mocks.authorize.mockRejectedValue(new Error(`${name} sign-in is not configured.`));
    expect(shown(await start(provider))).toBe(`${name} sign-in is not configured.`);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.authorize.mockRejectedValue(new Error("Invalid `prisma.authOAuthState.create()` invocation: internal detail"));
    const response = await start(provider);
    expect(shown(response)).toBe(`${name} sign-in could not be started.`);
    expect(response.headers.get("location")).not.toContain("internal");
    log.mockRestore();
  });
});
