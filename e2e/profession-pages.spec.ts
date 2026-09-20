import { expect, test } from "@playwright/test";
import { axeInPage } from "./axe-in-page";
import { PERSONAS } from "../src/lib/persona-mixes";

test.use({ screenshot: "off", video: "off", trace: "off" });

test("each profession starts with a short SMS draft", async ({ page }) => {
  for (const persona of PERSONAS) {
    await page.goto(`/for/${persona.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(persona.headline);
    await expect(page.locator("#sample textarea")).toBeEnabled();
    expect((await page.locator("#sample textarea").inputValue()).length).toBeLessThan(300);
    await expect(page.locator(".mixes-for a[aria-current='page']")).toHaveText(persona.navLabel);
  }
  expect((await page.goto("/for/not-a-profession"))?.status()).toBe(404);
});

test("the homepage links to every profession page and keeps its trimmed sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".mixes-for a")).toHaveCount(PERSONAS.length + 1);
  await expect(page.locator(".mixes-for a[aria-current='page']")).toHaveText("All");
  for (const persona of PERSONAS) await expect(page.locator(`.mixes-for a[href="/for/${persona.slug}"]`)).toHaveText(persona.navLabel);
  await expect(page.getByRole("heading", { name: "Find a follow-up Mix for your work." })).toBeVisible();
  await expect(page.locator(".profession-grid li")).toHaveCount(12);
  await expect(page.locator(".profession-grid li").last()).toHaveText("And more");
  await expect(page.getByText("Freelancers", { exact: true })).toHaveCount(0);
  await expect(page.locator(".public-footer a[href='/privacy'], .public-footer a[href='/terms'], .public-footer a[href='/contact']")).toHaveCount(3);
  await expect(page.getByText(/Every 7 days|By invitation|invited by a member/)).toHaveCount(0);
  await expect(page.locator("#features, .public-control")).toHaveCount(0);
  await expect(page.locator("#how-it-works")).toHaveCount(1);
  // The questions moved to /faq; the homepage keeps a header and footer link to them.
  await expect(page.locator(".public-faq, #questions")).toHaveCount(0);
  await expect(page.locator(".public-site-nav a[href='/faq'], .public-footer a[href='/faq'], .public-footer a[href='/faq#your-data']")).toHaveCount(3);
  await expect(page.locator("#waitlist, #sample")).toHaveCount(2);
});

test("the profession grid follows the supplied two-column desktop and single-column phone design", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  for (const [width, columns] of [[1440, 2], [1200, 2], [1100, 2], [1024, 2], [900, 2], [768, 2], [600, 1], [480, 1]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const perRow = await page.locator(".profession-grid li").evaluateAll(items => { const top = items[0].getBoundingClientRect().top; return items.filter(item => item.getBoundingClientRect().top === top).length; });
    expect(perRow, `${width}px`).toBe(columns);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), `${width}px overflow`).toBe(false);
  }
});

test("profession pages pass automated accessibility checks", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  for (const slug of ["contractors", "independent-recruiters"]) {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/for/${slug}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), `${slug} ${width}px overflow`).toBe(false);
    }
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
});
