import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rate: vi.fn(), authorize: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "oauth-start-test-secret-00000000000001", pilotMode: false, appUrl: "https://jumpinthemix.com" } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "203.0.113.9", userAgent: "vitest" }) }));
vi.mock("@/lib/social-auth", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/social-auth")>(), createSocialAuthorization: mocks.authorize }));
import { GET as googleStart } from "../src/app/api/auth/oauth/google/start/route";
import { GET as appleStart } from "../src/app/api/auth/oauth/apple/start/route";
import { verifiedErrorMessage } from "../src/lib/form-errors";
import { SOCIAL_INVITATION_UNAVAILABLE, SOCIAL_REDEMPTION_PAUSED, SocialAuthError } from "../src/lib/social-auth";

const INVITE = "i".repeat(43);
const start = (provider: "google" | "apple", query = "returnTo=%2Fcontacts") => (provider === "google" ? googleStart : appleStart)(new Request(`https://jumpinthemix.com/api/auth/oauth/${provider}/start?${query}`));
function landing(response: Response, pathname = "/login") {
  const url = new URL(response.headers.get("location")!);
  expect(url.pathname).toBe(pathname);
  return { url, message: verifiedErrorMessage(Object.fromEntries(url.searchParams)) };
}
const shown = (response: Response) => landing(response).message;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 29, retryAfterSeconds: 0 });
  mocks.authorize.mockResolvedValue(new URL("https://accounts.google.com/o/oauth2/v2/auth?state=fixture"));
});

describe.each(["google", "apple"] as const)("%s sign-in start", provider => {
  const PROVIDER = provider.toUpperCase();
  const name = provider === "google" ? "Google" : "Apple";

  it("counts every start against the client address before storing a state row", async () => {
    const response = await start(provider);
    expect(response.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=fixture");
    expect(mocks.rate).toHaveBeenCalledWith(expect.objectContaining({ scope: "auth.oauth.start.ip", identifiers: ["203.0.113.9"], limit: 30 }));
    expect(mocks.authorize).toHaveBeenCalledWith(PROVIDER, "/contacts", null);
    expect(mocks.rate.mock.invocationCallOrder[0]).toBeLessThan(mocks.authorize.mock.invocationCallOrder[0]);
    // The request may carry an invitation token: never cached, never sent on as a referrer.
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("stops at the limit without creating a state row", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 900 });
    expect(shown(await start(provider))).toBe("Too many sign-in attempts. Try again in 15 minutes.");
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it("signs only our fixed wording for the sign-in page", async () => {
    mocks.authorize.mockRejectedValue(new SocialAuthError(`${name} sign-in is not configured.`));
    expect(shown(await start(provider))).toBe(`${name} sign-in is not configured.`);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.authorize.mockRejectedValue(new Error("Invalid `prisma.authOAuthState.create()` invocation: internal detail"));
    const response = await start(provider);
    expect(shown(response)).toBe(`${name} sign-in could not be started.`);
    expect(response.headers.get("location")).not.toContain("internal");
    // A plain error that happens to read like our wording is still not ours to sign.
    mocks.authorize.mockRejectedValue(new Error(`${name} sign-in is not configured.`));
    expect(shown(await start(provider))).toBe(`${name} sign-in could not be started.`);
    log.mockRestore();
  });

  it("carries an invitation to the provider and returns every failure to that invitation", async () => {
    await start(provider, `invite=${INVITE}`);
    expect(mocks.authorize).toHaveBeenCalledWith(PROVIDER, null, INVITE);
    for (const message of [SOCIAL_REDEMPTION_PAUSED, SOCIAL_INVITATION_UNAVAILABLE]) {
      mocks.authorize.mockRejectedValueOnce(new SocialAuthError(message));
      const back = landing(await start(provider, `invite=${INVITE}`), "/register");
      expect(back.url.searchParams.get("invite")).toBe(INVITE);
      expect(back.message).toBe(message);
    }
    mocks.rate.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 900 });
    const limited = landing(await start(provider, `invite=${INVITE}`), "/register");
    expect(limited.url.searchParams.get("invite")).toBe(INVITE);
    expect(limited.message).toBe("Too many sign-in attempts. Try again in 15 minutes.");
  });

  it("addresses our own pages from the public URL, not the internal address behind the hosting proxy", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 900 });
    const response = await (provider === "google" ? googleStart : appleStart)(new Request(`https://0.0.0.0:10000/api/auth/oauth/${provider}/start?invite=${INVITE}`, { headers: { host: "attacker.example" } }));
    expect(new URL(response.headers.get("location")!).origin).toBe("https://jumpinthemix.com");
  });

  it("sends a malformed invitation's failure to sign-in instead of echoing it", async () => {
    mocks.authorize.mockRejectedValue(new SocialAuthError(SOCIAL_INVITATION_UNAVAILABLE));
    const response = await start(provider, "invite=%3Cscript%3E");
    expect(landing(response).message).toBe(SOCIAL_INVITATION_UNAVAILABLE);
    expect(response.headers.get("location")).not.toContain("script");
  });
});
