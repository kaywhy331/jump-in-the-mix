import { defineConfig, devices } from "@playwright/test";
import config from "./playwright.config";

// Engine qualification without image capture. Physical Safari remains a
// separate device check; the Linux WebKit engine cannot qualify phone handoffs.
const safe = { screenshot: "off", video: "off", trace: "off" } as const;
export default defineConfig({
  ...config,
  outputDir: ".artifacts/design-refresh-2026-09-05/compat-results",
  reporter: "list",
  use: { ...config.use, ...safe, navigationTimeout: 90_000 },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], ...safe } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"], ...safe } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"], ...safe } }
  ]
});
