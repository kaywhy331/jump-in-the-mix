import { expect, test, type Page } from "@playwright/test";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password").fill(userPassword);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("core pages preserve clean fitment without horizontal overflow", async ({ page }) => {
  await signIn(page);
  for (const route of ["/jumps", "/contacts", "/mixes", "/settings", "/account"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("desktop card rows share a common top edge", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop alignment is checked once.");
  await signIn(page);

  await page.goto("/account");
  const accountCards = page.locator(".account-grid > .card");
  const firstAccount = await accountCards.nth(0).boundingBox();
  const billingCard = page.locator(".account-billing-card");
  const billing = await billingCard.boundingBox();
  const accountGrid = await page.locator(".account-grid").boundingBox();
  expect(firstAccount).not.toBeNull();
  expect(billing).not.toBeNull();
  expect(accountGrid).not.toBeNull();
  expect(Math.abs(firstAccount!.x - accountGrid!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(billing!.x - accountGrid!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(billing!.width - accountGrid!.width)).toBeLessThanOrEqual(1);

  await page.goto("/settings");
  const settingsCards = page.locator(".settings-hub-grid > .settings-hub-card");
  const firstSetting = await settingsCards.nth(0).boundingBox();
  const secondSetting = await settingsCards.nth(1).boundingBox();
  expect(firstSetting).not.toBeNull();
  expect(secondSetting).not.toBeNull();
  expect(Math.abs(firstSetting!.y - secondSetting!.y)).toBeLessThanOrEqual(1);
});

test("mobile navigation and actions stay inside the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile geometry is checked once.");
  await signIn(page);
  await page.goto("/jumps");

  const links = page.locator(".mobile-nav .nav-link:visible");
  await expect(links).toHaveCount(4);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  for (let index = 0; index < await links.count(); index += 1) {
    const box = await links.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  }
  await expectNoHorizontalOverflow(page);
});
