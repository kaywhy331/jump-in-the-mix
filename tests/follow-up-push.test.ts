import { describe, expect, it } from "vitest";
import { needsPushReminder, pushSubscriptionExpired, validPushEndpoint } from "../src/lib/follow-up-push";

const due = new Date("2026-09-05T17:00:00Z");
const now = new Date("2026-09-05T18:00:00Z");

describe("follow-up reminder eligibility", () => {
  it("notifies newly due items and does not repeat delivered or skipped occurrences", () => {
    expect(needsPushReminder(due, [], now)).toBe(true);
    expect(needsPushReminder(new Date("2026-09-05T19:00:00Z"), [], now)).toBe(false);
    for (const status of ["DELIVERED", "SKIPPED"] as const) {
      expect(needsPushReminder(due, [{ scheduledAt: due, status, attempts: 1, lockedAt: null }], now)).toBe(false);
    }
  });

  it("allows a rescheduled occurrence even when the old schedule was delivered", () => {
    expect(needsPushReminder(now, [{ scheduledAt: due, status: "DELIVERED", attempts: 1, lockedAt: null }], now)).toBe(true);
  });

  it("retries failures and abandoned claims while respecting live leases and the attempt limit", () => {
    expect(needsPushReminder(due, [{ scheduledAt: due, status: "FAILED", attempts: 1, lockedAt: null }], now)).toBe(true);
    expect(needsPushReminder(due, [{ scheduledAt: due, status: "PENDING", attempts: 1, lockedAt: due }], now)).toBe(true);
    expect(needsPushReminder(due, [{ scheduledAt: due, status: "PENDING", attempts: 1, lockedAt: now }], now)).toBe(false);
    expect(needsPushReminder(due, [{ scheduledAt: due, status: "FAILED", attempts: 3, lockedAt: null }], now)).toBe(false);
  });
});

describe("push service validation", () => {
  it("accepts supported HTTPS push providers", () => {
    for (const endpoint of ["https://fcm.googleapis.com/fcm/send/example", "https://web.push.apple.com/example", "https://updates.push.services.mozilla.com/wpush/v2/example", "https://wns2.notify.windows.com/example"]) expect(validPushEndpoint(endpoint)).toBe(true);
  });

  it("rejects local addresses, lookalike hosts, credentials and alternate ports", () => {
    for (const endpoint of ["http://fcm.googleapis.com/example", "https://127.0.0.1/example", "https://localhost/example", "https://fcm.googleapis.com.evil.example/example", "https://fakepush.apple.com/example", "https://user:password@fcm.googleapis.com/example", "https://fcm.googleapis.com:8443/example"]) expect(validPushEndpoint(endpoint)).toBe(false);
  });

  it("removes expired subscriptions without mistaking temporary provider failures for expiry", () => {
    expect(pushSubscriptionExpired({ statusCode: 410 })).toBe(true);
    expect(pushSubscriptionExpired({ statusCode: 404 })).toBe(true);
    expect(pushSubscriptionExpired({ statusCode: 503 })).toBe(false);
  });
});
