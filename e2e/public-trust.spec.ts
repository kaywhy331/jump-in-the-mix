import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.skip(process.env.PUBLIC_TRUST_E2E !== "1", "Requires configured synthetic public-policy details.");

test("public policies and support are reachable without an account", async ({ page }) => {
  await page.goto("/");
  const links = page.getByRole("navigation", { name: "Policies and support" });
  await expect(links).toBeVisible();
  await links.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your information and privacy");
  await expect(page.locator("main")).toContainText(process.env.PUBLIC_OPERATOR_NAME!);
  await expect(page.locator(".public-retention-notice")).toHaveText(process.env.PUBLIC_BACKUP_RETENTION_NOTICE!);
  await page.getByRole("navigation", { name: "Policies and support" }).getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms of use");
  await page.getByRole("navigation", { name: "Policies and support" }).getByRole("link", { name: "Contact & support" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contact & support");
  await expect(page.locator("main").getByRole("link", { name: process.env.PUBLIC_SUPPORT_EMAIL!, exact: true })).toHaveAttribute("href", `mailto:${encodeURIComponent(process.env.PUBLIC_SUPPORT_EMAIL!)}`);
  for (const path of ["/login", "/register", "/waitlist"]) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Policies and support" }).getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
  }
});

for (const width of [320, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`public notices fit and remain accessible at ${width}px in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    for (const path of ["/privacy", "/terms", "/contact"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
    }
  });
}
