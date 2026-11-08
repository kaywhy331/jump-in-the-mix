import { expect, test, type Locator } from "@playwright/test";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";
import { PERSONAS } from "../src/lib/persona-mixes";

async function expectTextLinks(links: Locator) {
  expect(await links.count()).toBeGreaterThan(0);
  for (const link of await links.all()) {
    await expect(link).toBeVisible();
    const styles = await link.evaluate(element => ({
      decoration: getComputedStyle(element).textDecorationLine,
      color: getComputedStyle(element).color,
      surroundingColor: getComputedStyle(element.parentElement!).color
    }));
    expect(styles.decoration).toContain("underline");
    expect(styles.color).not.toBe(styles.surroundingColor);
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`public prose and profession links have cues at rest in ${theme}`, async ({ page }) => {
    await page.goto("/follow-up-templates");
    await applyRenderedTheme(page, theme);
    const professions = page.locator('section[aria-labelledby="routes-title"] li a');
    await expect(professions).toHaveCount(PERSONAS.length);
    await expectTextLinks(professions);
    expect((await axeInPage(page).include('section[aria-labelledby="routes-title"]').withRules(["color-contrast"]).analyze()).violations).toEqual([]);

    await page.goto("/waitlist");
    await applyRenderedTheme(page, theme);
    const waitlistLinks = page.locator('.auth-card p a[href="/login"], .auth-card p a[href="/waitlist/leave"], .auth-card > a[href="/"]:not(.logo)');
    await expect(waitlistLinks).toHaveCount(3);
    await expectTextLinks(waitlistLinks);
    expect((await axeInPage(page).include(".auth-card").withRules(["color-contrast"]).analyze()).violations).toEqual([]);

    // A real Tab transition keeps the existing shared focus outline visible.
    await page.getByRole("link", { name: "Leave the waitlist or stop invitation emails" }).focus();
    await page.keyboard.press("Tab");
    const home = page.getByRole("link", { name: "Back to home", exact: true });
    await expect(home).toBeFocused();
    await expect(home).toHaveCSS("outline-style", "solid");
    await expect(home).toHaveCSS("outline-width", "3px");
    await expect(home).toHaveCSS("outline-offset", "3px");
    await home.press("Enter");
    await expect(page).toHaveURL(/\/$/);
  });

  test(`invitation and staff text links have cues at rest in ${theme}`, async ({ page }) => {
    await page.goto("/register");
    await applyRenderedTheme(page, theme);
    await expectTextLinks(page.locator('.auth-card p a[href="/contact"]'));
    await page.goto("/staff/accept");
    await applyRenderedTheme(page, theme);
    await expectTextLinks(page.getByRole("link", { name: "Sign in to an existing account" }));
    expect((await axeInPage(page).include(".auth-card").withRules(["color-contrast"]).analyze()).violations).toEqual([]);
  });

  test(`preferences and business links are distinct from explanatory text in ${theme}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local");
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/(jumps|onboarding)(\?|$)/);
    await page.goto("/account/preferences");
    await applyRenderedTheme(page, theme);
    await expectTextLinks(page.locator('.account-preferences-page > p a'));
    await page.goto("/settings/business");
    await applyRenderedTheme(page, theme);
    const info = page.locator('.settings-business-page > .notice.info');
    await expect(info.locator('a[href="/account/preferences"]')).toHaveText("Timezone and scheduling");
    await expect(info.locator('a[href="/settings/sending"]')).toHaveText("Sending defaults");
    for (const link of await info.locator("a").all()) await expect(link).toHaveCSS("text-decoration-line", "underline");
    const distinction = await info.evaluate(element => {
      const paragraph = element.querySelector("p")!;
      return {
        textColor: getComputedStyle(paragraph).color,
        linkColor: getComputedStyle(element.querySelector("a")!).color,
        textDecoration: getComputedStyle(paragraph).textDecorationLine,
        linksInExplanation: paragraph.querySelectorAll("a").length
      };
    });
    expect(distinction.textColor).not.toBe(distinction.linkColor);
    expect(distinction.textDecoration).toBe("none");
    expect(distinction.linksInExplanation).toBe(0);
    expect((await axeInPage(page).include(".settings-business-page").withRules(["color-contrast"]).analyze()).violations).toEqual([]);
  });
}
