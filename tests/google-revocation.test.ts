import { afterEach, describe, expect, it, vi } from "vitest";
import { revokeGoogleCredentials } from "../src/lib/google-contacts";
import { encryptIntegrationCredentials } from "../src/lib/integration-crypto";

const connection = () => ({
  credentialsCiphertext: encryptIntegrationCredentials({ accessToken: "test-access-token", refreshToken: "test-refresh-token" })
});

afterEach(() => vi.unstubAllGlobals());

describe("Google credential revocation", () => {
  it.each([200, 400])("treats HTTP %s as a completed or already-revoked result", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(revokeGoogleCredentials(connection())).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/revoke",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) })
    );
  });

  it.each([401, 429, 500])("reports HTTP %s while allowing callers to continue local deletion", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(revokeGoogleCredentials(connection())).rejects.toThrow("local connection can still be removed");
  });

  it("bounds a provider timeout and reports it to the caller", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      const rejectTimeout = () => reject(new DOMException("Timed out", "TimeoutError"));
      if (init?.signal?.aborted) rejectTimeout();
      else init?.signal?.addEventListener("abort", rejectTimeout, { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(new DOMException("Timed out", "TimeoutError")));
    await expect(revokeGoogleCredentials(connection())).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
