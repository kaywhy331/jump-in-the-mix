import { expect, test, type Page } from "@playwright/test";

const stagingEnabled = Boolean(process.env.STAGING_BASE_URL?.trim());
const userEmail = process.env.STAGING_SMOKE_USER_EMAIL?.trim();
const userPassword = process.env.STAGING_SMOKE_USER_PASSWORD?.trim();

async function signIn(page: Page) {
  if (!userEmail || !userPassword) throw new Error("STAGING_SMOKE_USER_EMAIL and STAGING_SMOKE_USER_PASSWORD are required.");
  await page.goto("/login");
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password").fill(userPassword);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

async function assertApplicationPage(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response, `${path} should return a document response`).not.toBeNull();
  expect(response!.status(), `${path} should return a successful document response`).toBeLessThan(400);
  await expect.poll(() => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--surface").trim()
  ), { message: `${path} should load the deployed application styles` }).not.toBe("");
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Internal Server Error|Application error|not-ready/i);
}

test.describe("production-like staging smoke", () => {
  test.skip(!stagingEnabled, "STAGING_BASE_URL is only configured for the explicit staging smoke command.");

  test("web, database, worker, and authenticated application routes are ready", async ({ page, request }) => {
    const ready = await request.get("/api/health/ready");
    expect(ready.ok()).toBeTruthy();
    expect(await ready.json()).toMatchObject({ status: "ready", checks: { database: "ready", configuration: "valid" } });

    const worker = await request.get("/api/health/worker");
    expect(worker.ok()).toBeTruthy();
    expect(await worker.json()).toMatchObject({ status: "ready" });

    await signIn(page);
    for (const path of ["/jumps", "/contacts", "/mixes", "/templates", "/journey", "/settings/journey", "/calendar", "/settings/connections", "/help", "/account"]) {
      await assertApplicationPage(page, path);
    }
  });
});
