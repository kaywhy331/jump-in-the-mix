import { expect, test } from "@playwright/test";

test("phone public navigation and two-column directory follow the supplied layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".public-header > .logo > span:last-child")).toBeVisible();
  const menu = page.locator(".public-mobile-menu > summary");
  await menu.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Explore the app" }).getByRole("link", { name: "Sign in", exact: true })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Explore the app" })).not.toBeVisible();
  await expect(menu).toBeFocused();
  const items = page.locator(".profession-grid > li");
  const first = (await items.nth(0).boundingBox())!, second = (await items.nth(1).boundingBox())!;
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x + first.width);
  const demo = (await page.locator(".hero > .product-demo").boundingBox())!;
  const situations = (await page.locator(".hero > .mixes-for").boundingBox())!;
  expect(situations.y).toBeGreaterThan(demo.y + demo.height);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
