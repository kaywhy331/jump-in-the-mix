import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), staffInvite: vi.fn(), review: vi.fn(), contact: vi.fn(), workspace: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "system-pages-test-secret-000000000000001", cookieName: "jitm_session", pilotMode: false, demoMode: false, requireEmailVerification: true } }));
vi.mock("@/lib/prisma", () => ({ prisma: { referralAccessInvite: { findFirst: vi.fn(async () => null) }, reviewRequest: { findUnique: mocks.review }, contact: { findFirst: mocks.contact }, workspace: { findUnique: mocks.workspace }, $transaction: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/lib/account-home", () => ({ accountHome: async (_userId: string, path: string) => path }));
vi.mock("@/lib/auth-actions", () => ({ registerFormAction: vi.fn(), resetPasswordFormAction: vi.fn(), resendVerificationFormAction: vi.fn(), changeUnverifiedEmailFormAction: vi.fn() }));
vi.mock("@/lib/pilot-registration", () => ({ pilotRegistrationOpen: async () => false }));
vi.mock("@/lib/social-auth", () => ({ googleSignInConfigured: () => false, appleSignInConfigured: () => false }));
vi.mock("@/lib/admission", () => ({ getAdmissionPolicy: async () => ({ collectionPaused: false, redemptionPaused: false }) }));
vi.mock("@/lib/referral-access", () => ({ validAccessToken: () => false }));
vi.mock("@/lib/staff-invitations", () => ({ peekStaffInvitation: mocks.staffInvite }));
vi.mock("@/lib/staff-invitation-actions", () => ({ acceptStaffInvitationAction: vi.fn() }));
vi.mock("@/lib/waitlist-actions", () => ({ confirmWaitlistAction: vi.fn() }));
vi.mock("@/lib/review-requests", () => ({ hashReviewToken: (token: string) => `hash:${token}` }));
vi.mock("@/components/ReviewFeedbackForm", () => ({ ReviewFeedbackForm: () => createElement("form", { "data-review-form": "" }) }));
vi.mock("@/components/Logo", () => ({ Logo: () => createElement("span", { "data-logo": "" }) }));
vi.mock("@/components/PublicTrustLinks", () => ({ PublicTrustLinks: () => null }));

import AccountDeletedPage from "../src/app/account/deleted/page";
import OfflinePage from "../src/app/offline/page";
import RegisterPage from "../src/app/register/page";
import ResetPasswordPage from "../src/app/reset-password/page";
import CustomerReviewPage from "../src/app/review/[token]/page";
import AcceptStaffPage from "../src/app/staff/accept/page";
import VerifyEmailPendingPage from "../src/app/verify-email/pending/page";
import ConfirmWaitlistPage from "../src/app/waitlist/confirm/page";

// React separates adjacent text with comments in static markup; the reader sees one sentence.
const html = async (node: ReactNode | Promise<ReactNode>) => renderToStaticMarkup(await node).replaceAll("<!-- -->", "");
const h1 = (page: string) => page.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1];
async function redirected(node: Promise<unknown>): Promise<string | null> {
  try { await node; return null; } catch (error) { if (error instanceof Error && "digest" in error) return error.message; throw error; }
}
const member = (user: { emailVerifiedAt?: Date | null; onboardingDone?: boolean } = {}) => ({ impersonation: null, user: { id: "owner", emailVerifiedAt: "emailVerifiedAt" in user ? user.emailVerifiedAt : new Date(), memberships: [{ workspace: { profile: { onboardingDone: user.onboardingDone ?? true } } }] } });
const search = <T,>(params: T) => ({ searchParams: Promise.resolve(params) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(null);
  mocks.staffInvite.mockResolvedValue(null);
});

describe("auth and system pages share one card with the logo (E-19)", () => {
  it.each([
    ["/offline", () => OfflinePage()],
    ["/account/deleted", () => AccountDeletedPage()],
    ["/staff/accept", () => AcceptStaffPage(search({}))],
    ["/reset-password", () => ResetPasswordPage(search({}))],
    ["/waitlist/confirm", () => ConfirmWaitlistPage(search({}))],
    ["/verify-email/pending", () => VerifyEmailPendingPage(search({}))],
    ["/register", () => RegisterPage(search({}))],
    ["/review/<expired>", () => CustomerReviewPage({ params: Promise.resolve({ token: "missing" }) })]
  ])("%s renders the logo first inside the auth card", async (_path, render) => {
    const page = await html(render());
    expect(page).toMatch(/^<main class="auth-shell"><section class="auth-card"><span data-logo=""><\/span>/);
    expect(page.match(/<h1>/g)).toHaveLength(1);
  });
});

describe("error states name themselves (E-20)", () => {
  it("staff access: a missing token and an unusable invitation each get their own heading and no setup form", async () => {
    const missing = await html(AcceptStaffPage(search({})));
    expect(h1(missing)).toBe("This invitation link is incomplete");
    expect(missing).toContain("Open the full link from your invitation email");
    const unusable = await html(AcceptStaffPage(search({ token: "used" })));
    expect(h1(unusable)).toBe("This invitation isn’t available");
    for (const page of [missing, unusable]) {
      expect(page).not.toContain("<form");
      expect(page).toContain('<a href="/login" class="text-link">Sign in to an existing account</a>');
    }
  });

  it("reset password: a missing token says the link is incomplete and offers one new-link action", async () => {
    const page = await html(ResetPasswordPage(search({})));
    expect(h1(page)).toBe("This reset link is incomplete");
    expect(page).not.toContain("<form");
    expect(page.match(/href="\/forgot-password"/g)).toHaveLength(1);
    expect(page).toContain('<a href="/forgot-password" class="button primary">Request a new reset link</a>');
    expect(h1(await html(ResetPasswordPage(search({ token: "reset-token" }))))).toBe("Choose a new password");
  });

  it("waitlist confirmation: no token, no confirm button; a token keeps the confirmation", async () => {
    const missing = await html(ConfirmWaitlistPage(search({})));
    expect(h1(missing)).toBe("This confirmation link is incomplete");
    expect(missing).not.toContain("Confirm waitlist request");
    expect(missing).toContain('<a href="/waitlist" class="button primary">Join the waitlist</a>');
    const ready = await html(ConfirmWaitlistPage(search({ token: "example" })));
    expect(h1(ready)).toBe("Confirm your email");
    expect(ready).toContain("Confirm waitlist request");
  });

  it("registration: an unusable invitation link uses the same wording as staff access", async () => {
    expect(h1(await html(RegisterPage(search({ invite: "invalid" }))))).toBe("This invitation isn’t available");
  });
});

describe("signed-in members are not left on sign-up, verification or deletion pages (M-13)", () => {
  it.each([
    ["/register", () => RegisterPage(search({ invite: "invalid" }))],
    ["/verify-email/pending", () => VerifyEmailPendingPage(search({ email: "owner@example.test" }))],
    ["/account/deleted", () => AccountDeletedPage()]
  ])("%s sends a verified member to Today, or to setup before onboarding is done", async (_path, render) => {
    mocks.session.mockResolvedValue(member());
    expect(await redirected(render())).toBe("/jumps");
    mocks.session.mockResolvedValue(member({ onboardingDone: false }));
    expect(await redirected(render())).toBe("/onboarding");
  });

  it("keeps the verification and sign-up pages for a session that still needs them", async () => {
    mocks.session.mockResolvedValue(member({ emailVerifiedAt: null }));
    expect(await redirected(VerifyEmailPendingPage(search({ email: "owner@example.test" })))).toBeNull();
    expect(await redirected(RegisterPage(search({})))).toBeNull();
  });

  it("shows the deletion receipt only without a session, and never to a session that still exists", async () => {
    expect(h1(await html(AccountDeletedPage()))).toBe("Your Jump in the Mix account has been deleted.");
    mocks.session.mockResolvedValue(member({ emailVerifiedAt: null }));
    expect(await redirected(AccountDeletedPage())).toBe("/jumps");
    mocks.session.mockRejectedValue(new Error("database unavailable"));
    expect(h1(await html(AccountDeletedPage()))).toBe("Your Jump in the Mix account has been deleted.");
  });
});

describe("a feedback link that can no longer be used gives a next step (M-13)", () => {
  const expired = { id: "request", workspaceId: "workspace", contactId: "contact", status: "OPENED", rating: null, expiresAt: new Date(Date.now() - 1000) };
  const review = (token = "token") => html(CustomerReviewPage({ params: Promise.resolve({ token }) }));

  it("names the business and links to it when the expired link still identifies it", async () => {
    mocks.review.mockResolvedValue(expired);
    mocks.contact.mockResolvedValue({ firstName: "Sam", displayName: "Sam Lee" });
    mocks.workspace.mockResolvedValue({ name: "Workspace", profile: { company: "Reed Painting", reviewUrl: null, website: "https://example.com/contact", phone: null } });
    const page = await review();
    expect(h1(page)).toBe("This feedback link has expired");
    expect(page).toContain("If there is anything Reed Painting should know, contact them directly. You can close this page.");
    expect(page).toContain('<a class="button primary" href="https://example.com/contact">Contact Reed Painting</a>');
    expect(page).not.toContain("data-review-form");
    mocks.workspace.mockResolvedValue({ name: "Workspace", profile: { company: null, reviewUrl: null, website: null, phone: "(202) 555-0142" } });
    expect(await review()).toContain('<a class="button primary" href="tel:2025550142">Contact Workspace</a>');
  });

  it("gives a generic next step when the link identifies nothing, without a dead action", async () => {
    mocks.review.mockResolvedValue(null);
    const unknown = await review("unknown");
    expect(h1(unknown)).toBe("This feedback link has expired");
    expect(unknown).toContain("Please contact the business directly if there is anything they should know. You can close this page.");
    expect(unknown).not.toContain("button");
    mocks.review.mockResolvedValue({ ...expired, expiresAt: new Date(Date.now() + 60_000) });
    mocks.contact.mockResolvedValue(null);
    mocks.workspace.mockResolvedValue(null);
    expect(h1(await review())).toBe("This feedback link isn’t available");
  });
});
