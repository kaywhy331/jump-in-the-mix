import { describe, expect, it } from "vitest";
import {
  appleSignInConfigured,
  googleSignInConfigured,
  hashOAuthValue,
  identityNonceMatches,
  safeOAuthReturnTo,
  SOCIAL_INVITATION_EMAIL_MISMATCH,
  SocialAuthError,
  socialNoAccountMessage,
  socialStartFailurePath
} from "../src/lib/social-auth";
import { hashAuthToken } from "../src/lib/auth-tokens";
import { verifiedErrorMessage } from "../src/lib/form-errors";

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

  it("stores invitations with the invitation hash, which differs from the OAuth state hash", () => {
    const token = "t".repeat(43);
    // ReferralAccessInvite.tokenHash is hex SHA-256 (hashAuthToken); the state hash is base64url.
    expect(hashAuthToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAuthToken(token)).not.toBe(hashOAuthValue(token));
  });

  it("returns a failed start to the invitation it came from, and anything else to sign-in", () => {
    const token = "t".repeat(43);
    const back = new URL(socialStartFailurePath(SOCIAL_INVITATION_EMAIL_MISMATCH, token), "https://jumpinthemix.com");
    expect(back.pathname).toBe("/register");
    expect(back.searchParams.get("invite")).toBe(token);
    expect(verifiedErrorMessage(Object.fromEntries(back.searchParams))).toBe(SOCIAL_INVITATION_EMAIL_MISMATCH);
    for (const invite of [null, "", "too-short", `${token}x`]) expect(new URL(socialStartFailurePath("Google sign-in could not be started.", invite), "https://jumpinthemix.com").pathname).toBe("/login");
  });

  it("words each invitation outcome as fixed text that names the provider and Hide My Email", () => {
    expect(socialNoAccountMessage("GOOGLE")).toBe("No Jump in the Mix account uses the email from your Google sign-in. To create an account, open the invitation link someone shared with you.");
    expect(socialNoAccountMessage("APPLE")).toContain("your Apple sign-in");
    expect(SOCIAL_INVITATION_EMAIL_MISMATCH).toContain("Hide My Email");
    expect(new SocialAuthError("x").invitation).toBeNull();
  });
});

