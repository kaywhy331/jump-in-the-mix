import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  StripeWebhookSignatureError,
  stripePayloadHash,
  verifyStripeWebhookSignature
} from "../src/lib/stripe-client";

function header(payload: string, secret: string, timestamp: number, extraSignatures: string[] = []): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return [`t=${timestamp}`, ...extraSignatures.map((value) => `v1=${value}`), `v1=${signature}`].join(",");
}

describe("Stripe webhook signature verification", () => {
  const payload = JSON.stringify({ id: "evt_test", type: "invoice.paid", data: { object: {} } });
  const secret = "whsec_test_secret";
  const now = 1_900_000_000;

  it("accepts a valid v1 signature inside the timestamp tolerance", () => {
    expect(() => verifyStripeWebhookSignature(payload, header(payload, secret, now - 30), secret, 300, now)).not.toThrow();
  });

  it("accepts one valid signature when Stripe includes multiple v1 values", () => {
    const invalid = "0".repeat(64);
    expect(() => verifyStripeWebhookSignature(payload, header(payload, secret, now, [invalid]), secret, 300, now)).not.toThrow();
  });

  it("rejects a wrong secret and changed payload", () => {
    const signed = header(payload, secret, now);
    expect(() => verifyStripeWebhookSignature(payload, signed, "whsec_wrong", 300, now)).toThrow(StripeWebhookSignatureError);
    expect(() => verifyStripeWebhookSignature(`${payload} `, signed, secret, 300, now)).toThrow(StripeWebhookSignatureError);
  });

  it("rejects stale signatures and malformed headers", () => {
    expect(() => verifyStripeWebhookSignature(payload, header(payload, secret, now - 301), secret, 300, now)).toThrow(/tolerance/i);
    expect(() => verifyStripeWebhookSignature(payload, "t=broken,v0=value", secret, 300, now)).toThrow(/malformed/i);
    expect(() => verifyStripeWebhookSignature(payload, null, secret, 300, now)).toThrow(/missing/i);
  });

  it("hashes the raw payload deterministically for event diagnostics", () => {
    expect(stripePayloadHash(payload)).toMatch(/^[a-f0-9]{64}$/);
    expect(stripePayloadHash(payload)).toBe(stripePayloadHash(payload));
    expect(stripePayloadHash(`${payload} `)).not.toBe(stripePayloadHash(payload));
  });
});
