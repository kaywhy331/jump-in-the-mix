import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("homepage offers an email waitlist without opening account signup", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#waitlist").getByLabel("Email address")).toBeVisible();
  await expect(page.locator("#waitlist").getByRole("button", { name: "Join the waitlist" })).toBeVisible();
  await page.locator(".hero-actions").getByRole("link", { name: "Join the waitlist" }).click();
  await expect(page).toHaveURL(/\/waitlist$/);
  await expect(page.getByText(/Every 7 days, we invite up to 10 people/)).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
});

test("waitlist fits mobile and desktop and is accessible in both themes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  await page.goto("/waitlist");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    }
  }
});

test("confirmation links require a button press and use private response headers", async ({ page, request }) => {
  const response = await request.get("/waitlist/confirm?token=example");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  await page.goto("/waitlist/confirm?token=example");
  await expect(page.getByRole("button", { name: "Confirm waitlist request" })).toBeVisible();
  await expect(page).toHaveURL(/\/waitlist\/confirm\?token=example$/);
});

test("leave, confirmation, and receipt controls fit mobile and desktop in both themes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  for (const path of ["/waitlist/leave", `/waitlist/leave?token=${"a".repeat(43)}`, "/waitlist/leave?stopped=1"]) {
    await page.goto(path);
    for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 390, 1440]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    }
  }
});
