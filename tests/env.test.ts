import { describe, expect, it } from "vitest";
import { resolveAuthRateLimitSecret } from "../src/lib/env";

describe("environment fallbacks", () => {
  it("uses the data-encryption key when the explicit rate-limit secret is blank", () => {
    expect(resolveAuthRateLimitSecret({
      AUTH_RATE_LIMIT_SECRET: "   ",
      DATA_ENCRYPTION_KEY: "local-data-encryption-key"
    })).toBe("local-data-encryption-key");
  });

  it("prefers and trims an explicit rate-limit secret", () => {
    expect(resolveAuthRateLimitSecret({
      AUTH_RATE_LIMIT_SECRET: "  explicit-rate-limit-secret  ",
      DATA_ENCRYPTION_KEY: "local-data-encryption-key"
    })).toBe("explicit-rate-limit-secret");
  });
});
