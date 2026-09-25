import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Client behaviour here needs a browser (media queries, fetch after hydration, form state), so the wiring
// is pinned at the source level like tests/sign-up-funnel.test.ts; the browser specs cover the flows.
const read = (path: string) => readFileSync(path, "utf8");
const PUBLIC_PAGES = ["src/app/login/page.tsx", "src/app/register/page.tsx", "src/app/forgot-password/page.tsx", "src/app/reset-password/page.tsx", "src/app/verify-email/pending/page.tsx", "src/app/waitlist/page.tsx", "src/app/waitlist/leave/page.tsx", "src/app/staff/accept/page.tsx"];

describe("public funnel wiring", () => {
  it("renders URL error text on the public pages only through the signature check", () => {
    for (const path of PUBLIC_PAGES) {
      const source = read(path);
      expect(source, path).toContain("verifiedErrorMessage(params");
      expect(source, path).not.toMatch(/params\.error/);
    }
  });

  it("keeps the magic-link token out of the confirmation page's address and index", () => {
    const page = read("src/app/auth/magic/page.tsx");
    expect(page).toContain('robots: { index: false, follow: false }');
    expect(page).toContain("action={consumeMagicLinkAction}");
    expect(page).not.toMatch(/params\.token|searchParams\.get\("token"\)/);
    expect(read("src/app/api/auth/magic/route.ts")).not.toMatch(/createSession|updateMany|\$transaction/);
  });

  it("opens file import and the expired-session sign-in on the same screen in an installed app", () => {
    const onboarding = read("src/components/OnboardingForm.tsx");
    const boundary = read("src/components/BrowserAccountBoundary.tsx");
    for (const source of [onboarding, boundary]) expect(source).toContain('window.matchMedia("(display-mode: standalone)").matches');
    expect(onboarding).toContain('href="/contacts/import?onboarding=1" target={standalone ? undefined : "_blank"}');
    expect(boundary).toContain("href={`/login?next=${encodeURIComponent(");
    expect(boundary).toContain('target="_blank" rel="noopener noreferrer">Sign in in another tab</a>');
  });

  it("states the required fields at the top of the one-person setup form", () => {
    expect(read("src/components/OnboardingForm.tsx")).toMatch(/protect=\{setupMode === "person"\}>\s*<RequiredFieldsNote \/>/);
  });

  it("offers Open Today in the public header once the browser context confirms a session", () => {
    expect(read("src/components/PublicHeader.tsx").match(/<OpenAppLink /g)).toHaveLength(2);
    const link = read("src/components/OpenAppLink.tsx");
    expect(link).toContain('fetch("/api/auth/browser-context"');
    expect(link).toContain('<Link className={className} href="/jumps">Open Today</Link>');
  });

  it("gives each waitlist state its heading and states the daily confirmation limit", () => {
    expect(read("src/app/waitlist/page.tsx")).toContain('params.confirmed ? "You’re on the waitlist" : params.submitted ? "Check your inbox" : "Join the waitlist"');
    const form = read("src/components/WaitlistForm.tsx");
    expect(form).toContain("We send up to {WAITLIST_EMAIL_REQUESTS_PER_DAY} confirmation emails to an address each day");
    expect(form).toContain("No new email was sent.");
  });

  it("sends interactive sign-in, verification and reset email with one provider attempt", () => {
    const actions = read("src/lib/auth-actions.ts");
    expect(actions.match(/withEmailAttempts\(1, \(\) => send(Verification|MagicLogin|PasswordReset)Email\(/g)).toHaveLength(3);
    expect(actions).not.toContain("withEmailAttempts(1, () => sendPasswordChangedEmail");
  });
});
