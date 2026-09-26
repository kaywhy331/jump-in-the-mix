import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Server pages here need a signed-in request or a database to render, so their copy and wiring are
// pinned at the source level, in the same way tests/auth-boundary.test.ts pins the auth pages.
describe("sign-up funnel copy and wiring", () => {
  it("tells a new registration that the link was sent and a resend that older links stop working", () => {
    const pending = readFileSync("src/app/verify-email/pending/page.tsx", "utf8");
    expect(pending).toContain("params.registered &&");
    expect(pending).toContain("We sent a verification link to {email");
    expect(pending).toContain("A new link replaces older ones.");
    const actions = readFileSync("src/lib/auth-actions.ts", "utf8");
    expect(actions).toContain('new URLSearchParams({ email: user.email, registered: "1" })');
    expect(actions).toContain('new URLSearchParams({ email, sent: "1" })');
  });

  it("confirms a verified email on the onboarding screen", () => {
    const onboarding = readFileSync("src/app/onboarding/page.tsx", "utf8");
    expect(onboarding).toContain('params.verified === "1" && <Notice type="success">Your email is verified.</Notice>');
  });

  it("shows the invited address read-only and asks text invitees to confirm theirs", () => {
    const register = readFileSync("src/app/register/page.tsx", "utf8");
    expect(register).toContain("recipientEmail: true");
    expect(register).toContain("defaultValue={invitedEmail} readOnly required");
    expect(register).toContain("Invitation sent to {invitedEmail}");
    expect(register).toContain('<span>Confirm email</span><input name="confirmEmail"');
    expect(register).toContain('<input type="hidden" name="invite" value={token} />');
  });

  it("detects the device timezone only while onboarding still holds the UTC default", () => {
    expect(readFileSync("src/components/OnboardingForm.tsx", "utf8")).toContain('confirmDetection={timezone === "UTC"}');
    expect(readFileSync("src/components/MegaMixSetup.tsx", "utf8")).toContain('detectTimezone={Boolean(onboarding) && initialSetup.timezone === "UTC"}');
    expect(readFileSync("src/components/JourneyPreferenceFields.tsx", "utf8")).toContain("confirmDetection={detectTimezone}");
    // Account preferences never switch a saved zone on their own.
    expect(readFileSync("src/components/JourneyPreferencesEditor.tsx", "utf8")).not.toContain("detectTimezone");
  });
});
