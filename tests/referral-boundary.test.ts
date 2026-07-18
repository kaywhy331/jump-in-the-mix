import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeReferralCode,
  referralShareMessage,
  referralShareUrl,
  REFERRAL_MAX_REFERRER_DAYS,
  REFERRAL_REWARD_DAYS
} from "../src/lib/referral";

const read = (path: string) => readFileSync(path, "utf8");

describe("referral boundaries and public flow", () => {
  it("normalizes public invitation codes and creates branded share copy", () => {
    expect(normalizeReferralCode(" ab-cd_1234!? ")).toBe("ABCD1234");
    const url = referralShareUrl("https://jump.example/", "abcd1234ef");
    expect(url).toBe("https://jump.example/r/ABCD1234EF");
    expect(referralShareMessage(url)).toContain("30 days of Plus");
    expect(referralShareMessage(url)).toContain(url);
    expect(REFERRAL_REWARD_DAYS).toBe(30);
    expect(REFERRAL_MAX_REFERRER_DAYS).toBe(360);
  });

  it("captures and can explicitly clear referral identity without exposing a workspace id", () => {
    const route = read("src/app/r/[code]/route.ts");
    const clearRoute = read("src/app/r/clear/route.ts");
    const register = read("src/app/register/page.tsx");
    expect(route).toContain("REFERRAL_COOKIE");
    expect(route).toContain("httpOnly: true");
    expect(route).toContain('sameSite: "lax"');
    expect(clearRoute).toContain("response.cookies.delete(REFERRAL_COOKIE)");
    expect(register).toContain('name="referralCode"');
    expect(register).toContain("findReferralInvite");
    expect(register).toContain('href="/r/clear"');
    expect(register).not.toContain('name="referrerWorkspaceId"');
  });

  it("derives referrer ownership server-side and qualifies only after account verification", () => {
    const action = read("src/lib/register-action.ts");
    const verification = read("src/app/api/auth/verify-email/route.ts");
    expect(action).toContain("findReferralInvite(referralCode)");
    expect(action).toContain("createReferralAttributionInTransaction");
    expect(action).toContain("qualifyImmediately: !env.requireEmailVerification");
    expect(action).not.toMatch(/formData\.get\(["']referrerWorkspaceId/);
    expect(verification).toContain("qualifyAttributedReferralForUser");
    expect(verification).toContain("if (user.referralQualified)");
  });

  it("keeps Stripe paid access authoritative while preserving and later activating referral time", () => {
    const webhook = read("src/app/api/webhooks/stripe/route.ts");
    const verification = read("src/app/api/billing/verify/route.ts");
    const service = read("src/lib/referral-service.ts");
    expect(webhook).toContain("reconcileWorkspaceReferralEntitlement");
    expect(verification).toContain("reconcileWorkspaceReferralEntitlement");
    expect(service).toContain("workspaceHasPaidStripeAccess");
    expect(service).toContain("bankActiveReferralWindow");
    expect(service).toContain('status: "BANKED"');
    expect(service).toContain("applyPlanDowngradeSafeguards");
  });

  it("requires platform-admin authorization for referral analytics and blocks support-view sharing", () => {
    const admin = read("src/app/(app)/admin/referrals/page.tsx");
    const shell = read("src/components/AppShell.tsx");
    const account = read("src/components/ReferralAccountCard.tsx");
    expect(admin).toContain("requirePlatformAdmin(");
    expect(shell).toContain("impersonation ? endImpersonationForm");
    expect(account).toContain("!impersonation && <ReferralShareButton");
  });
});
