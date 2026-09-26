import { customerReturnPath } from "@/lib/customer-return-path";
import { accountHome } from "@/lib/account-home";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTPayload } from "jose";
import type { AuthProvider, Prisma } from "@/generated/prisma/client";
import { createBusinessAccount, nameFromEmail } from "@/lib/account-provisioning";
import { getAdmissionPolicy } from "@/lib/admission";
import { hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { withSignedError } from "@/lib/form-errors";
import { decryptIntegrationCredentials } from "@/lib/integration-crypto";
import { prisma } from "@/lib/prisma";
import { AccessInviteError, validAccessToken } from "@/lib/referral-access";
import { emailVerificationRequired, releaseUnverifiedAccount } from "@/lib/unverified-account";

/** The invitation a sign-in started from: its id and hashAuthToken(token). The token itself is never stored. */
export type SocialInvitation = { id: string; tokenHash: string };

/** A sign-in failure the person can act on. Its message is fixed wording, so the sign-in page may show it. */
export class SocialAuthError extends Error {
  /** The invitation the sign-in request started from, once the request is known, so the failure can return to it. */
  invitation: SocialInvitation | null = null;
}

// Fixed wording for invitation sign-ups with Google or Apple.
export const SOCIAL_INVITATION_UNAVAILABLE = "This invitation is unavailable or has already been used.";
export const SOCIAL_REDEMPTION_PAUSED = "Account creation is temporarily paused. Your invitation has not been used. Please try this same link again later.";
export const SOCIAL_INVITATION_EMAIL_MISMATCH = "This invitation was sent to a different email address. Continue with the Google or Apple account that uses that address, or create your account with the email form. An Apple “Hide My Email” address can’t match an invitation.";
const OWNER_SETUP_COMPLETE = "Owner setup is already complete on this server.";

function providerName(provider: AuthProvider): string {
  return provider === "GOOGLE" ? "Google" : "Apple";
}

/** Google and Apple sign-in create an account only from an invitation; on /login the buttons are for existing accounts. */
export function socialNoAccountMessage(provider: AuthProvider): string {
  return `No Jump in the Mix account uses the email from your ${providerName(provider)} sign-in. To create an account, open the invitation link someone shared with you.`;
}

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
  return customerReturnPath(value);
}

export function identityNonceMatches(received: unknown, expected: string): boolean {
  if (typeof received !== "string") return false;
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

/**
 * The invitation a Google or Apple sign-up starts from, checked read-only before the person leaves for the
 * provider: it must still be unused and redemption must not be paused. The claim itself happens with the
 * account, in one transaction, when the person comes back. A private installation has no invitations.
 */
async function startingInvitation(token: string): Promise<SocialInvitation | null> {
  if (env.pilotMode) return null;
  if (!validAccessToken(token)) throw new SocialAuthError(SOCIAL_INVITATION_UNAVAILABLE);
  const tokenHash = hashAuthToken(token);
  const invite = await prisma.referralAccessInvite.findFirst({ where: { tokenHash, acceptedAt: null, revokedAt: null }, select: { id: true } });
  if (!invite) throw new SocialAuthError(SOCIAL_INVITATION_UNAVAILABLE);
  if ((await getAdmissionPolicy()).redemptionPaused) throw new SocialAuthError(SOCIAL_REDEMPTION_PAUSED);
  return { id: invite.id, tokenHash };
}

/** Where a failed start sends the person: back to their invitation when they came from one, else to sign-in. */
export function socialStartFailurePath(message: string, inviteToken: string | null | undefined): string {
  const back = inviteToken && !env.pilotMode && validAccessToken(inviteToken) ? `/register?invite=${encodeURIComponent(inviteToken)}` : "/login";
  return withSignedError(back, message);
}

export async function createSocialAuthorization(provider: AuthProvider, returnTo?: string | null, inviteToken?: string | null): Promise<URL> {
  if (provider === "GOOGLE" && !googleSignInConfigured()) throw new SocialAuthError("Google sign-in is not configured.");
  if (provider === "APPLE" && !appleSignInConfigured()) throw new SocialAuthError("Apple sign-in is not configured.");
  const invitation = inviteToken ? await startingInvitation(inviteToken) : null;
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
        expiresAt: new Date(Date.now() + env.oauthStateMinutes * 60_000),
        // hashAuthToken (hex SHA-256) is the hash ReferralAccessInvite.tokenHash holds, unlike hashOAuthValue.
        inviteTokenHash: invitation?.tokenHash ?? null,
        inviteId: invitation?.id ?? null
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
    throw new SocialAuthError("The sign-in request expired. Please try again.");
  }
  const claimed = await prisma.authOAuthState.updateMany({
    where: { id: stored.id, provider, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() }
  });
  if (claimed.count !== 1) throw new SocialAuthError("The sign-in request was already used.");
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
  if (!response.ok || !payload?.id_token) throw new SocialAuthError(`The ${provider === "GOOGLE" ? "Google" : "Apple"} sign-in could not be completed.`);
  return payload.id_token;
}

function verifiedEmail(payload: JWTPayload): string {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (!email || !verified || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SocialAuthError("The identity provider did not return a verified email address.");
  return email;
}

async function verifiedProfile(provider: AuthProvider, idToken: string, nonce: string, appleUser?: string | null) {
  const result = provider === "GOOGLE"
    ? await jwtVerify(idToken, googleJwks, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: env.authGoogleClientId })
    : await jwtVerify(idToken, appleJwks, { issuer: "https://appleid.apple.com", audience: env.authAppleClientId });
  if (!identityNonceMatches(result.payload.nonce, nonce) || !result.payload.sub) throw new SocialAuthError("The identity response could not be verified.");
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

type SocialProfile = { providerAccountId: string; email: string; name: string };

/** Each reason an invitation cannot be claimed, in fixed wording for the sign-in or invitation page. */
function invitationFailure(error: AccessInviteError, provider: AuthProvider): SocialAuthError {
  switch (error.code) {
    case "REDEMPTION_PAUSED": return new SocialAuthError(SOCIAL_REDEMPTION_PAUSED);
    case "UNAVAILABLE": return new SocialAuthError(SOCIAL_INVITATION_UNAVAILABLE);
    case "OWNER_SETUP_COMPLETE": return new SocialAuthError(OWNER_SETUP_COMPLETE);
    case "NO_INVITATION": return new SocialAuthError(socialNoAccountMessage(provider));
    default: return new SocialAuthError(`Your invitation could not be used with ${providerName(provider)}. Open it again, or create your account with the email form.`);
  }
}

/*
 * An email invitation belongs to one address. Checked read-only before the claim so a different provider
 * address gets its own answer, and the invitation stays unused. A text invitation accepts any address.
 */
async function checkInvitationRecipient(tx: Prisma.TransactionClient, invitation: SocialInvitation, email: string): Promise<void> {
  const invite = await tx.referralAccessInvite.findFirst({ where: { id: invitation.id, tokenHash: invitation.tokenHash, acceptedAt: null, revokedAt: null }, select: { recipientEmail: true } });
  if (invite?.recipientEmail && invite.recipientEmail.trim().toLowerCase() !== email) throw new SocialAuthError(SOCIAL_INVITATION_EMAIL_MISMATCH);
}

async function findOrCreateSocialUser(provider: AuthProvider, profile: SocialProfile, invitation: SocialInvitation | null) {
  return prisma.$transaction(async (tx) => {
    const identity = await tx.authIdentity.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } }
    });
    if (identity) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: identity.userId }, select: { id: true, memberships: { select: { workspace: { select: { profile: { select: { onboardingDone: true } } } } }, take: 1 } } });
      return { userId: user.id, onboardingDone: user.memberships[0]?.workspace.profile?.onboardingDone ?? false };
    }
    let user = await tx.user.findUnique({ where: { email: profile.email }, select: { id: true, email: true, emailVerifiedAt: true, memberships: { select: { workspace: { select: { profile: { select: { onboardingDone: true } } } } }, take: 1 } } });
    if (!user) {
      if (env.pilotMode && await tx.user.count() > 0) throw new SocialAuthError(OWNER_SETUP_COMPLETE);
      if (invitation) await checkInvitationRecipient(tx, invitation, profile.email);
      let created: Awaited<ReturnType<typeof createBusinessAccount>>;
      try {
        created = await createBusinessAccount(tx, { email: profile.email, name: profile.name, passwordHash: null, emailVerifiedAt: new Date(), accessTokenHash: invitation?.tokenHash ?? null });
      } catch (error) {
        if (error instanceof AccessInviteError) throw invitationFailure(error, provider);
        throw error;
      }
      user = { id: created.id, email: created.email, emailVerifiedAt: new Date(), memberships: [] };
    } else if (!user.emailVerifiedAt && emailVerificationRequired()) {
      await releaseUnverifiedAccount(tx, user, new Date());
    } else {
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    }
    await tx.authIdentity.create({ data: { userId: user.id, provider, providerAccountId: profile.providerAccountId, email: profile.email } });
    return { userId: user.id, onboardingDone: user.memberships[0]?.workspace.profile?.onboardingDone ?? false };
  }, { isolationLevel: "Serializable" });
}

function stateInvitation(state: { inviteId: string | null; inviteTokenHash: string | null } | null): SocialInvitation | null {
  return state?.inviteId && state.inviteTokenHash ? { id: state.inviteId, tokenHash: state.inviteTokenHash } : null;
}

// Our own fixed wording passes through; anything else is logged and replaced with a fixed sentence.
function failure(error: unknown, invitation: SocialInvitation | null, provider: AuthProvider): SocialAuthError {
  if (!(error instanceof SocialAuthError)) console.error(`${providerName(provider)} sign-in could not be completed`, error);
  const failed = error instanceof SocialAuthError ? error : new SocialAuthError(`${providerName(provider)} sign-in could not be completed. Please try again.`);
  failed.invitation = invitation;
  return failed;
}

export async function completeSocialAuthorization(input: {
  provider: AuthProvider;
  state: string;
  code: string;
  appleUser?: string | null;
  canceled?: boolean;
}): Promise<{ userId: string; returnTo: string }> {
  if (input.canceled) {
    // Spend the request anyway, so a canceled sign-up that started from an invitation can return to it.
    const state = input.state ? await claimOAuthState(input.provider, input.state).catch(() => null) : null;
    throw failure(new SocialAuthError(`${providerName(input.provider)} sign-in was canceled.`), stateInvitation(state), input.provider);
  }
  if (!input.state || !input.code) throw new SocialAuthError("The sign-in response was incomplete.");
  const state = await claimOAuthState(input.provider, input.state);
  const invitation = stateInvitation(state);
  try {
    const idToken = await exchangeCode(input.provider, input.code, state.codeVerifier);
    const profile = await verifiedProfile(input.provider, idToken, state.nonce, input.appleUser);
    let account: Awaited<ReturnType<typeof findOrCreateSocialUser>>;
    try {
      account = await findOrCreateSocialUser(input.provider, profile, invitation);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "P2002" && code !== "P2034") throw error;
      account = await findOrCreateSocialUser(input.provider, profile, invitation);
    }
    return { userId: account.userId, returnTo: safeOAuthReturnTo(state.returnTo) ?? await accountHome(account.userId, account.onboardingDone ? "/jumps" : "/onboarding") };
  } catch (error) {
    throw failure(error, invitation, input.provider);
  }
}

/*
 * The invitation link to return to after a failed sign-up, rebuilt from the invitation's encrypted token.
 * Only a request that was claimed in this callback carries its invitation, so a replayed or expired
 * request never reveals a link.
 */
async function invitationLink(invitation: SocialInvitation): Promise<string | null> {
  try {
    const invite = await prisma.referralAccessInvite.findUnique({ where: { id: invitation.id }, select: { tokenHash: true, tokenCiphertext: true, tokenPurgedAt: true } });
    if (!invite || invite.tokenPurgedAt || !invite.tokenCiphertext || invite.tokenHash !== invitation.tokenHash) return null;
    const { token } = decryptIntegrationCredentials<{ token?: unknown }>(invite.tokenCiphertext);
    return typeof token === "string" && validAccessToken(token) && hashAuthToken(token) === invitation.tokenHash ? `/register?invite=${encodeURIComponent(token)}` : null;
  } catch {
    return null;
  }
}

/** Where a failed callback sends the person, with our signed fixed wording: their invitation, or sign-in. */
export async function socialAuthFailurePath(provider: AuthProvider, error: unknown): Promise<string> {
  const message = error instanceof SocialAuthError ? error.message : `${providerName(provider)} sign-in could not be completed. Please try again.`;
  const back = error instanceof SocialAuthError && error.invitation ? await invitationLink(error.invitation) : null;
  return withSignedError(back ?? "/login", message);
}

export type SocialAuthTransaction = Prisma.TransactionClient;
