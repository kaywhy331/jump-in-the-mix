import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), consume: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("@/lib/env", () => ({ env: { pilotMode: false, demoMode: false, cookieName: "jitm_session", secureSessionCookie: true, authRateLimitSecret: "account-error-signing-secret-000000001" } }));
vi.mock("@/lib/auth", () => ({ createSession: vi.fn(), destroyAllSessionsForUser: vi.fn(), destroyOtherSessions: vi.fn(), destroySession: vi.fn(), requireSession: vi.fn(), requireWorkspace: mocks.workspace, rotateSession: vi.fn() }));
vi.mock("@/lib/account-home", () => ({ accountHome: async (_id: string, path: string) => path }));
vi.mock("@/lib/account-provisioning", () => ({ createBusinessAccount: vi.fn(), nameFromEmail: vi.fn() }));
vi.mock("@/lib/auth-email", () => ({ sendMagicLoginEmail: vi.fn(), sendPasswordChangedEmail: vi.fn(), sendPasswordResetEmail: vi.fn(), sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/rate-limit")>(), consumeRateLimit: mocks.consume, clearRateLimit: vi.fn(), releaseRateLimitAttempt: vi.fn() }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "203.0.113.5", userAgent: "vitest" }) }));
vi.mock("@/lib/referral-access", () => ({ AccessInviteError: class AccessInviteError extends Error {}, validAccessToken: () => false }));
vi.mock("@/lib/transactional-email", () => ({ transactionalEmailConfigured: () => true, withEmailAttempts: (_attempts: number, send: () => Promise<unknown>) => send() }));
vi.mock("@/lib/access-lock", () => ({ lockAccess: vi.fn() }));
import { changePasswordAction, demoLoginAction, revokeSessionAction } from "../src/lib/auth-actions";
import { verifiedErrorMessage, viewerErrorMessage } from "../src/lib/form-errors";

const owner = { id: "user-owner", email: "owner@example.test", name: "Owner", passwordHash: null };
const session = { id: "session-current", authUser: { id: "user-owner" } };
const params = (location: string) => Object.fromEntries(new URL(location, "https://jumpinthemix.com").searchParams);
async function redirectOf(action: Promise<unknown>): Promise<string> {
  try { await action; } catch (error) { if (error instanceof Error && "digest" in error) return error.message; throw error; }
  throw new Error("Expected a redirect");
}
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockResolvedValue({ session, user: owner, actorUser: session.authUser, workspace: { id: "workspace-1" }, impersonation: null });
  mocks.consume.mockResolvedValue({ allowed: true, remaining: 5, retryAfterSeconds: 0 });
});

describe("errors on /account are signed for the person who caused them", () => {
  it("shows the refusal to its viewer and the fixed sentence to anyone else", async () => {
    const location = await redirectOf(revokeSessionAction(form({ sessionId: "session-current" })));
    expect(location.startsWith("/account?error=")).toBe(true);
    expect(viewerErrorMessage(params(location), session)).toBe("Use Sign out to end the current session.");
    expect(viewerErrorMessage(params(location), { authUser: { id: "user-other" } })).toBe("Something went wrong. Please try again.");
  });

  it("signs password-change validation and rate-limit messages", async () => {
    const mismatch = await redirectOf(changePasswordAction(form({ password: "A long enough password 1!", confirmPassword: "Something else entirely 1!" })));
    expect(viewerErrorMessage(params(mismatch), session)).toBe("The new passwords do not match.");
    mocks.consume.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1800 });
    const limited = await redirectOf(changePasswordAction(form({ password: "x", confirmPassword: "x" })));
    expect(viewerErrorMessage(params(limited), session)).toMatch(/^Too many attempts\. Try again in about /);
  });

  it("signs the demo sign-in refusal for the public sign-in page", async () => {
    const location = await redirectOf(demoLoginAction());
    expect(verifiedErrorMessage(params(location))).toBe("The demo workspace is disabled in this environment.");
  });
});
