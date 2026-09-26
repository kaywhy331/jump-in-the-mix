import { describe, expect, it } from "vitest";
import { inferQuickCaptureReview } from "../src/lib/quick-add-capture";

const now = new Date("2026-09-20T12:00:00Z");
describe("combined Quick Add review", () => {
  it.each(["Meet Morgan", "Meet with Morgan", "Coffee with Morgan"])("keeps the named person and separates dates in %s", start => {
    const review = inferQuickCaptureReview(`${start} Friday at 2pm, then text them Monday about the estimate`, now, "UTC");
    expect(review.name).toBe("Morgan");
    expect(review.event).toMatchObject({ enabled: true, date: "2026-09-25", time: "14:00" });
    expect(review.followUp).toMatchObject({ enabled: true, date: "2026-09-21", time: "", channel: "SMS", wording: "" });
  });
  it.each(["Text them Monday", "Call her tomorrow", "Email him next week"])("does not suggest a new person from a pronoun in %s", capture => {
    const review = inferQuickCaptureReview(capture, now, "UTC");
    expect(review.name).toBe("");
    expect(review.event.enabled).toBe(false);
    expect(review.followUp.enabled).toBe(true);
  });
  it("keeps a stated name in a follow-up without proposing an event", () => {
    const review = inferQuickCaptureReview("Text Morgan Monday about the estimate", now, "UTC");
    expect(review.name).toBe("Morgan");
    expect(review.event.enabled).toBe(false);
  });
});
