import { describe, expect, it } from "vitest";
import { productionConfigurationIssues, resolveAuthRateLimitSecret } from "../src/lib/env";

describe("environment fallbacks", () => {
  it("does not bypass production configuration checks when CI is set", () => {
    const issues = productionConfigurationIssues({ NODE_ENV: "production", CI: "true" });
    expect(issues).toContain("DATABASE_URL is required");
    expect(issues).toContain("AUTH_RATE_LIMIT_SECRET must be a unique secret of at least 32 characters");
    expect(issues).toContain("RESEND_API_KEY is required for hosted production");
    expect(productionConfigurationIssues({ NODE_ENV: "development", CI: "true" })).toEqual([]);
  });

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

  it("rejects pilot mode on a public production host", () => {
    const issues = productionConfigurationIssues({
      NODE_ENV: "production",
      APP_URL: "https://app.example.com",
      PILOT_MODE: "true",
      DATABASE_URL: "postgresql://example.invalid/app",
      AUTH_RATE_LIMIT_SECRET: "r".repeat(32),
      DATA_ENCRYPTION_KEY: "e".repeat(32),
      DEMO_MODE: "false"
    });
    expect(issues).toContain("APP_URL must be a public https origin");
  });

  it("requires verified email delivery for hosted production", () => {
    const issues = productionConfigurationIssues({
      NODE_ENV: "production",
      APP_URL: "https://app.example.com",
      PILOT_MODE: "false",
      DATABASE_URL: "postgresql://example.invalid/app",
      AUTH_RATE_LIMIT_SECRET: "r".repeat(32),
      DATA_ENCRYPTION_KEY: "e".repeat(32),
      DEMO_MODE: "false"
    });
    expect(issues).toContain("AUTH_REQUIRE_EMAIL_VERIFICATION must be true for hosted production");
    expect(issues).toContain("RESEND_API_KEY is required for hosted production");
    expect(issues).toContain("EMAIL_FROM is required for hosted production");
  });

  it("accepts the managed Netlify database without disabling hosted email checks", () => {
    const issues = productionConfigurationIssues({
      NODE_ENV: "production",
      APP_URL: "https://app.netlify.app",
      NETLIFY_DB_URL: "postgresql://example.invalid/app",
      AUTH_RATE_LIMIT_SECRET: "r".repeat(32),
      DATA_ENCRYPTION_KEY: "e".repeat(32)
    });
    expect(issues).not.toContain("DATABASE_URL is required");
    expect(issues).toContain("RESEND_API_KEY is required for hosted production");
  });
});
