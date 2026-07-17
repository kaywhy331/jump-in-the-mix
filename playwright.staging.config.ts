import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.STAGING_BASE_URL?.trim();
if (!baseURL) throw new Error("STAGING_BASE_URL is required for the staging smoke suite.");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "staging-smoke.spec.ts",
  outputDir: "test-results-staging",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"], ["html", { outputFolder: "playwright-report-staging", open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    { name: "staging-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "staging-mobile", use: { ...devices["Pixel 7"] } }
  ]
});
