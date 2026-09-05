import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";

const coreRoutes = ["/jumps", "/contacts", "/contacts/new", "/mixes/new"] as const;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password").fill(userPassword);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

test("core signed-in pages pass automated WCAG checks", async ({ page }, testInfo) => {
  await signIn(page);

  for (const route of coreRoutes) {
    await test.step(route, async () => {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();

      if (results.violations.length > 0) {
        await testInfo.attach(`axe-${route.slice(1).replaceAll("/", "-") || "home"}.json`, {
          body: JSON.stringify(results.violations, null, 2),
          contentType: "application/json"
        });
      }

      const summary = results.violations
        .map((violation) => `${violation.id}: ${violation.nodes.length} node(s) — ${violation.help}`)
        .join("\n");
      expect(results.violations, summary).toEqual([]);
    });
  }
});
