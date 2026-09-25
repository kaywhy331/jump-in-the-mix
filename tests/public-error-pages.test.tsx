import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), findSession: vi.fn(), invite: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "jitm_session" ? { name, value: "session-token" } : undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "public-pages-test-secret-0000000000001", cookieName: "jitm_session", impersonationCookieName: "jitm_impersonation", requireEmailVerification: true, requireAdminMfa: false, pilotMode: false, demoMode: false, sessionDays: 14, sessionMaxDays: 90, sessionTouchMinutes: 5 } }));
vi.mock("@/lib/prisma", () => ({ prisma: { session: { findUnique: mocks.findSession, updateMany: vi.fn(), deleteMany: vi.fn() }, adminMfaSession: { deleteMany: vi.fn() }, referralAccessInvite: { findFirst: mocks.invite }, $transaction: vi.fn(async () => []) } }));
vi.mock("@/lib/worker-dispatch-after", () => ({ wakeWorkerAfterResponse: vi.fn() }));
// The page reads the session through this mock; requireWorkspace keeps the real implementation.
vi.mock("@/lib/auth", async original => ({ ...await original<typeof import("../src/lib/auth")>(), getCurrentSession: mocks.session }));
vi.mock("@/lib/account-home", () => ({ accountHome: async (_userId: string, path: string) => path }));
vi.mock("@/lib/auth-actions", () => ({ demoLoginAction: vi.fn(), loginFormAction: vi.fn(), requestMagicLinkFormAction: vi.fn(), registerFormAction: vi.fn(), requestPasswordResetFormAction: vi.fn(), resetPasswordFormAction: vi.fn(), resendVerificationFormAction: vi.fn() }));
vi.mock("@/lib/pilot-registration", () => ({ pilotRegistrationOpen: async () => true }));
vi.mock("@/lib/social-auth", () => ({ googleSignInConfigured: () => false, appleSignInConfigured: () => false }));
vi.mock("@/lib/transactional-email", () => ({ transactionalEmailConfigured: () => true }));
vi.mock("@/lib/admission", () => ({ getAdmissionPolicy: async () => ({ collectionPaused: false, redemptionPaused: false }) }));
vi.mock("@/lib/referral-access", () => ({ validAccessToken: (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token) }));
vi.mock("@/lib/invitation-preference-actions", () => ({ requestStopInvitationsAction: vi.fn(), stopInvitationsAction: vi.fn() }));
vi.mock("@/lib/staff-invitations", () => ({ peekStaffInvitation: async () => null }));
vi.mock("@/lib/staff-invitation-actions", () => ({ acceptStaffInvitationAction: vi.fn() }));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
vi.mock("@/components/PublicTrustLinks", () => ({ PublicTrustLinks: () => null }));
vi.mock("@/components/WaitlistForm", () => ({ WaitlistForm: () => null }));

import { requireWorkspace } from "../src/lib/auth";
import { UNVERIFIED_ERROR_MESSAGE, withSignedError } from "../src/lib/form-errors";
import LoginPage from "../src/app/login/page";
import RegisterPage from "../src/app/register/page";
import ForgotPasswordPage from "../src/app/forgot-password/page";
import ResetPasswordPage from "../src/app/reset-password/page";
import VerifyEmailPendingPage from "../src/app/verify-email/pending/page";
import WaitlistPage from "../src/app/waitlist/page";
import LeaveWaitlistPage from "../src/app/waitlist/leave/page";
import AcceptStaffPage from "../src/app/staff/accept/page";

const LURE = "Your account is suspended. Call +1 800 555 0100 to verify your card.";
const INVITE = "a".repeat(43);
type Search = Record<string, string | undefined>;
const pages: Array<[string, (params: Search) => Promise<ReactNode>, Search, string]> = [
  ["/login", params => LoginPage({ searchParams: Promise.resolve(params) }), {}, UNVERIFIED_ERROR_MESSAGE],
  ["/register", params => RegisterPage({ searchParams: Promise.resolve(params) }), { invite: INVITE }, UNVERIFIED_ERROR_MESSAGE],
  ["/forgot-password", params => ForgotPasswordPage({ searchParams: Promise.resolve(params) }), {}, UNVERIFIED_ERROR_MESSAGE],
  ["/reset-password", params => ResetPasswordPage({ searchParams: Promise.resolve(params) }), { token: "reset-token" }, UNVERIFIED_ERROR_MESSAGE],
  ["/verify-email/pending", params => VerifyEmailPendingPage({ searchParams: Promise.resolve(params) }), { email: "owner@example.test" }, "That verification link could not be used. Send another link below."],
  ["/waitlist", params => WaitlistPage({ searchParams: Promise.resolve(params) }), {}, UNVERIFIED_ERROR_MESSAGE],
  ["/waitlist/leave", params => LeaveWaitlistPage({ searchParams: Promise.resolve(params) }), {}, UNVERIFIED_ERROR_MESSAGE],
  ["/staff/accept", params => AcceptStaffPage({ searchParams: Promise.resolve(params) }), {}, UNVERIFIED_ERROR_MESSAGE]
];
const html = async (node: Promise<ReactNode>) => renderToStaticMarkup(await node);
const signed = (path: string, message: string) => Object.fromEntries(new URL(withSignedError(path, message), "https://jumpinthemix.com").searchParams);
async function redirected(node: Promise<unknown>): Promise<string | null> {
  try { await node; return null; } catch (error) { if (error instanceof Error && "digest" in error) return error.message; throw error; }
}
const DAY = 24 * 60 * 60 * 1000;
function sessionRow(user: { emailVerifiedAt?: Date | null; memberships?: unknown[] } = {}) {
  return { id: "session", userId: "owner", tokenHash: "hash", ipAddress: null, userAgent: null, createdAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + DAY),
    user: { id: "owner", email: "owner@example.test", name: "Owner", suspendedAt: null, emailVerifiedAt: new Date(), memberships: [{ workspaceId: "workspace", workspace: { id: "workspace", profile: { onboardingDone: true } } }], ...user } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(null);
  mocks.findSession.mockResolvedValue(null);
  mocks.invite.mockResolvedValue({ id: "invite", recipientEmail: "invited@example.test", recipientPhone: null, marketingScenario: null, marketingScenarioVersion: null });
});

describe("error banners on the public pages", () => {
  it.each(pages)("%s shows a fixed sentence instead of a crafted message", async (_path, render, params, fallback) => {
    const page = await html(render({ ...params, error: LURE }));
    expect(page).toContain(fallback);
    expect(page).not.toContain("Call +1 800");
  });

  it.each(pages)("%s shows a message our own redirect signed", async (path, render, params) => {
    const page = await html(render({ ...params, ...signed(path, "That sign-in link was already used.") }));
    expect(page).toContain("That sign-in link was already used.");
  });

  it.each(pages)("%s shows no banner without an error", async (_path, render, params, fallback) => {
    expect(await html(render(params))).not.toContain(fallback);
  });
});

describe("the sign-in page for a browser that is already signed in", () => {
  const view = (user: { emailVerifiedAt?: Date | null; memberships?: unknown[] } = {}, impersonation: object | null = null) => ({ ...sessionRow(user), authUser: { id: "owner" }, impersonation });

  it("goes to the account home, or to a safe requested page, instead of showing the form", async () => {
    mocks.session.mockResolvedValue(view());
    expect(await redirected(LoginPage({ searchParams: Promise.resolve({}) }))).toBe("/jumps");
    expect(await redirected(LoginPage({ searchParams: Promise.resolve({ next: "/contacts/person-1" }) }))).toBe("/contacts/person-1");
    expect(await redirected(LoginPage({ searchParams: Promise.resolve({ next: "https://outside.example" }) }))).toBe("/jumps");
    mocks.session.mockResolvedValue(view({ memberships: [{ workspaceId: "workspace", workspace: { id: "workspace", profile: { onboardingDone: false } } }] }));
    expect(await redirected(LoginPage({ searchParams: Promise.resolve({ next: "/contacts/person-1" }) }))).toBe("/onboarding");
  });

  it.each([
    ["an unverified email", view({ emailVerifiedAt: null })],
    ["no workspace", view({ memberships: [] })],
    ["a support view", view({}, { id: "grant" })]
  ])("shows the form for %s", async (_case, session) => {
    mocks.session.mockResolvedValue(session);
    expect(await redirected(LoginPage({ searchParams: Promise.resolve({}) }))).toBeNull();
    expect(await html(LoginPage({ searchParams: Promise.resolve({}) }))).toContain("Welcome back");
  });

  it("always shows the form to confirm identity for account deletion, and when the session cannot be read", async () => {
    mocks.session.mockResolvedValue(view());
    expect(await redirected(LoginPage({ searchParams: Promise.resolve({ reauth: "deletion", next: "/account?section=privacy" }) }))).toBeNull();
    mocks.session.mockRejectedValue(new Error("database unavailable"));
    expect(await html(LoginPage({ searchParams: Promise.resolve({}) }))).toContain("Welcome back");
  });

  it("never loops: it redirects only when the destination accepts the same session", async () => {
    const actual = await vi.importActual<typeof import("../src/lib/auth")>("../src/lib/auth");
    mocks.session.mockImplementation(actual.getCurrentSession);
    const cases: Array<[string, ReturnType<typeof sessionRow> | null, string | null, string]> = [
      ["verified with a workspace", sessionRow(), "/jumps", "accepted"],
      ["unverified", sessionRow({ emailVerifiedAt: null }), null, "/verify-email/pending?email=owner%40example.test"],
      ["without a workspace", sessionRow({ memberships: [] }), null, "/register"],
      ["signed out", null, null, "/login"]
    ];
    for (const [label, row, loginRedirect, destination] of cases) {
      mocks.findSession.mockResolvedValue(row);
      expect(await redirected(LoginPage({ searchParams: Promise.resolve({}) })), label).toBe(loginRedirect);
      // The account home (or the page a signed-out visit is sent to) answers the same session like this:
      expect((await redirected(requireWorkspace())) ?? "accepted", label).toBe(destination);
      // A loop needs /login to redirect to a page that sends the same session back to /login.
      expect(loginRedirect !== null && destination === "/login", label).toBe(false);
    }
  });
});
