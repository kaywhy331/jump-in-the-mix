import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTPayload } from "jose";
import type { AuthProvider, Prisma } from "@/generated/prisma/client";
import { createBusinessAccount, nameFromEmail } from "@/lib/account-provisioning";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export function hashOAuthValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

function callbackUrl(provider: "google" | "apple"): string {
  return `${env.appUrl.replace(/\/$/, "")}/api/auth/oauth/${provider}/callback`;
}

type GoogleConfiguration = Pick<typeof env, "authGoogleClientId" | "authGoogleClientSecret">;
type AppleConfiguration = Pick<typeof env, "authAppleClientId" | "authAppleTeamId" | "authAppleKeyId" | "authApplePrivateKey">;

export function googleSignInConfigured(configuration: GoogleConfiguration = env): boolean {
  return Boolean(configuration.authGoogleClientId.trim() && configuration.authGoogleClientSecret.trim());
}

export function appleSignInConfigured(configuration: AppleConfiguration = env): boolean {
  return Boolean(configuration.authAppleClientId.trim() && configuration.authAppleTeamId.trim() && configuration.authAppleKeyId.trim() && configuration.authApplePrivateKey.trim());
}

export function safeOAuthReturnTo(value: string | null | undefined): string | null {
  return value?.startsWith("/") && !value.startsWith("//") ? value.slice(0, 500) : null;
}

export function identityNonceMatches(received: unknown, expected: string): boolean {
  if (typeof received !== "string") return false;
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

export async function createSocialAuthorization(provider: AuthProvider, returnTo?: string | null): Promise<URL> {
  if (provider === "GOOGLE" && !googleSignInConfigured()) throw new Error("Google sign-in is not configured.");
  if (provider === "APPLE" && !appleSignInConfigured()) throw new Error("Apple sign-in is not configured.");
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  await prisma.$transaction([
    prisma.authOAuthState.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
    prisma.authOAuthState.create({
      data: {
        provider,
        stateHash: hashOAuthValue(state),
        codeVerifier,
        nonce,
        returnTo: safeOAuthReturnTo(returnTo),
        expiresAt: new Date(Date.now() + env.oauthStateMinutes * 60_000)
      }
    })
  ]);
  const url = provider === "GOOGLE"
    ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
    : new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", provider === "GOOGLE" ? env.authGoogleClientId : env.authAppleClientId);
  url.searchParams.set("redirect_uri", callbackUrl(provider === "GOOGLE" ? "google" : "apple"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider === "GOOGLE" ? "openid email profile" : "name email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", hashOAuthValue(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  if (provider === "GOOGLE") {
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
  } else {
    url.searchParams.set("response_mode", "form_post");
  }
  return url;
}

async function claimOAuthState(provider: AuthProvider, state: string) {
  const stored = await prisma.authOAuthState.findUnique({ where: { stateHash: hashOAuthValue(state) } });
  if (!stored || stored.provider !== provider || stored.usedAt || stored.expiresAt <= new Date()) {
    throw new Error("The sign-in request expired. Please try again.");
  }
  const claimed = await prisma.authOAuthState.updateMany({
    where: { id: stored.id, provider, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() }
  });
  if (claimed.count !== 1) throw new Error("The sign-in request was already used.");
  return stored;
}

async function appleClientSecret(): Promise<string> {
  const key = await importPKCS8(env.authApplePrivateKey, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.authAppleKeyId })
    .setIssuer(env.authAppleTeamId)
    .setSubject(env.authAppleClientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

async function exchangeCode(provider: AuthProvider, code: string, codeVerifier: string): Promise<string> {
  const parameters = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(provider === "GOOGLE" ? "google" : "apple"),
    client_id: provider === "GOOGLE" ? env.authGoogleClientId : env.authAppleClientId,
    code_verifier: codeVerifier,
    client_secret: provider === "GOOGLE" ? env.authGoogleClientSecret : await appleClientSecret()
  });
  const response = await fetch(provider === "GOOGLE" ? "https://oauth2.googleapis.com/token" : "https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: parameters,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => null) as { id_token?: string; error?: string } | null;
  if (!response.ok || !payload?.id_token) throw new Error(`The ${provider === "GOOGLE" ? "Google" : "Apple"} sign-in could not be completed.`);
  return payload.id_token;
}

function verifiedEmail(payload: JWTPayload): string {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (!email || !verified || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("The identity provider did not return a verified email address.");
  return email;
}

async function verifiedProfile(provider: AuthProvider, idToken: string, nonce: string, appleUser?: string | null) {
  const result = provider === "GOOGLE"
    ? await jwtVerify(idToken, googleJwks, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: env.authGoogleClientId })
    : await jwtVerify(idToken, appleJwks, { issuer: "https://appleid.apple.com", audience: env.authAppleClientId });
  if (!identityNonceMatches(result.payload.nonce, nonce) || !result.payload.sub) throw new Error("The identity response could not be verified.");
  const email = verifiedEmail(result.payload);
  let name = typeof result.payload.name === "string" ? result.payload.name.trim() : "";
  if (provider === "APPLE" && appleUser) {
    try {
      const parsed = JSON.parse(appleUser) as { name?: { firstName?: string; lastName?: string } };
      name = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ").trim() || name;
    } catch { /* Apple sends the profile only on first authorization. */ }
  }
  return { providerAccountId: result.payload.sub, email, name: name.slice(0, 120) || nameFromEmail(email) };
}

async function findOrCreateSocialUser(provider: AuthProvider, profile: { providerAccountId: string; email: string; name: string }) {
  return prisma.$transaction(async (tx) => {
    const identity = await tx.authIdentity.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } }
    });
    if (identity) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: identity.userId }, select: { id: true, memberships: { select: { workspace: { select: { profile: { select: { onboardingDone: true } } } } }, take: 1 } } });
      return { userId: user.id, onboardingDone: user.memberships[0]?.workspace.profile?.onboardingDone ?? false };
    }
    let user = await tx.user.findUnique({ where: { email: profile.email }, select: { id: true, memberships: { select: { workspace: { select: { profile: { select: { onboardingDone: true } } } } }, take: 1 } } });
    if (!user) {
      if (env.pilotMode && await tx.user.count() > 0) throw new Error("Owner setup is already complete on this server.");
      const created = await createBusinessAccount(tx, { email: profile.email, name: profile.name, passwordHash: null, emailVerifiedAt: new Date() });
      user = { id: created.id, memberships: [] };
    } else {
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    }
    await tx.authIdentity.create({ data: { userId: user.id, provider, providerAccountId: profile.providerAccountId, email: profile.email } });
    return { userId: user.id, onboardingDone: user.memberships[0]?.workspace.profile?.onboardingDone ?? false };
  }, { isolationLevel: "Serializable" });
}

export async function completeSocialAuthorization(input: {
  provider: AuthProvider;
  state: string;
  code: string;
  appleUser?: string | null;
}): Promise<{ userId: string; returnTo: string }> {
  if (!input.state || !input.code) throw new Error("The sign-in response was incomplete.");
  const state = await claimOAuthState(input.provider, input.state);
  const idToken = await exchangeCode(input.provider, input.code, state.codeVerifier);
  const profile = await verifiedProfile(input.provider, idToken, state.nonce, input.appleUser);
  let account: Awaited<ReturnType<typeof findOrCreateSocialUser>>;
  try {
    account = await findOrCreateSocialUser(input.provider, profile);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "P2002" && code !== "P2034") throw error;
    account = await findOrCreateSocialUser(input.provider, profile);
  }
  return { userId: account.userId, returnTo: safeOAuthReturnTo(state.returnTo) ?? (account.onboardingDone ? "/jumps" : "/onboarding") };
}

export type SocialAuthTransaction = Prisma.TransactionClient;
