import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), session: vi.fn(), token: vi.fn(), user: vi.fn(), claim: vi.fn(), verify: vi.fn(), cookies: new Map<string, string>(), cookieWrites: [] as Array<{ name: string; value: string; options: Record<string, unknown> }> }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => mocks.cookies.has(name) ? { name, value: mocks.cookies.get(name) } : undefined,
  set: (name: string, value: string, options: Record<string, unknown>) => { mocks.cookieWrites.push({ name, value, options }); }
}) }));
vi.mock("@/lib/env", () => ({ env: { pilotMode: false, cookieName: "jitm_session", secureSessionCookie: true, authRateLimitSecret: "magic-link-test-secret-000000000000001" } }));
vi.mock("@/lib/auth", () => ({ createSession: mocks.session, destroyAllSessionsForUser: vi.fn(), destroyOtherSessions: vi.fn(), destroySession: vi.fn(), requireSession: vi.fn(), requireWorkspace: vi.fn(), rotateSession: vi.fn() }));
vi.mock("@/lib/account-home", () => ({ accountHome: async (_id: string, path: string) => path }));
vi.mock("@/lib/account-provisioning", () => ({ createBusinessAccount: vi.fn(), nameFromEmail: vi.fn() }));
vi.mock("@/lib/auth-tokens", () => ({ AUTH_TOKEN_PURPOSES: { verifyEmail: "verify_email", resetPassword: "reset_password", magicLogin: "magic_login" }, findUsableAuthToken: mocks.token, hashAuthToken: () => "hashed", issueAuthToken: vi.fn() }));
vi.mock("@/lib/auth-email", () => ({ sendMagicLoginEmail: vi.fn(), sendPasswordChangedEmail: vi.fn(), sendPasswordResetEmail: vi.fn(), sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/rate-limit", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/rate-limit")>(), consumeRateLimit: vi.fn(), clearRateLimit: vi.fn(), releaseRateLimitAttempt: vi.fn() }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "203.0.113.5", userAgent: "vitest" }) }));
vi.mock("@/lib/referral-access", () => ({ AccessInviteError: class AccessInviteError extends Error {}, validAccessToken: () => false }));
vi.mock("@/lib/transactional-email", () => ({ transactionalEmailConfigured: () => true, withEmailAttempts: (_attempts: number, send: () => Promise<unknown>) => send() }));
vi.mock("@/lib/access-lock", () => ({ lockAccess: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
import { GET } from "../src/app/api/auth/magic/route";
import { consumeMagicLinkAction } from "../src/lib/auth-actions";
import { verifiedErrorMessage } from "../src/lib/form-errors";
import { isKnownDevice } from "../src/lib/rate-limit";
import MagicLinkPage from "../src/app/auth/magic/page";

const link = (query: string) => new Request(`https://jumpinthemix.com/api/auth/magic?${query}`);
const form = (next?: string) => { const data = new FormData(); if (next !== undefined) data.set("next", next); return data; };
const signedMessage = (location: string) => verifiedErrorMessage(Object.fromEntries(new URL(location, "https://jumpinthemix.com").searchParams));
const handOff = (response: Response) => response.headers.getSetCookie().find(value => value.startsWith("jitm_session_magic="));
async function redirectOf(action: Promise<unknown>): Promise<string> {
  try { await action; } catch (error) { if (error instanceof Error && "digest" in error) return error.message; throw error; }
  throw new Error("Expected a redirect");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookies.clear(); mocks.cookies.set("jitm_session_magic", "synthetic"); mocks.cookieWrites.length = 0;
  mocks.token.mockImplementation(async (token: string) => token === "synthetic" ? { id: "token", email: "member@example.test", expiresAt: new Date(Date.now() + 10 * 60_000) } : null);
  mocks.user.mockResolvedValue({ id: "member", email: "member@example.test", emailVerifiedAt: new Date(), memberships: [{ workspace: { profile: { onboardingDone: true } } }] });
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.verify.mockResolvedValue({});
  mocks.transaction.mockImplementation(callback => callback({ verificationToken: { updateMany: mocks.claim }, user: { findUnique: mocks.user, update: mocks.verify } }));
});

describe("opening an emailed sign-in link", () => {
  it("neither spends the token nor signs in, and hands the token to the confirmation page in a scoped cookie", async () => {
    const response = await GET(link(`token=synthetic&next=${encodeURIComponent("/contacts/person-1")}`));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/auth/magic?next=%2Fcontacts%2Fperson-1");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    const cookie = handOff(response)!;
    expect(cookie).toMatch(/^jitm_session_magic=synthetic;/);
    expect(cookie).toMatch(/Path=\/auth\/magic/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Secure/);
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
    expect(maxAge).toBeGreaterThan(590); expect(maxAge).toBeLessThanOrEqual(600);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("never lets the hand-off outlive fifteen minutes and drops unsafe return targets", async () => {
    mocks.token.mockResolvedValue({ id: "token", email: "member@example.test", expiresAt: new Date(Date.now() + 60 * 60_000) });
    const response = await GET(link(`token=synthetic&next=${encodeURIComponent("https://outside.example")}`));
    expect(response.headers.get("location")).toBe("/auth/magic");
    expect(Number(/Max-Age=(\d+)/.exec(handOff(response)!)?.[1])).toBe(900);
  });

  it("sends an unusable link to sign in with our signed message and no hand-off", async () => {
    for (const query of ["token=spent", "token=", ""]) {
      const response = await GET(link(query));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toMatch(/^\/login\?error=/);
      expect(signedMessage(response.headers.get("location")!)).toBe("That sign-in link is invalid or expired.");
      expect(handOff(response)).toBeUndefined();
    }
    expect(mocks.token).toHaveBeenCalledTimes(1);
  });
});

describe("continuing a sign-in from the confirmation page", () => {
  it.each(["/contacts/person-1", "/account/tickets/case-1"])("returns a signed-in customer to %s", async destination => {
    expect(await redirectOf(consumeMagicLinkAction(form(destination)))).toBe(destination);
    expect(mocks.session).toHaveBeenCalledWith("member");
    // The browser that signed in is remembered, so sign-in abuse limits never lock it out.
    const marker = mocks.cookieWrites.find(write => write.name === "jitm_session_device");
    expect(marker?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(isKnownDevice(marker?.value, "member")).toBe(true);
    expect(mocks.claim).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "token", purpose: "magic_login", usedAt: null }) }));
    expect(mocks.verify).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "member" } }));
  });

  it.each(["https://outside.example", "//outside.example", "/admin", "/contacts/../admin"])("ignores unsafe return target %s", async destination => {
    expect(await redirectOf(consumeMagicLinkAction(form(destination)))).toBe("/jumps");
  });

  it("keeps unfinished setup ahead of the requested destination", async () => {
    mocks.user.mockResolvedValue({ id: "member", email: "member@example.test", emailVerifiedAt: new Date(), memberships: [{ workspace: { profile: { onboardingDone: false } } }] });
    expect(await redirectOf(consumeMagicLinkAction(form("/contacts/person-1")))).toBe("/onboarding");
  });

  it("clears the hand-off cookie on the same path whatever happens", async () => {
    await redirectOf(consumeMagicLinkAction(form()));
    mocks.claim.mockResolvedValue({ count: 0 });
    await redirectOf(consumeMagicLinkAction(form()));
    const handOffWrites = mocks.cookieWrites.filter(write => write.name === "jitm_session_magic");
    expect(handOffWrites).toHaveLength(2);
    for (const write of handOffWrites) expect(write).toMatchObject({ name: "jitm_session_magic", value: "", options: { path: "/auth/magic", maxAge: 0, httpOnly: true } });
    // Only the successful sign-in marks the browser as known.
    expect(mocks.cookieWrites.filter(write => write.name === "jitm_session_device")).toHaveLength(1);
  });

  it("reports a missing, expired or already used link with our signed message and no session", async () => {
    mocks.cookies.clear();
    const missing = await redirectOf(consumeMagicLinkAction(form()));
    expect(signedMessage(missing)).toBe("That sign-in link is invalid or expired.");
    mocks.cookies.set("jitm_session_magic", "synthetic");
    mocks.claim.mockResolvedValue({ count: 0 });
    const used = await redirectOf(consumeMagicLinkAction(form()));
    expect(new URL(used, "https://jumpinthemix.com").pathname).toBe("/login");
    expect(signedMessage(used)).toBe("That sign-in link was already used.");
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("tells a suspended account why it cannot sign in and creates no session", async () => {
    mocks.user.mockResolvedValue({ id: "member", suspendedAt: new Date(), memberships: [] });
    const refused = await redirectOf(consumeMagicLinkAction(form()));
    expect(signedMessage(refused)).toBe("Account access is unavailable. Contact support for help.");
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("never signs internal error text for the sign-in page", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.transaction.mockRejectedValue(new Error("Invalid `prisma.user.findUnique()` invocation: internal detail"));
    const failed = await redirectOf(consumeMagicLinkAction(form()));
    expect(signedMessage(failed)).toBe("The sign-in link could not be used. Open it again from your email or request a new one.");
    expect(failed).not.toContain("internal");
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});

describe("the confirmation page", () => {
  const render = async (params: Record<string, string>) => renderToStaticMarkup(await MagicLinkPage({ searchParams: Promise.resolve(params) }));

  it("offers one Continue signing in button and carries only a safe return path", async () => {
    const page = await render({ next: "/contacts/person-1" });
    expect(page).toContain("<h1>Continue signing in</h1>");
    expect(page.match(/<button/g)).toHaveLength(1);
    expect(page).toContain('name="next" value="/contacts/person-1"');
    expect(page).not.toContain("synthetic");
    expect(await render({ next: "https://outside.example" })).not.toContain('name="next"');
  });

  it("explains what to do when the hand-off is missing or expired", async () => {
    mocks.cookies.clear();
    const page = await render({});
    expect(page).toContain("Open your sign-in link again");
    expect(page).toContain('href="/login"');
    expect(page).not.toContain("<form");
  });
});
