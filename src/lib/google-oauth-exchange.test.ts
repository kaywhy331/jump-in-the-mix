import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeGoogleAuthorizationCodeForVerifiedAccount } from "@/lib/google-oauth-exchange";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("Google OAuth account binding", () => {
  it("reuses an existing refresh token only after the same account is verified", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "new-access", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ sub: "google-user-1", email: "same@example.com", name: "Same User" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeGoogleAuthorizationCodeForVerifiedAccount({
      code: "authorization-code",
      existingExternalAccountId: "google-user-1",
      existingAccountEmail: "same@example.com",
      existingRefreshToken: "existing-refresh"
    });

    expect(result.accountChanged).toBe(false);
    expect(result.credentials.refreshToken).toBe("existing-refresh");
  });

  it("rejects cross-account refresh-token reuse when Google omits a new token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "new-access", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ sub: "google-user-2", email: "different@example.com" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeGoogleAuthorizationCodeForVerifiedAccount({
      code: "authorization-code",
      existingExternalAccountId: "google-user-1",
      existingAccountEmail: "same@example.com",
      existingRefreshToken: "old-account-refresh"
    })).rejects.toThrow(/newly selected account/i);
  });

  it("accepts a newly issued refresh token for a changed account", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ sub: "google-user-2", email: "different@example.com" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeGoogleAuthorizationCodeForVerifiedAccount({
      code: "authorization-code",
      existingExternalAccountId: "google-user-1",
      existingAccountEmail: "same@example.com",
      existingRefreshToken: "old-account-refresh"
    });

    expect(result.accountChanged).toBe(true);
    expect(result.credentials.refreshToken).toBe("new-refresh");
  });
});
