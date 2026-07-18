import { describe, expect, it } from "vitest";
import {
  normalizeSharedMixSteps,
  sharedMixContentIssue,
  sharedMixTrendingScore
} from "../src/lib/shared-mix";

describe("Mix Template content", () => {
  it("normalizes legacy sequence shapes into canonical Jumps", () => {
    const steps = normalizeSharedMixSteps({
      content: {
        jumps: [
          { label: "Warm text", type: "text", trigger_days: 0, message: "Hi {{First Name}}, how are things?" },
          { title: "Check-in call", channel: "phone", day_offset: 2, call_script: "Ask what has changed." }
        ]
      }
    });

    expect(steps).toEqual([
      expect.objectContaining({ name: "Warm text", channel: "SMS", dayOffset: 0, body: "Hi {{First Name}}, how are things?" }),
      expect.objectContaining({ name: "Check-in call", channel: "PHONE_CALL", dayOffset: 2, script: "Ask what has changed." })
    ]);
  });

  it("rejects missing content and unsupported placeholders", () => {
    expect(sharedMixContentIssue([{ channel: "EMAIL", dayOffset: 0, subject: "Hello" }])).toContain("requires both a subject and body");
    expect(sharedMixContentIssue([{ channel: "SMS", dayOffset: 0, body: "Hi {{secret.account_number}}" }])).toContain("unsupported placeholders");
  });

  it("allows Private Notes only in Phone Call scripts", () => {
    expect(sharedMixContentIssue([{ channel: "SMS", dayOffset: 0, body: "{{Private Notes}}" }])).toContain("outside a Phone Call");
    expect(sharedMixContentIssue([{ channel: "PHONE_CALL", dayOffset: 0, script: "Review {{Private Notes}} before calling." }])).toBeNull();
  });

  it("ranks recent, voted, and imported templates more highly", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const trending = sharedMixTrendingScore({ voteCount: 8, importCount: 12, publishedAt: new Date("2026-07-15T12:00:00.000Z"), updatedAt: now }, now);
    const quiet = sharedMixTrendingScore({ voteCount: 1, importCount: 1, publishedAt: new Date("2026-04-01T12:00:00.000Z"), updatedAt: now }, now);
    expect(trending).toBeGreaterThan(quiet);
  });
});
