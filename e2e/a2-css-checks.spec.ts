import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { applyRenderedTheme } from "./theme-fixture";
import { createPendingJumpFixture, removePendingJumpFixture } from "./pending-jump-fixture";

// Release A2 CSS batch (design audit 2026-09-24 F2, F3, F5, F10, F11, F17): computed sizes on the real pages.
const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";
const phone = { width: 390, height: 844 };

test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(120_000);

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
  await Promise.all([page.waitForURL(/\/(jumps|onboarding)(\?|$)/), page.getByRole("button", { name: "Sign in" }).click()]);
}

/** Every visible match is at least 44 px tall (the phone target floor). */
async function expectTargets(locator: Locator, label: string) {
  // Streamed pages swap their content in after load; measure once the controls are on screen.
  await expect(locator.filter({ visible: true }).first(), `${label}: no visible controls`).toBeVisible();
  const heights = await locator.evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => Math.round(node.getBoundingClientRect().height * 10) / 10));
  expect(heights.length, `${label}: no visible controls`).toBeGreaterThan(0);
  for (const height of heights) expect(height, label).toBeGreaterThanOrEqual(44);
}

const px = (locator: Locator, property: string) => locator.evaluate((node, name) => parseFloat(getComputedStyle(node).getPropertyValue(name)), property);

test("Today rows use the export's name and avatar sizes and sentence-case queue headers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The viewports are set explicitly.");
  const jumpId = await createPendingJumpFixture("A2 CSS row");
  try {
    await signIn(page);
    for (const viewport of [phone, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/jumps?range=all");
      const card = page.locator(`[data-jump-workflow="${jumpId}"]:visible`);
      await expect(card).toBeVisible();
      expect(await px(card.locator(".jump-card-heading h3"), "font-size")).toBe(16);
      const avatar = card.locator(".jump-person-avatar");
      const box = await avatar.boundingBox();
      expect(Math.round(box!.width)).toBe(40); expect(Math.round(box!.height)).toBe(40);
      for (const heading of await page.locator(".today-page .section-label h2:visible").all()) await expect(heading).toHaveCSS("text-transform", "none");
      // The time pill still fits beside a long name at the narrowest phone width. When the card is "Next up" it bleeds
      // 8 px into the page gutter by design, so measure the card's own contents and the page, not the row around it.
      if (viewport.width === 390) {
        await page.setViewportSize({ width: 320, height: 700 });
        const overflow = await card.locator("article.jump-card").evaluate(node => node.scrollWidth - node.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      }
    }
  } finally { await removePendingJumpFixture(jumpId); }
});

test("phone controls on Calendar, Journey, Marketplace and Contacts are 44 px targets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The viewports are set explicitly.");
  await signIn(page);
  await page.setViewportSize(phone);
  await page.goto("/calendar");
  await expectTargets(page.locator(".calendar-page .calendar-week-nav .button"), "calendar week navigation");
  await page.goto("/calendar?new=1");
  await expectTargets(page.locator(".calendar-form-row .when-chip"), "calendar duration chips");
  await page.goto("/journey");
  await expectTargets(page.locator('[aria-label="Journey view"] button'), "Journey view tabs");
  await page.goto("/marketplace");
  await expectTargets(page.locator(".marketplace-sections a"), "Marketplace section tabs");
  await expectTargets(page.locator(".marketplace-kinds a"), "Marketplace kind chips");
  await page.goto("/contacts");
  await expectTargets(page.locator(".contact-filter-button"), "contact filter button");
});

test("the compact rail labels stay readable at tablet width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The viewport is set explicitly.");
  await signIn(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto("/jumps");
  const sizes = await page.locator(".sidebar .nav-link").evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => parseFloat(getComputedStyle(node).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(12);
});

test("the homepage waitlist band keeps readable input and status colours in both themes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Both themes are emulated explicitly.");
  const luminance = (rgb: string) => {
    const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  await page.goto("/");
  const band = page.locator(".homepage #waitlist");
  await expect(band).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await applyRenderedTheme(page, scheme);
    const input = band.locator("input[type=email], input[name=email]").first();
    const colours = await input.evaluate(node => { const style = getComputedStyle(node); return { color: style.color, background: style.backgroundColor }; });
    expect(contrast(colours.color, colours.background), `${scheme} input text`).toBeGreaterThanOrEqual(4.5);
    const bandStyle = await band.evaluate(node => { const style = getComputedStyle(node); return { color: style.color, background: style.backgroundColor }; });
    expect(contrast(bandStyle.color, bandStyle.background), `${scheme} band text`).toBeGreaterThanOrEqual(4.5);
  }
});

test("with nothing due or done, Today's link to completed follow-ups is a full-height target", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The viewports are set explicitly.");
  test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
  const token = randomUUID(), suffix = randomUUID();
  const user = await prisma.user.create({ data: { email: `empty-today-${suffix}@example.com`, name: "Empty Today", passwordHash: "fixture-only", emailVerifiedAt: new Date() } });
  const workspace = await prisma.workspace.create({ data: { ownerId: user.id, slug: `empty-today-${suffix}`, name: "Empty Today", members: { create: { userId: user.id, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } });
  try {
    await prisma.userPreference.create({ data: { userId: user.id, timezone: "UTC" } });
    await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
    await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
    for (const viewport of [phone, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/jumps");
      const link = page.getByRole("link", { name: "View completed follow-ups", exact: true });
      await expect(link).toBeVisible();
      expect(Math.round((await link.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
      expect((await new AxeBuilder({ page }).include(".today-queue-group").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    }
  } finally {
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
