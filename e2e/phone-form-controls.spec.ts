import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { applyRenderedTheme } from "./theme-fixture";

const publicRoutes = ["/", "/for/real-estate-agents", "/waitlist"];
const ownerRoutes = ["/contacts", "/contacts/new", "/calendar", "/settings/business", "/settings/notifications", "/account/preferences"];
const fields = "input:visible, select:visible, textarea:visible";
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local");
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!");
  await Promise.all([
    page.waitForURL(/\/jumps/),
    page.getByRole("button", { name: "Sign in", exact: true }).click()
  ]);
  cookies = await context.cookies();
  await context.close();
});

async function expectPhoneFields(page: Page) {
  const undersized = await page.locator(fields).evaluateAll(elements => elements.flatMap(element => {
    const size = Number.parseFloat(getComputedStyle(element).fontSize);
    return size >= 16 ? [] : [{ tag: element.tagName, name: element.getAttribute("name"), size }];
  }));
  expect(undersized, "Phone fields must not trigger focus zoom").toEqual([]);
}

for (const route of [...publicRoutes, ...ownerRoutes]) {
  test(`${route} keeps phone fields readable in both themes`, async ({ page, context }) => {
    if (ownerRoutes.includes(route)) await context.addCookies(cookies);
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(route);
    await expect(page.locator('.product-demo[aria-busy="true"]')).toHaveCount(0);
    if (route === "/calendar") await page.getByRole("link", { name: "New event", exact: true }).click();
    // Include optional fields after opening their normal disclosure controls.
    for (const details of await page.locator("main details:has(input, select, textarea)").all()) {
      if (await details.isVisible() && await details.getAttribute("open") === null) {
        await details.locator(":scope > summary").click();
      }
    }

    for (const colorScheme of ["light", "dark"] as const) {
      await applyRenderedTheme(page, colorScheme, { width: 375, height: 844 });
      // Notifications has no form when reminder providers are not configured.
      if (route !== "/settings/notifications") expect(await page.locator(fields).count()).toBeGreaterThan(0);
      await expectPhoneFields(page);

      await page.setViewportSize({ width: 320, height: 844 });
      await expectPhoneFields(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
  });
}

test("demo fields retain keyboard focus and scale with enlarged text", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 375, height: 844 });
  const situation = page.locator(".product-demo select");
  await expect(situation).toBeEnabled();
  await situation.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(situation).toBeFocused();
  expect(await situation.evaluate(element => element.matches(":focus-visible"))).toBe(true);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect(situation).toHaveCSS("font-size", "32px");
  await expectPhoneFields(page);
});

test("compact desktop control sizes stay unchanged from 768px", async ({ page, context }) => {
  await page.goto("/");
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".product-demo select")).toHaveCSS("font-size", "14px");
  }
  await context.addCookies(cookies);
  await page.goto("/contacts");
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.contact-header-search input[type="search"]')).toHaveCSS("font-size", "15px");
    await expect(page.locator('.contact-list-summary select')).toHaveCSS("font-size", "13px");
  }
});
