import { describe, expect, it } from "vitest";
import { hashReviewToken, referralShareMessage, reviewRequestExpiresAt, reviewResponseStatus } from "../src/lib/review-requests";

describe("review and referral check-ins", () => {
  it("stores a digest rather than the public capability token", () => {
    const token = "private-review-capability";
    expect(hashReviewToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashReviewToken(token)).not.toContain(token);
  });

  it("keeps low ratings private and offers next steps to happy customers", () => {
    expect(reviewResponseStatus(3)).toBe("NEEDS_ATTENTION");
    expect(reviewResponseStatus(4)).toBe("HAPPY");
    expect(() => reviewResponseStatus(0)).toThrow(/1 to 5/);
  });

  it("expires links after 30 days and builds a referral message", () => {
    expect(reviewRequestExpiresAt(new Date("2026-09-04T00:00:00Z")).toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(referralShareMessage("Lee Plumbing", "https://lee.example")).toContain("https://lee.example");
  });
});
