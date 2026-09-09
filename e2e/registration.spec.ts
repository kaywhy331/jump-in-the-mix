import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("invitation-only entry fits phones and desktops in both themes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport and theme matrix.");
  await page.goto("/register");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("An invitation from someone you know");
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByText(/Each member has five invitations/)).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    }
  }
});

test("invalid invitation URLs do not open signup or expose a recipient", async ({ page, request }) => {
  const response = await request.get("/register?invite=invalid");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["cache-control"]).toContain("no-store");
  await page.goto("/register?invite=invalid");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This invitation is unavailable");
  await expect(page.locator("form")).toHaveCount(0);
});
