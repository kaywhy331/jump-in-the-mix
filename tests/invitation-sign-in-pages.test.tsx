import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invite: vi.fn(), google: vi.fn(), apple: vi.fn(), policy: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "invitation-pages-test-secret-000000000001", cookieName: "jitm_session", pilotMode: false, demoMode: false, requireEmailVerification: true } }));
vi.mock("@/lib/prisma", () => ({ prisma: { referralAccessInvite: { findFirst: mocks.invite } } }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: async () => null }));
vi.mock("@/lib/account-home", () => ({ accountHome: async (_userId: string, path: string) => path }));
vi.mock("@/lib/auth-actions", () => ({ demoLoginAction: vi.fn(), loginFormAction: vi.fn(), requestMagicLinkFormAction: vi.fn(), registerFormAction: vi.fn(), resendVerificationFormAction: vi.fn(), changeUnverifiedEmailFormAction: vi.fn() }));
vi.mock("@/lib/pilot-registration", () => ({ pilotRegistrationOpen: async () => true }));
// Dummy provider configuration: production has none today, so the buttons appear only when both are set.
vi.mock("@/lib/social-auth", () => ({ googleSignInConfigured: mocks.google, appleSignInConfigured: mocks.apple }));
vi.mock("@/lib/transactional-email", () => ({ transactionalEmailConfigured: () => true }));
vi.mock("@/lib/admission", () => ({ getAdmissionPolicy: mocks.policy }));
vi.mock("@/lib/referral-access", () => ({ validAccessToken: (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token) }));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
vi.mock("@/components/PublicTrustLinks", () => ({ PublicTrustLinks: () => null }));
import RegisterPage from "../src/app/register/page";
import LoginPage from "../src/app/login/page";
import VerifyEmailPendingPage from "../src/app/verify-email/pending/page";

const INVITE = "v".repeat(43);
// React separates adjacent text with comments in static markup; the reader sees one sentence.
const html = async (node: Promise<ReactNode>) => renderToStaticMarkup(await node).replaceAll("<!-- -->", "");
const register = (params: Record<string, string> = { invite: INVITE }) => html(RegisterPage({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.google.mockReturnValue(true); mocks.apple.mockReturnValue(true);
  mocks.policy.mockResolvedValue({ redemptionPaused: false, collectionPaused: false });
  mocks.invite.mockResolvedValue({ id: "invite", recipientEmail: "invited@example.test", recipientPhone: null, marketingScenario: null, marketingScenarioVersion: null });
});

describe("an invitation offers the configured providers", () => {
  it("carries the invitation on each provider button and names the invited address", async () => {
    const page = await register();
    expect(page).toContain(`href="/api/auth/oauth/google/start?invite=${INVITE}"`);
    expect(page).toContain(`href="/api/auth/oauth/apple/start?invite=${INVITE}"`);
    expect(page).toContain("Choose the Google or Apple account that uses invited@example.test.");
    expect(page).toContain("or use email");
    expect(page).toContain('name="invite"');
  });

  it("shows only the configured providers, and none when neither is configured, as in production today", async () => {
    mocks.apple.mockReturnValue(false);
    const googleOnly = await register();
    expect(googleOnly).toContain("Continue with Google");
    expect(googleOnly).not.toContain("Continue with Apple");
    mocks.google.mockReturnValue(false);
    const none = await register();
    expect(none).not.toContain("/api/auth/oauth/");
    expect(none).toContain("Create free account");
  });

  it("lets a text invitee use any provider address, and offers nothing for a used, missing or paused invitation", async () => {
    mocks.invite.mockResolvedValue({ id: "invite", recipientEmail: null, recipientPhone: "+15550100123", marketingScenario: null, marketingScenarioVersion: null });
    const texted = await register();
    expect(texted).toContain(`?invite=${INVITE}`);
    expect(texted).not.toContain("Choose the Google or Apple account");
    mocks.invite.mockResolvedValue(null);
    expect(await register()).not.toContain("/api/auth/oauth/");
    expect(await register({})).not.toContain("/api/auth/oauth/");
    mocks.invite.mockResolvedValue({ id: "invite", recipientEmail: "invited@example.test", recipientPhone: null, marketingScenario: null, marketingScenarioVersion: null });
    mocks.policy.mockResolvedValue({ redemptionPaused: true, collectionPaused: false });
    expect(await register()).not.toContain("/api/auth/oauth/");
  });

  it("says on sign-in that Google and Apple are for existing accounts, and states the daily sign-in link limit", async () => {
    const page = await html(LoginPage({ searchParams: Promise.resolve({ magicSent: "1" }) }));
    expect(page).toContain("Google and Apple sign-in are for existing accounts. To create an account, open the invitation link someone shared with you.");
    expect(page).toContain('href="/api/auth/oauth/google/start"');
    expect(page).toContain("An address gets up to 3 sign-in links a day, unless this browser has signed in to the account before.");
  });

  it("offers the email correction on the verification page and states the daily verification limit", async () => {
    const page = await html(VerifyEmailPendingPage({ searchParams: Promise.resolve({ email: "typo@example.test", sent: "1" }) }));
    expect(page).toContain("An address gets up to 4 verification links a day.");
    expect(page).toContain("<summary>Typed the wrong email?</summary>");
    for (const name of ["email", "password", "newEmail", "confirmNewEmail"]) expect(page).toContain(`name="${name}"`);
    expect(page).toMatch(/<input id="currentEmail"[^>]*name="email" value="typo@example.test"/);
  });
});

describe("public access wording", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const pages = ["src/components/PublicLanding.tsx", "src/app/faq/page.tsx", "src/app/waitlist/page.tsx", "src/app/register/page.tsx", "src/lib/waitlist-actions.ts"];

  it("promises no cadence and no guaranteed spot", () => {
    for (const path of pages) {
      const source = read(path);
      for (const promise of ["as soon as your spot", "when your spot is ready", "after joining the waitlist", "when access is available"]) expect(source, `${path}: ${promise}`).not.toContain(promise);
    }
  });

  it("names both ways in and says a date is not promised", () => {
    expect(read("src/components/PublicLanding.tsx")).toContain("access is by invitation from a member, or from the waitlist as space opens.");
    expect(read("src/components/PublicLanding.tsx")).toContain("We invite people in small groups, so we can’t promise a date. A member can also invite you directly.");
    expect(read("src/app/faq/page.tsx")).toContain("Accounts are by invitation. A member can invite you: each member has three personal invitations to share by text or email. Or join the waitlist: we email invitations from it in small groups as space opens, so we can’t promise a date.");
    expect(read("src/app/waitlist/page.tsx")).toContain("We email invitations in small groups as space opens. We can’t promise a date.");
    expect(read("src/app/register/page.tsx")).toContain("Accounts are by invitation. Each member has three invitations to share with contacts by text or email");
    expect(read("src/lib/waitlist-actions.ts")).toContain("we’ll email your invitation as space opens. We can’t promise a date.");
  });
});
