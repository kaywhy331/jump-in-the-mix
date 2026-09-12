import { expect, test } from "@playwright/test";
import { axeInPage } from "./axe-in-page";
import { PERSONAS } from "../src/lib/persona-mixes";

test.use({ screenshot: "off", video: "off", trace: "off" });

test("each profession has its own landing page playing that persona's mixes", async ({ page }) => {
  for (const persona of PERSONAS) {
    const response = await page.goto(`/for/${persona.slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(persona.headline);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/for/${persona.slug}$`));
    await expect(page.getByRole("heading", { name: persona.demoHeading })).toBeVisible();
    const radios = page.getByRole("radio");
    await expect(radios).toHaveCount(persona.mixes.length);
    for (const mix of persona.mixes) await expect(page.getByRole("radio", { name: mix.label, exact: true })).toBeVisible();
    await expect(page.locator("#waitlist").getByLabel("Email address")).toBeVisible();
    await expect(page.locator('#waitlist input[name="scenario"]')).toHaveValue(persona.id);
    await expect(page.locator(".product-demo").getByText("Fictional demo contact")).toBeVisible();
    await expect(page.locator(".mixes-for a")).toHaveCount(PERSONAS.length + 1);
    await expect(page.locator(".mixes-for a[aria-current='page']")).toHaveText(persona.navLabel);
    await expect(page.locator(".demo-beat")).toHaveCount(persona.mixes[0].steps.length);
  }
  expect((await page.goto("/for/not-a-profession"))?.status()).toBe(404);
});

test("a persona mix steps through its beats like the homepage demo", async ({ page }) => {
  const persona = PERSONAS.find(item => item.id === "painting")!;
  await page.goto(`/for/${persona.slug}`);
  const mix = persona.mixes[0];
  await page.getByRole("radio", { name: mix.label, exact: true }).check();
  await expect(page.locator(".demo-beat")).toHaveCount(mix.steps.length);
  await expect(page.locator(".demo-beat").first().getByRole("button", { name: /Beat 1/ })).toHaveAttribute("aria-expanded", "true");
  await page.locator(".demo-beat").nth(1).getByRole("button", { name: /Beat 2/ }).click();
  await expect(page.locator(".demo-beat.open")).toHaveCount(1);
  await expect(page.locator(".demo-beat.open .demo-beat-toggle")).toContainText(mix.steps[1].title);
  await page.locator(".demo-beat.open").getByRole("button", { name: "Mark completed" }).click();
  await expect(page.locator(".demo-beat.open .demo-beat-stamp")).toHaveText(/[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}/);
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

test("the profession grid keeps two rows of six from small laptops up", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  for (const [width, columns] of [[1440, 6], [1200, 6], [1100, 6], [1024, 4], [900, 4], [768, 4], [600, 3], [480, 2]] as const) {
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
