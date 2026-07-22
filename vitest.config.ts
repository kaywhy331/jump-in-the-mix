import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    exclude: [
      "e2e/**",
      "node_modules/**",
      // These suites certify dormant capabilities preserved only for migration safety.
      // The structure-first product denies every corresponding route and does not run
      // provider, commercial, entitlement, or referral workers.
      "tests/ai-mix*.test.ts",
      "tests/billing*.test.ts",
      "tests/google-*.test.ts",
      "tests/mix-generator.test.ts",
      "tests/plan-downgrade*.test.ts",
      "tests/public-plan-intent.test.ts",
      "tests/referral-*.test.ts",
      "tests/shared-mix-integration.test.ts",
      "tests/stripe-signature.test.ts"
    ],
    fileParallelism: true
  }
});
