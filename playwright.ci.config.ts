import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// CI runs every registration test separately with the synthetic mail transport.
// The ordinary server stays mail-free so unavailable-provider recovery is still covered.
export default defineConfig(base, {
  testIgnore: ["**/registration.spec.ts"]
});
