import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rate: vi.fn(), release: vi.fn(), clear: vi.fn(), findUser: vi.fn(), findInvite: vi.fn(), transaction: vi.fn(), createAccount: vi.fn(), issueToken: vi.fn(), sendVerification: vi.fn(), createSession: vi.fn(), limitReached: vi.fn(async () => false), attempts: vi.fn((_attempts: number, send: () => Promise<unknown>) => send()) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("bcryptjs", () => ({ default: { hash: async () => "hashed-password", compare: async () => false } }));
vi.mock("@/lib/env", () => ({ env: { pilotMode: false, requireEmailVerification: true, emailVerificationHours: 24 } }));
vi.mock("@/lib/auth", () => ({ createSession: mocks.createSession, destroyAllSessionsForUser: vi.fn(), destroyOtherSessions: vi.fn(), destroySession: vi.fn(), requireSession: vi.fn(), requireWorkspace: vi.fn(), rotateSession: vi.fn() }));
vi.mock("@/lib/auth-tokens", () => ({ AUTH_TOKEN_PURPOSES: { verifyEmail: "verify_email", resetPassword: "reset_password", magicLogin: "magic_login" }, findUsableAuthToken: vi.fn(), hashAuthToken: (token: string) => `hash:${token}`, issueAuthToken: mocks.issueToken }));
vi.mock("@/lib/auth-email", () => ({ sendMagicLoginEmail: vi.fn(), sendPasswordChangedEmail: vi.fn(), sendPasswordResetEmail: vi.fn(), sendVerificationEmail: mocks.sendVerification }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser }, referralAccessInvite: { findFirst: mocks.findInvite }, $transaction: mocks.transaction } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate, clearRateLimit: mocks.clear, releaseRateLimitAttempt: mocks.release }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "203.0.113.5", userAgent: "vitest" }) }));
vi.mock("@/lib/account-provisioning", () => ({ createBusinessAccount: mocks.createAccount }));
vi.mock("@/lib/referral-access", () => ({ AccessInviteError: class AccessInviteError extends Error {}, validAccessToken: (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token) }));
vi.mock("@/lib/transactional-email", () => ({ transactionalEmailConfigured: () => true, withEmailAttempts: mocks.attempts }));
vi.mock("@/lib/email-budget", () => ({ authEmailLimitReached: mocks.limitReached, emailRecipientHash: (email: string) => email }));
vi.mock("@/lib/access-lock", () => ({ lockAccess: vi.fn() }));
import { AccessInviteError } from "../src/lib/referral-access";
import { registerFormAction } from "../src/lib/auth-actions";

const TOKEN = "a".repeat(43);
const valid = { name: "Jordan Lee", email: "Jordan@Example.test", password: "a long enough password", invite: TOKEN };
function form(fields: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; }
const consumedScopes = () => mocks.rate.mock.calls.map(([input]) => input.scope);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  mocks.findUser.mockResolvedValue(null);
  mocks.findInvite.mockResolvedValue({ recipientEmail: "jordan@example.test", recipientPhone: null });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ user: { count: async () => 3 } }));
  mocks.createAccount.mockResolvedValue({ id: "user-1", email: "jordan@example.test", name: "Jordan Lee" });
  mocks.issueToken.mockResolvedValue("verify-token");
  mocks.sendVerification.mockResolvedValue(undefined);
  mocks.limitReached.mockResolvedValue(false);
});

describe("registration rate limits", () => {
  it.each([
    [60, "1 minute"],
    [3600, "60 minutes"],
    [5400, "2 hours"],
    [86_400, "24 hours"],
    [172_800, "2 days"]
  ])("describes a %i second wait as about %s", async (seconds, wait) => {
    mocks.rate.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: seconds });
    expect(await registerFormAction({}, form(valid))).toEqual({ error: `Too many attempts. Try again in about ${wait}.` });
  });

  it("checks the address limit only after the details are valid and the account is new", async () => {
    expect(await registerFormAction({}, form({ ...valid, email: "not-an-address" }))).toEqual({ error: "Enter your name and a valid email." });
    expect(consumedScopes()).toEqual(["auth.register.ip"]);
    mocks.findUser.mockResolvedValue({ id: "existing" });
    expect(await registerFormAction({}, form(valid))).toEqual({ error: "An account with that email already exists." });
    expect(consumedScopes()).toEqual(["auth.register.ip", "auth.register.ip"]);
  });

  it("counts a valid new registration against the address and releases it when the invitation cannot be claimed", async () => {
    mocks.transaction.mockRejectedValue(new AccessInviteError("This invitation is unavailable or has already been used."));
    expect(await registerFormAction({}, form(valid))).toEqual({ error: "This invitation is unavailable or has already been used." });
    expect(consumedScopes()).toEqual(["auth.register.ip", "auth.register.email"]);
    expect(mocks.rate.mock.calls[1][0]).toMatchObject({ identifiers: ["jordan@example.test"] });
    expect(mocks.release).toHaveBeenCalledWith("auth.register.email", ["jordan@example.test"]);
  });
});

describe("invitation addresses", () => {
  it("names the invited address when a different one is typed", async () => {
    mocks.findInvite.mockResolvedValue({ recipientEmail: "Invited@Example.test", recipientPhone: null });
    expect(await registerFormAction({}, form(valid))).toEqual({ error: "This invitation was sent to invited@example.test. Use that address." });
    expect(mocks.findInvite).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tokenHash: `hash:${TOKEN}`, acceptedAt: null, revokedAt: null }) }));
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(consumedScopes()).toEqual(["auth.register.ip"]);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("asks a text invitee to type the email twice and accepts a matching pair", async () => {
    mocks.findInvite.mockResolvedValue({ recipientEmail: null, recipientPhone: "+15550100123" });
    expect(await registerFormAction({}, form(valid))).toEqual({ error: "The email addresses don't match." });
    expect(await registerFormAction({}, form({ ...valid, confirmEmail: "jordan@example.com" }))).toEqual({ error: "The email addresses don't match." });
    expect(mocks.transaction).not.toHaveBeenCalled();
    await expect(registerFormAction({}, form({ ...valid, confirmEmail: " JORDAN@example.test " }))).rejects.toThrow("/verify-email/pending?");
    expect(mocks.createAccount).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ email: "jordan@example.test", accessToken: TOKEN }));
  });

  it("sends a fresh registration to the pending page as a registration, not a resend", async () => {
    const outcome = registerFormAction({}, form(valid));
    await expect(outcome).rejects.toThrow("registered=1");
    await expect(outcome).rejects.not.toThrow("sent=1");
    expect(mocks.clear).toHaveBeenCalledWith("auth.register.email", ["jordan@example.test"]);
    expect(mocks.sendVerification).toHaveBeenCalledWith("jordan@example.test", "Jordan Lee", "verify-token");
    // Interactive: a single provider attempt, so a slow provider cannot hold the sign-up for about 50 seconds.
    expect(mocks.attempts).toHaveBeenCalledWith(1, expect.any(Function));
  });

  it("counts the first verification link against the address's daily limit and stays silent over it", async () => {
    mocks.limitReached.mockResolvedValue(true);
    const outcome = registerFormAction({}, form(valid));
    await expect(outcome).rejects.toThrow("registered=1");
    await expect(outcome).rejects.not.toThrow("delivery=failed");
    expect(mocks.limitReached).toHaveBeenCalledWith("jordan@example.test", "verifyEmail");
    expect(mocks.issueToken).not.toHaveBeenCalled();
    expect(mocks.sendVerification).not.toHaveBeenCalled();
  });
});
