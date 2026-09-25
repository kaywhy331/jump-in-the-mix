import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rate: vi.fn(), clear: vi.fn(), clearUnlessBlocked: vi.fn(), release: vi.fn(),
  findUser: vi.fn(), countUsers: vi.fn(), findInvite: vi.fn(), findMembership: vi.fn(), transaction: vi.fn(),
  compare: vi.fn(), issueToken: vi.fn(), findUsableToken: vi.fn(), limitReached: vi.fn(), emailConfigured: vi.fn(),
  sendMagic: vi.fn(), sendReset: vi.fn(), sendVerification: vi.fn(), sendChanged: vi.fn(), createSession: vi.fn(),
  cookies: new Map<string, string>(), writes: [] as Array<{ name: string; value: string; options: Record<string, unknown> }>
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => mocks.cookies.has(name) ? { name, value: mocks.cookies.get(name) } : undefined,
  set: (name: string, value: string, options: Record<string, unknown>) => { mocks.writes.push({ name, value, options }); mocks.cookies.set(name, value); }
}) }));
vi.mock("bcryptjs", () => ({ default: { hash: async () => "hashed-password", compare: mocks.compare } }));
vi.mock("@/lib/env", () => ({ env: { pilotMode: false, requireEmailVerification: true, emailVerificationHours: 24, passwordResetMinutes: 30, cookieName: "jitm_session", authRateLimitSecret: "auth-abuse-test-secret-0000000000000001", secureSessionCookie: true, sessionMaxDays: 90 } }));
vi.mock("@/lib/auth", () => ({ createSession: mocks.createSession, destroyAllSessionsForUser: vi.fn(), destroyOtherSessions: vi.fn(), destroySession: vi.fn(), requireSession: vi.fn(), requireWorkspace: vi.fn(), rotateSession: vi.fn() }));
vi.mock("@/lib/auth-tokens", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/auth-tokens")>(), issueAuthToken: mocks.issueToken, findUsableAuthToken: mocks.findUsableToken }));
vi.mock("@/lib/auth-email", () => ({ sendMagicLoginEmail: mocks.sendMagic, sendPasswordChangedEmail: mocks.sendChanged, sendPasswordResetEmail: mocks.sendReset, sendVerificationEmail: mocks.sendVerification }));
vi.mock("@/lib/email-budget", () => ({ authEmailLimitReached: mocks.limitReached, emailRecipientHash: (email: string) => `keyed(${email})` }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser, count: mocks.countUsers }, referralAccessInvite: { findFirst: mocks.findInvite }, workspaceMember: { findFirst: mocks.findMembership }, $transaction: mocks.transaction } }));
vi.mock("@/lib/rate-limit", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/rate-limit")>(), consumeRateLimit: mocks.rate, clearRateLimit: mocks.clear, clearRateLimitUnlessBlocked: mocks.clearUnlessBlocked, releaseRateLimitAttempt: mocks.release }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "203.0.113.5", userAgent: "vitest" }) }));
vi.mock("@/lib/transactional-email", () => ({ transactionalEmailConfigured: mocks.emailConfigured, withEmailAttempts: (_attempts: number, send: () => Promise<unknown>) => send() }));
vi.mock("@/lib/access-lock", () => ({ lockAccess: vi.fn() }));
vi.mock("@/lib/account-home", () => ({ accountHome: async (_id: string, path: string) => path }));
vi.mock("@/lib/account-provisioning", () => ({ createBusinessAccount: vi.fn() }));
vi.mock("@/lib/referral-access", () => ({ AccessInviteError: class AccessInviteError extends Error {}, validAccessToken: (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token) }));
vi.mock("@/lib/magic-link", () => ({ claimMagicLink: vi.fn(), MagicLinkError: class MagicLinkError extends Error {}, magicLinkCookieName: () => "jitm_session_magic", magicLinkCookieOptions: () => ({}), magicLinkFailureMessage: () => "failed" }));
import { changeUnverifiedEmailFormAction, loginFormAction, requestMagicLinkFormAction, requestPasswordResetFormAction, resendVerificationFormAction, resetPasswordFormAction } from "../src/lib/auth-actions";
import { isKnownDevice, knownDeviceCookie } from "../src/lib/rate-limit";

const IP = "203.0.113.5";
const DEVICE = "jitm_session_device";
const USER = { id: "user-1", email: "owner@example.test", name: "Owner", passwordHash: "stored-hash", emailVerifiedAt: new Date(), suspendedAt: null };
const STEP_UP = { "auth.login.email": { allowed: false, remaining: 0, retryAfterSeconds: 1800 } };
const STEP_UP_MESSAGE = "For your security, password sign-in for this email is paused for about 30 minutes. Use “Email me a secure sign-in link” below instead.";
type Outcome = { error?: string; redirect?: string };

function form(fields: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; }
function limits(blocked: Record<string, { allowed: boolean; remaining: number; retryAfterSeconds: number }> = {}) {
  mocks.rate.mockImplementation(async (input: { scope: string }) => blocked[input.scope] ?? { allowed: true, remaining: 1, retryAfterSeconds: 0 });
}
const scopes = () => mocks.rate.mock.calls.map(([input]) => input.scope);
async function run(action: Promise<Outcome>): Promise<Outcome> {
  try { return await action; } catch (error) { if (error instanceof Error && "digest" in error) return { redirect: error.message }; throw error; }
}
const signedInBefore = (userId: string) => mocks.cookies.set(DEVICE, knownDeviceCookie(undefined, userId).value);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookies.clear(); mocks.writes.length = 0;
  limits();
  mocks.emailConfigured.mockReturnValue(true);
  mocks.limitReached.mockResolvedValue(false);
  mocks.issueToken.mockResolvedValue("issued-token");
  mocks.compare.mockResolvedValue(false);
  mocks.findUser.mockResolvedValue(null);
  mocks.findMembership.mockResolvedValue({ workspace: { profile: { onboardingDone: true } } });
  mocks.createSession.mockResolvedValue("session-1");
  for (const send of [mocks.sendMagic, mocks.sendReset, mocks.sendVerification, mocks.sendChanged]) send.mockResolvedValue(undefined);
});

describe("password sign-in limits", () => {
  const login = (email: string, password = "a guess") => run(loginFormAction({}, form({ email, password })));

  it("keys the hard block on the email and client address, and the step-up on the email alone", async () => {
    await login("Owner@Example.test");
    expect(mocks.rate.mock.calls.map(([input]) => [input.scope, input.identifiers, input.limit])).toEqual([
      ["auth.login.ip", [IP], 30], ["auth.login.email-ip", ["owner@example.test", IP], 10], ["auth.login.email", ["owner@example.test"], 10]
    ]);
  });

  it("still blocks this email from this client address, before the step-up is counted", async () => {
    limits({ "auth.login.email-ip": { allowed: false, remaining: 0, retryAfterSeconds: 1800 } });
    expect(await login(USER.email)).toEqual({ error: "Too many attempts. Try again in about 30 minutes." });
    expect(scopes()).not.toContain("auth.login.email");
  });

  it("answers a step-up the same with or without an account, and checks no password", async () => {
    limits(STEP_UP);
    const withoutAccount = await login("nobody@example.test");
    mocks.findUser.mockResolvedValue(USER);
    expect(withoutAccount).toEqual({ error: STEP_UP_MESSAGE });
    expect(await login(USER.email)).toEqual({ error: STEP_UP_MESSAGE });
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("falls back to the plain wait when email sign-in links are unavailable", async () => {
    limits(STEP_UP); mocks.emailConfigured.mockReturnValue(false);
    expect(await login(USER.email)).toEqual({ error: "Too many attempts. Try again in about 30 minutes." });
  });

  it("lets a browser that signed in to the account before use its password during a step-up", async () => {
    limits(STEP_UP); mocks.findUser.mockResolvedValue(USER); mocks.compare.mockResolvedValue(true);
    signedInBefore(USER.id);
    expect(await login(USER.email, "correct")).toEqual({ redirect: "/jumps" });
    expect(mocks.createSession).toHaveBeenCalledWith(USER.id);
    signedInBefore("someone-else");
    expect(await login(USER.email, "correct")).toEqual({ error: STEP_UP_MESSAGE });
  });

  it("remembers the browser and clears only this address's failures after a successful sign-in", async () => {
    mocks.findUser.mockResolvedValue(USER); mocks.compare.mockResolvedValue(true);
    expect(await login(USER.email, "correct")).toEqual({ redirect: "/jumps" });
    expect(mocks.clear).toHaveBeenCalledWith("auth.login.email-ip", [USER.email, IP]);
    expect(mocks.clearUnlessBlocked).toHaveBeenCalledWith("auth.login.email", [USER.email]);
    expect(mocks.release).toHaveBeenCalledWith("auth.login.ip", [IP]);
    const marker = mocks.writes.find(write => write.name === DEVICE)!;
    expect(marker.options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    expect(isKnownDevice(marker.value, USER.id)).toBe(true);
  });
});

describe("daily account-email limits per address", () => {
  it("sends a capped address the same page as an address with no account", async () => {
    const sent = { redirect: "/login?magicSent=1&next=%2Fcontacts" };
    expect(await run(requestMagicLinkFormAction({}, form({ email: "nobody@example.test", next: "/contacts" })))).toEqual(sent);
    mocks.findUser.mockResolvedValue({ id: USER.id, suspendedAt: null }); mocks.limitReached.mockResolvedValue(true);
    expect(await run(requestMagicLinkFormAction({}, form({ email: USER.email, next: "/contacts" })))).toEqual(sent);
    expect(mocks.limitReached).toHaveBeenCalledWith(USER.email, "magicLogin");
    expect(mocks.issueToken).not.toHaveBeenCalled();
    expect(mocks.sendMagic).not.toHaveBeenCalled();
  });

  it("keeps sending sign-in links to a browser that has signed in to the account", async () => {
    mocks.findUser.mockResolvedValue({ id: USER.id, suspendedAt: null }); mocks.limitReached.mockResolvedValue(true);
    signedInBefore(USER.id);
    expect((await run(requestMagicLinkFormAction({}, form({ email: USER.email })))).redirect).toMatch(/^\/login\?magicSent=1/);
    expect(mocks.limitReached).not.toHaveBeenCalled();
    expect(mocks.sendMagic).toHaveBeenCalledWith(USER.email, "issued-token", null);
  });

  it("gives password reset the same silent limit and the same exemption", async () => {
    mocks.findUser.mockResolvedValue({ id: USER.id, email: USER.email, name: USER.name }); mocks.limitReached.mockResolvedValue(true);
    expect(await run(requestPasswordResetFormAction({}, form({ email: USER.email })))).toEqual({ redirect: "/forgot-password?sent=1" });
    expect(mocks.limitReached).toHaveBeenCalledWith(USER.email, "resetPassword");
    expect(mocks.sendReset).not.toHaveBeenCalled();
    signedInBefore(USER.id);
    await run(requestPasswordResetFormAction({}, form({ email: USER.email })));
    expect(mocks.sendReset).toHaveBeenCalledWith(USER.email, USER.name, "issued-token");
  });

  it("answers a capped verification resend with the same page", async () => {
    mocks.findUser.mockResolvedValue({ email: USER.email, name: USER.name, emailVerifiedAt: null }); mocks.limitReached.mockResolvedValue(true);
    expect(await run(resendVerificationFormAction({}, form({ email: USER.email })))).toEqual({ redirect: "/verify-email/pending?email=owner%40example.test&sent=1" });
    expect(mocks.limitReached).toHaveBeenCalledWith(USER.email, "verifyEmail");
    expect(mocks.issueToken).not.toHaveBeenCalled();
  });

  it("remembers the browser that completed a password reset, so a step-up does not block it", async () => {
    mocks.findUsableToken.mockResolvedValue({ id: "token-1", email: USER.email });
    mocks.findUser.mockResolvedValue(USER);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ verificationToken: { updateMany: async () => ({ count: 1 }) }, user: { update: vi.fn() }, adminMfaSession: { deleteMany: vi.fn() }, session: { deleteMany: vi.fn() } }));
    expect(await run(resetPasswordFormAction({}, form({ token: "reset-token", password: "a new long password", confirmPassword: "a new long password" })))).toEqual({ redirect: "/login?reset=1" });
    expect(isKnownDevice(mocks.writes.find(write => write.name === DEVICE)!.value, USER.id)).toBe(true);
  });
});

describe("correcting a mistyped email before verification", () => {
  const REFUSED = "We couldn’t change the email. Check the email and password you signed up with. Only an account created from a text invitation can change its email here, before it is verified.";
  const TAKEN = "An account with that email already exists. Choose another address.";
  const unverified = { id: "user-2", name: "Texted Member", passwordHash: "stored-hash", emailVerifiedAt: null as Date | null, suspendedAt: null as Date | null };
  const current = { email: "typo@example.test", passwordHash: "stored-hash", emailVerifiedAt: null as Date | null, suspendedAt: null };
  const change = (fields: Record<string, string> = {}) => run(changeUnverifiedEmailFormAction({}, form({ email: "Typo@Example.test", password: "the password", newEmail: "right@example.test", confirmNewEmail: " Right@example.test ", ...fields })));
  // A test double for the transaction client.
  let tx: any;
  const authenticated = () => { mocks.findUser.mockResolvedValue(unverified); mocks.compare.mockResolvedValue(true); mocks.findInvite.mockResolvedValue({ id: "invite-9" }); };

  beforeEach(() => {
    tx = {
      user: { findUnique: vi.fn(async ({ where }: { where: { id?: string } }) => where.id ? current : null), update: vi.fn() },
      verificationToken: { updateMany: vi.fn(async () => ({ count: 1 })) },
      adminMfaSession: { deleteMany: vi.fn() }, session: { deleteMany: vi.fn() }, waitlistEntry: { updateMany: vi.fn() },
      workspace: { findFirst: vi.fn(async () => ({ id: "workspace-2" })) }, auditLog: { create: vi.fn() }
    };
    mocks.transaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback(tx));
  });

  it("checks what was typed before counting or reading anything", async () => {
    expect(await change({ newEmail: "not-an-address", confirmNewEmail: "not-an-address" })).toEqual({ error: "Enter the correct email address." });
    expect(await change({ confirmNewEmail: "rite@example.test" })).toEqual({ error: "The new email addresses don't match." });
    expect(await change({ newEmail: "typo@example.test", confirmNewEmail: "typo@example.test" })).toEqual({ error: "Enter a different email address from the one you signed up with." });
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("answers every refusal identically, always checks a password, and changes nothing", async () => {
    const cases: Array<() => void> = [
      () => mocks.findUser.mockResolvedValue(null),
      () => { mocks.findUser.mockResolvedValue(unverified); mocks.compare.mockResolvedValue(false); },
      () => { mocks.findUser.mockResolvedValue({ ...unverified, emailVerifiedAt: new Date() }); mocks.compare.mockResolvedValue(true); },
      () => { mocks.findUser.mockResolvedValue({ ...unverified, suspendedAt: new Date() }); mocks.compare.mockResolvedValue(true); },
      // An email invitation, the private owner or a Google account: no text invitation made this account.
      () => { mocks.findUser.mockResolvedValue(unverified); mocks.compare.mockResolvedValue(true); mocks.findInvite.mockResolvedValue(null); }
    ];
    for (const arrange of cases) { arrange(); expect(await change()).toEqual({ error: REFUSED }); }
    expect(mocks.compare).toHaveBeenCalledTimes(cases.length);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(scopes().filter(scope => scope === "auth.email-change.account")).toHaveLength(0);
  });

  it("shares the sign-in limits, including the step-up, counted before the account is read", async () => {
    limits(STEP_UP);
    expect(await change()).toEqual({ error: "Too many attempts. Try again in about 30 minutes." });
    expect(scopes()).toEqual(["auth.login.ip", "auth.login.email-ip", "auth.login.email"]);
    expect(mocks.rate.mock.calls[1][0].identifiers).toEqual(["typo@example.test", IP]);
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("moves the account to the corrected address, ends every link for the old one, audits it and sends a new link", async () => {
    authenticated();
    expect(await change()).toEqual({ redirect: "/verify-email/pending?email=right%40example.test&sent=1&devToken=issued-token" });
    expect(mocks.findInvite).toHaveBeenCalledWith({ where: { acceptedUserId: "user-2", recipientEmail: null, recipientPhone: { not: null } }, select: { id: true } });
    expect(scopes()).toEqual(["auth.login.ip", "auth.login.email-ip", "auth.login.email", "auth.email-change.account"]);
    expect(mocks.rate.mock.calls[3][0]).toMatchObject({ identifiers: ["user-2"], limit: 3 });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "user-2" }, data: { email: "right@example.test" } });
    // Every purpose for the old address; the account links for the new one.
    expect(tx.verificationToken.updateMany).toHaveBeenCalledWith({ where: { email: "typo@example.test", usedAt: null }, data: { usedAt: expect.any(Date) } });
    expect(tx.verificationToken.updateMany).toHaveBeenCalledWith({ where: { email: "right@example.test", usedAt: null, purpose: { in: ["verify_email", "reset_password", "magic_login"] } }, data: { usedAt: expect.any(Date) } });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-2" } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ workspaceId: "workspace-2", actorType: "USER", actorUserId: "user-2", action: "account.email.change", entityId: "user-2", beforeData: { emailHash: "keyed(typo@example.test)" }, afterData: { emailHash: "keyed(right@example.test)" }, metadata: { accessInviteId: "invite-9", verified: false } }) });
    expect(mocks.clear).toHaveBeenCalledWith("auth.login.email-ip", ["typo@example.test", IP]);
    expect(mocks.limitReached).toHaveBeenCalledWith("right@example.test", "verifyEmail");
    expect(mocks.issueToken).toHaveBeenCalledWith("right@example.test", "verify_email", 24 * 60 * 60 * 1000);
    expect(mocks.sendVerification).toHaveBeenCalledWith("right@example.test", "Texted Member", "issued-token");
  });

  it("refuses an address that already has an account, including one taken at the same moment", async () => {
    authenticated();
    tx.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => where.id ? current : { id: "someone" });
    expect(await change()).toEqual({ error: TAKEN });
    expect(tx.user.update).not.toHaveBeenCalled();
    mocks.transaction.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed on the fields: (`email`)"), { code: "P2002" }));
    expect(await change()).toEqual({ error: TAKEN });
    mocks.transaction.mockRejectedValueOnce(Object.assign(new Error("write conflict"), { code: "P2034" }));
    expect(await change()).toEqual({ error: "Another change was processed at the same time. Please try again." });
    expect(mocks.sendVerification).not.toHaveBeenCalled();
  });

  it("refuses when the account changed after the password check", async () => {
    authenticated();
    tx.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => where.id ? { ...current, emailVerifiedAt: new Date() } : null);
    expect(await change()).toEqual({ error: REFUSED });
    tx.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => where.id ? { ...current, passwordHash: "reset-meanwhile" } : null);
    expect(await change()).toEqual({ error: REFUSED });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("limits how many addresses one account can mail in a day, once the password is right", async () => {
    authenticated();
    limits({ "auth.email-change.account": { allowed: false, remaining: 0, retryAfterSeconds: 86_400 } });
    expect(await change()).toEqual({ error: "Too many attempts. Try again in about 24 hours." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
