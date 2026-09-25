import { openTestAdmission } from "./helpers/admission-fixture";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";

const context = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/lib/env", async importOriginal => {
  const original = await importOriginal<typeof import("../src/lib/env")>();
  // Dummy Google credentials: nothing reaches Google (the token exchange and signature check are stubbed below).
  return { ...original, env: { ...original.env, pilotMode: false, requireEmailVerification: true, appUrl: "https://jumpinthemix.test", dataEncryptionKey: "social-invitation-integration-key-000001", authGoogleClientId: "google-client.test", authGoogleClientSecret: "google-secret-test" } };
});
vi.mock("jose", async importOriginal => ({ ...await importOriginal<typeof import("jose")>(), jwtVerify: context.verify }));
import { completeSocialAuthorization, createSocialAuthorization, hashOAuthValue, socialAuthFailurePath, SOCIAL_INVITATION_EMAIL_MISMATCH, SOCIAL_INVITATION_UNAVAILABLE, SOCIAL_REDEMPTION_PAUSED, SocialAuthError, socialNoAccountMessage } from "../src/lib/social-auth";
import { encryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { AUTH_TOKEN_PURPOSES, hashAuthToken } from "../src/lib/auth-tokens";
import { verifiedErrorMessage } from "../src/lib/form-errors";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const created = { emails: [] as string[], invites: [] as string[], states: [] as string[] };
const address = (label: string, domain = "example.test") => { const email = `${label}-${randomUUID()}@${domain}`; created.emails.push(email); return email; };
const base = "https://jumpinthemix.test";

async function invitation(recipient: { recipientEmail?: string; recipientPhone?: string }) {
  const token = randomBytes(32).toString("base64url");
  const invite = await prisma.referralAccessInvite.create({ data: { ...recipient, manualDelivery: Boolean(recipient.recipientPhone), source: "WAITLIST_MANUAL", tokenHash: hashAuthToken(token), tokenCiphertext: encryptIntegrationCredentials({ token }) } });
  created.invites.push(invite.id);
  return { token, invite };
}

async function start(invite: string | null = null) {
  const url = await createSocialAuthorization("GOOGLE", null, invite);
  const state = url.searchParams.get("state")!;
  created.states.push(hashOAuthValue(state));
  return { url, state, nonce: url.searchParams.get("nonce")! };
}

async function signIn(profile: { email: string; sub?: string }, invite: string | null = null) {
  const { state, nonce } = await start(invite);
  context.verify.mockResolvedValueOnce({ payload: { sub: profile.sub ?? `google-${randomUUID()}`, email: profile.email, email_verified: true, nonce, name: "Invited Person" } });
  return completeSocialAuthorization({ provider: "GOOGLE", state, code: "authorization-code" });
}

const failureOf = (promise: Promise<unknown>) => promise.then(() => { throw new Error("Expected the sign-in to fail"); }, (error: unknown) => error as SocialAuthError);

describe.skipIf(!local)("Google and Apple sign-up from an invitation, with PostgreSQL", () => {
  let restoreAdmission: (() => Promise<void>) | undefined;
  beforeAll(async () => {
    restoreAdmission = await openTestAdmission();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id_token: "signed-id-token" }), { status: 200 })));
  });
  afterEach(async () => {
    await prisma.admissionPolicy.update({ where: { id: "default" }, data: { redemptionPaused: false } });
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: created.emails } }, select: { id: true } });
    await prisma.workspace.deleteMany({ where: { ownerId: { in: users.map(user => user.id) } } });
    await prisma.referralAccessInvite.deleteMany({ where: { id: { in: created.invites } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await prisma.verificationToken.deleteMany({ where: { email: { in: created.emails } } });
    await prisma.authOAuthState.deleteMany({ where: { stateHash: { in: created.states } } });
    await restoreAdmission?.();
    vi.unstubAllGlobals();
  });

  it("stores the invitation with the sign-in request as hashAuthToken(token) and its id", async () => {
    const { token, invite } = await invitation({ recipientEmail: address("stored") });
    const { state } = await start(token);
    const row = await prisma.authOAuthState.findUniqueOrThrow({ where: { stateHash: hashOAuthValue(state) } });
    expect(row.inviteTokenHash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(row.inviteTokenHash).toBe(invite.tokenHash);
    expect(row.inviteId).toBe(invite.id);
  });

  it("creates the invited account from a matching Google email and accepts the invitation", async () => {
    const email = address("invited");
    const { token, invite } = await invitation({ recipientEmail: email });
    const result = await signIn({ email }, token);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { authIdentities: true, ownedWorkspaces: true } });
    expect(result).toEqual({ userId: user.id, returnTo: "/onboarding" });
    expect(user).toMatchObject({ passwordHash: null });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.authIdentities.map(identity => identity.provider)).toEqual(["GOOGLE"]);
    expect(user.ownedWorkspaces).toHaveLength(1);
    expect(await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ acceptedUserId: user.id });
    await expect(failureOf(signIn({ email: address("second") }, token))).resolves.toMatchObject({ message: SOCIAL_INVITATION_UNAVAILABLE });
  });

  it("keeps an email invitation unused when the provider's address differs, and returns to the invitation", async () => {
    const { token, invite } = await invitation({ recipientEmail: address("recipient") });
    const other = address("other");
    const failure = await failureOf(signIn({ email: other }, token));
    expect(failure).toBeInstanceOf(SocialAuthError);
    expect(failure.message).toBe(SOCIAL_INVITATION_EMAIL_MISMATCH);
    expect(failure.invitation).toEqual({ id: invite.id, tokenHash: invite.tokenHash });
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).toBeNull();
    expect(await prisma.user.count({ where: { email: other } })).toBe(0);
    const back = new URL(await socialAuthFailurePath("GOOGLE", failure), base);
    expect(back.pathname).toBe("/register");
    expect(back.searchParams.get("invite")).toBe(token);
    expect(verifiedErrorMessage(Object.fromEntries(back.searchParams))).toBe(SOCIAL_INVITATION_EMAIL_MISMATCH);
  });

  it("accepts any verified address for a text invitation, including an Apple relay address", async () => {
    const { token, invite } = await invitation({ recipientPhone: `+1555${String(Date.now()).slice(-7)}` });
    const email = address("texted", "privaterelay.appleid.com");
    const result = await signIn({ email }, token);
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedUserId).toBe(result.userId);
  });

  it("tells a new person on the sign-in page that accounts come from invitations", async () => {
    const email = address("stranger");
    const failure = await failureOf(signIn({ email }));
    expect(failure.message).toBe(socialNoAccountMessage("GOOGLE"));
    expect(failure.invitation).toBeNull();
    expect(new URL(await socialAuthFailurePath("GOOGLE", failure), base).pathname).toBe("/login");
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("checks the invitation and paused redemption before sending the person to the provider", async () => {
    const { token, invite } = await invitation({ recipientEmail: address("paused") });
    await prisma.admissionPolicy.update({ where: { id: "default" }, data: { redemptionPaused: true } });
    await expect(createSocialAuthorization("GOOGLE", null, token)).rejects.toThrow(SOCIAL_REDEMPTION_PAUSED);
    await prisma.admissionPolicy.update({ where: { id: "default" }, data: { redemptionPaused: false } });
    await prisma.referralAccessInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
    await expect(createSocialAuthorization("GOOGLE", null, token)).rejects.toThrow(SOCIAL_INVITATION_UNAVAILABLE);
    await expect(createSocialAuthorization("GOOGLE", null, "not-an-invitation")).rejects.toThrow(SOCIAL_INVITATION_UNAVAILABLE);
    expect(await prisma.authOAuthState.count({ where: { inviteId: invite.id } })).toBe(0);
  });

  it("refuses with the paused wording when redemption pauses while the person is at the provider", async () => {
    const email = address("paused-later");
    const { token, invite } = await invitation({ recipientEmail: email });
    const { state, nonce } = await start(token);
    await prisma.admissionPolicy.update({ where: { id: "default" }, data: { redemptionPaused: true } });
    context.verify.mockResolvedValueOnce({ payload: { sub: `google-${randomUUID()}`, email, email_verified: true, nonce } });
    const failure = await failureOf(completeSocialAuthorization({ provider: "GOOGLE", state, code: "authorization-code" }));
    expect(failure.message).toBe(SOCIAL_REDEMPTION_PAUSED);
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).toBeNull();
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("returns a canceled sign-up to its invitation once, and a replayed request to sign-in", async () => {
    const { token } = await invitation({ recipientEmail: address("canceled") });
    const { state } = await start(token);
    const canceled = await failureOf(completeSocialAuthorization({ provider: "GOOGLE", state, code: "", canceled: true }));
    expect(canceled.message).toBe("Google sign-in was canceled.");
    const back = new URL(await socialAuthFailurePath("GOOGLE", canceled), base);
    expect([back.pathname, back.searchParams.get("invite")]).toEqual(["/register", token]);
    const replay = await failureOf(completeSocialAuthorization({ provider: "GOOGLE", state, code: "", canceled: true }));
    expect(new URL(await socialAuthFailurePath("GOOGLE", replay), base).pathname).toBe("/login");
    const reused = await failureOf(completeSocialAuthorization({ provider: "GOOGLE", state, code: "authorization-code" }));
    expect(reused.message).toBe("The sign-in request expired. Please try again.");
    expect(new URL(await socialAuthFailurePath("GOOGLE", reused), base).pathname).toBe("/login");
  });

  it("takes an unverified password account away from whoever registered it before its owner signed in", async () => {
    const email = address("prehijack");
    const squatter = await prisma.user.create({ data: { email, name: "Someone else", passwordHash: await bcrypt.hash("the squatter's password", 4) } });
    await prisma.session.create({ data: { userId: squatter.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
    for (const purpose of [AUTH_TOKEN_PURPOSES.verifyEmail, AUTH_TOKEN_PURPOSES.resetPassword, AUTH_TOKEN_PURPOSES.magicLogin]) {
      await prisma.verificationToken.create({ data: { email, purpose, tokenHash: hashAuthToken(randomUUID()), expiresAt: new Date(Date.now() + 3600_000) } });
    }
    const result = await signIn({ email });
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: squatter.id }, include: { authIdentities: true } });
    expect(result.userId).toBe(squatter.id);
    expect(owner.passwordHash).toBeNull();
    expect(owner.emailVerifiedAt).not.toBeNull();
    expect(owner.authIdentities).toHaveLength(1);
    expect(await prisma.session.count({ where: { userId: squatter.id } })).toBe(0);
    expect(await prisma.verificationToken.count({ where: { email, usedAt: null } })).toBe(0);
  });

  it("links a verified account without touching its password or sessions", async () => {
    const email = address("verified");
    const passwordHash = await bcrypt.hash("the owner's password", 4);
    const owner = await prisma.user.create({ data: { email, name: "Owner", passwordHash, emailVerifiedAt: new Date() } });
    await prisma.session.create({ data: { userId: owner.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
    expect((await signIn({ email })).userId).toBe(owner.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash).toBe(passwordHash);
    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(1);
  });
});
