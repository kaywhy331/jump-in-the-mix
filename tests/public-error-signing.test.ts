import { beforeEach, describe, expect, it, vi } from "vitest";

const secret = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/env", () => ({ env: { get authRateLimitSecret() { return secret.value; } } }));
vi.mock("node:crypto", async original => {
  const actual = await original<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});
import { timingSafeEqual } from "node:crypto";
import { UNVERIFIED_ERROR_MESSAGE, verifiedErrorMessage, withSignedError } from "../src/lib/form-errors";

const params = (location: string) => Object.fromEntries(new URL(location, "https://jumpinthemix.com").searchParams);
const LURE = "Your account is suspended. Call +1 800 555 0100 to verify your card.";

beforeEach(() => { secret.value = "public-error-signing-test-secret-0001"; vi.mocked(timingSafeEqual).mockClear(); });

describe("signed error messages on public pages", () => {
  it("shows a message that one of our redirects signed", () => {
    const location = withSignedError("/login", "That sign-in link is invalid or expired.");
    expect(location).toMatch(/^\/login\?error=.+&sig=[\w-]+$/);
    expect(verifiedErrorMessage(params(location))).toBe("That sign-in link is invalid or expired.");
  });

  it("keeps an existing query string", () => {
    const location = withSignedError("/verify-email/pending?email=owner%40example.test", "Too many verification attempts. Try again later.");
    expect(params(location).email).toBe("owner@example.test");
    expect(verifiedErrorMessage(params(location))).toBe("Too many verification attempts. Try again later.");
  });

  it("replaces unsigned, altered or foreign-signed text with the fixed sentence", () => {
    const signed = params(withSignedError("/login", "That sign-in link was already used."));
    expect(verifiedErrorMessage({ error: LURE })).toBe(UNVERIFIED_ERROR_MESSAGE);
    expect(verifiedErrorMessage({ error: LURE, sig: signed.sig })).toBe(UNVERIFIED_ERROR_MESSAGE);
    expect(verifiedErrorMessage({ error: signed.error, sig: signed.sig.slice(1) })).toBe(UNVERIFIED_ERROR_MESSAGE);
    expect(verifiedErrorMessage({ error: signed.error, sig: `${signed.sig.slice(0, -1)}${signed.sig.endsWith("A") ? "B" : "A"}` })).toBe(UNVERIFIED_ERROR_MESSAGE);
    expect(verifiedErrorMessage({ error: [signed.error, LURE], sig: signed.sig })).toBe(UNVERIFIED_ERROR_MESSAGE);
    expect(verifiedErrorMessage({ error: signed.error, sig: [signed.sig, signed.sig] })).toBe(UNVERIFIED_ERROR_MESSAGE);
    expect(verifiedErrorMessage({ error: LURE }, "That verification link could not be used. Send another link below.")).toBe("That verification link could not be used. Send another link below.");
    // A signature made with another deployment's secret does not verify here.
    secret.value = "another-deployment-secret-000000000002";
    expect(verifiedErrorMessage(signed)).toBe(UNVERIFIED_ERROR_MESSAGE);
  });

  it("compares signatures in constant time", () => {
    const signed = params(withSignedError("/login", "Google sign-in is not configured."));
    expect(verifiedErrorMessage(signed)).toBe("Google sign-in is not configured.");
    expect(timingSafeEqual).toHaveBeenCalledTimes(1);
  });

  it("shows nothing without an error and bounds the signed text", () => {
    expect(verifiedErrorMessage({})).toBeNull();
    expect(verifiedErrorMessage({ error: "", sig: "anything" })).toBeNull();
    const signed = params(withSignedError("/login", "x".repeat(600)));
    expect(signed.error).toHaveLength(500);
    expect(verifiedErrorMessage(signed)).toBe("x".repeat(500));
    expect(verifiedErrorMessage({ error: "x".repeat(501), sig: signed.sig })).toBe(UNVERIFIED_ERROR_MESSAGE);
  });
});
