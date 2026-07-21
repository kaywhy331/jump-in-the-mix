import { env } from "@/lib/env";
import type { GoogleCredentials } from "@/lib/google-contacts";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
const DEFAULT_SCOPES = ["openid", "email", GOOGLE_CONTACTS_SCOPE].join(" ");

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type VerifiedGoogleAccount = {
  sub?: string;
  email?: string;
  name?: string;
};

function accountId(account: VerifiedGoogleAccount): string | null {
  return account.sub?.trim() || account.email?.trim().toLowerCase() || null;
}

function providerMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.error_description === "string") return candidate.error_description.slice(0, 500);
  if (typeof candidate.error === "string") return candidate.error.slice(0, 500);
  return fallback;
}

async function fetchJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === "TimeoutError" ? `${fallback} timed out.` : `${fallback} could not be reached.`);
  }
  const payload = await response.json().catch(() => ({})) as T;
  if (!response.ok) throw new Error(providerMessage(payload, fallback));
  return payload;
}

export async function exchangeGoogleAuthorizationCodeForVerifiedAccount(input: {
  code: string;
  codeVerifier?: string | null;
  existingExternalAccountId?: string | null;
  existingRefreshToken?: string | null;
}): Promise<{ credentials: GoogleCredentials; account: VerifiedGoogleAccount; accountChanged: boolean }> {
  const parameters: Record<string, string> = {
    code: input.code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: env.googleRedirectUri,
    grant_type: "authorization_code"
  };
  if (input.codeVerifier) parameters.code_verifier = input.codeVerifier;
  const token = await fetchJson<GoogleTokenResponse>(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters)
  }, "Google token exchange");
  if (!token.access_token) throw new Error("Google did not return an access token.");

  const account = await fetchJson<VerifiedGoogleAccount>(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${token.access_token}` }
  }, "Google account verification");
  const verifiedAccountId = accountId(account);
  if (!verifiedAccountId) throw new Error("Google did not return a stable account identifier.");
  const existingAccountId = input.existingExternalAccountId?.trim().toLowerCase() || null;
  const accountChanged = Boolean(existingAccountId && existingAccountId !== verifiedAccountId.toLowerCase());
  const refreshToken = token.refresh_token
    || (!accountChanged && existingAccountId ? input.existingRefreshToken?.trim() : "")
    || "";
  if (!refreshToken) {
    throw new Error(
      accountChanged
        ? "Google did not return a refresh token for the newly selected account. Reconnect and approve offline access."
        : "Google did not return a refresh token. Reconnect and approve offline access."
    );
  }

  return {
    account,
    accountChanged,
    credentials: {
      accessToken: token.access_token,
      accessTokenExpiresAt: new Date(Date.now() + Math.max(token.expires_in ?? 3600, 60) * 1000).toISOString(),
      refreshToken,
      tokenType: token.token_type ?? "Bearer",
      scope: token.scope ?? DEFAULT_SCOPES
    }
  };
}
