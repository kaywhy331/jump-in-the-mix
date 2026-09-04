import { describe, expect, it } from "vitest";
import {
  appleSignInConfigured,
  googleSignInConfigured,
  hashOAuthValue,
  identityNonceMatches,
  safeOAuthReturnTo
} from "../src/lib/social-auth";

describe("hosted social authentication", () => {
  it("derives a non-reversible PKCE/state digest", () => {
    const secret = "one-time-oauth-value";
    expect(hashOAuthValue(secret)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashOAuthValue(secret)).not.toContain(secret);
    expect(hashOAuthValue(secret)).toBe(hashOAuthValue(secret));
  });

  it("compares the signed identity nonce exactly", () => {
    expect(identityNonceMatches("expected-nonce", "expected-nonce")).toBe(true);
    expect(identityNonceMatches("different-nonce", "expected-nonce")).toBe(false);
    expect(identityNonceMatches(undefined, "expected-nonce")).toBe(false);
  });

  it("accepts only local return paths", () => {
    expect(safeOAuthReturnTo("/contacts?new=1")).toBe("/contacts?new=1");
    expect(safeOAuthReturnTo("//attacker.example/path")).toBeNull();
    expect(safeOAuthReturnTo("https://attacker.example/path")).toBeNull();
  });

  it("requires each provider's complete credential set", () => {
    expect(googleSignInConfigured({ authGoogleClientId: "client", authGoogleClientSecret: "secret" })).toBe(true);
    expect(googleSignInConfigured({ authGoogleClientId: "client", authGoogleClientSecret: " " })).toBe(false);
    expect(appleSignInConfigured({ authAppleClientId: "client", authAppleTeamId: "team", authAppleKeyId: "key", authApplePrivateKey: "private" })).toBe(true);
    expect(appleSignInConfigured({ authAppleClientId: "client", authAppleTeamId: "team", authAppleKeyId: "", authApplePrivateKey: "private" })).toBe(false);
  });
});
