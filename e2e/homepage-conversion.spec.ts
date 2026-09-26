import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { axeInPage } from "./axe-in-page";
import { prisma } from "../src/lib/prisma";

test.use({ screenshot: "off", video: "off", trace: "off" });

test("homepage keeps signup prominent, navigation spaced, and the three-Beat demo usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1000, 900], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".product-demo")).toHaveAttribute("aria-busy", "false");
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const navLinks = [...document.querySelectorAll(".public-site-nav > a")].filter(element => element.checkVisibility()).map(element => element.getBoundingClientRect());
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        headerHeight: box(".public-header").height,
        signupBottom: box(".hero-actions .primary").bottom,
        sampleHeight: box(".product-demo").height,
        sampleActionTop: box("#sample .primary").top,
        spaced: navLinks.every((link, index) => index === 0 || link.left - navLinks[index - 1].right >= 7),
        logoFits: box(".public-header > .logo").right < navLinks[0].left,
      };
    });
    expect(geometry.overflow, `${width}px overflow`).toBe(false);
    expect(geometry.spaced, `${width}px navigation spacing`).toBe(true);
    expect(geometry.logoFits, `${width}px logo space`).toBe(true);
    expect(geometry.headerHeight, `${width}px header height`).toBeLessThan(95);
    if ([390, 1024, 1280, 1440].includes(width)) expect(geometry.signupBottom).toBeLessThan(height);
    if (width === 390) {
      expect(geometry.sampleHeight).toBeLessThan(850);
      expect(geometry.sampleActionTop).toBeLessThan(1650);
    }
    await expect(page.locator('.hero-actions a[href="/waitlist"]')).toHaveAttribute("href", "/waitlist");
  }
});

test("sample link, signup paths, FAQ, and public accessibility work in both themes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport and theme matrix.");
  for (const colorScheme of ["light", "dark"] as const) for (const width of [390, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "You meant to follow up. Then work happened." })).toBeVisible();
    await page.getByRole("link", { name: "Try the demo", exact: false }).click();
    await expect(page.locator("#sample textarea")).toBeFocused();
    await expect(page.locator(".public-faq")).toHaveCount(0);
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    // The questions live on their own page; the header link is hidden on phones, the footer link is not.
    await page.getByRole("link", { name: "Questions", exact: true }).first().click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.getByRole("heading", { level: 1, name: "A little clarity before you start." })).toBeVisible();
    await page.getByText("Will Jump in the Mix be sending messages for me?", { exact: true }).click();
    await expect(page.locator(".public-faq details[open] p")).toHaveText("You review your follow-ups and send them through your own messaging app. Automatic sending is off during the beta. Personal invitations appear in Today for you to review and send through your own text or email app.");
    await page.getByRole("link", { name: "Your data", exact: true }).click();
    await expect(page).toHaveURL(/\/faq#your-data$/);
    await page.getByText("How can I control my data?", { exact: true }).click();
    await expect(page.locator("#your-data")).toContainText("Data & privacy");
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.getByRole("link", { name: "Back to home", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.locator('.hero-actions a[href="/waitlist"]').click();
    await expect(page).toHaveURL(/\/waitlist$/);
    await expect(page.getByRole("heading", { name: "Join the waitlist" })).toBeVisible();
  }
});

test("homepage metadata describes the client follow-up app and exposes a real sharing image", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/^Client Follow-Up App \| Jump in the Mix$/);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /client follow-up plans/);
  const image = await request.get("/relationship-preview.png");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  expect((await image.body()).byteLength).toBeGreaterThan(1000);
});

test("conversion hooks record engagement without claiming a send or collecting draft content", async ({ page }) => {
  await page.addInitScript(() => {
    const events: unknown[] = [];
    Object.defineProperty(window, "conversionTestEvents", { value: events });
    window.addEventListener("jitm:conversion", event => events.push((event as CustomEvent).detail));
    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (target?.href.startsWith("sms:")) event.preventDefault();
    });
  });
  await page.goto("/");
  // Demo controls are disabled until hydration; the adapter attaches in the same commit.
  await expect(page.locator("#sample textarea")).toBeEnabled();
  await page.locator("#sample textarea").fill("Private draft content must never reach analytics");
  await page.locator("#sample").getByRole("button", { name: "Preview SMS", exact: true }).click();
  await page.locator('.hero-actions a[href="/waitlist"]').click();
  await expect(page).toHaveURL(/\/waitlist$/);
  const events = await page.evaluate(() => (window as Window & { conversionTestEvents?: Record<string, unknown>[] }).conversionTestEvents ?? []);
  expect(events.filter(event => event.name === "sample_engaged")).toHaveLength(1);
  expect(events.some(event => event.name === "handoff_requested")).toBe(false);
  expect(events.some(event => event.name === "signup_start" && event.placement === "hero")).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(/Private draft|5555555555|example\.invalid/);
  for (const event of events) expect(Object.keys(event).every(key => ["name", "placement", "channel", "version", "viewport"].includes(key))).toBe(true);
});

test("conversion hooks respect browser privacy signals", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Privacy signal behavior is independent of viewport.");
  for (const signal of ["doNotTrack", "globalPrivacyControl"]) {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, httpCredentials: testInfo.project.use.httpCredentials });
    await context.addInitScript((property: string) => {
      Object.defineProperty(navigator, property, { configurable: true, value: property === "doNotTrack" ? "1" : true });
      Object.defineProperty(window, "conversionTestEvents", { value: [] });
      window.addEventListener("jitm:conversion", event => (window as unknown as Window & { conversionTestEvents: unknown[] }).conversionTestEvents.push((event as CustomEvent).detail));
    }, signal);
    const page = await context.newPage();
    try {
      await page.goto("/");
      await page.locator("#sample").getByRole("button", { name: "Preview SMS", exact: true }).click();
      await page.locator('.hero-actions a[href="/waitlist"]').click();
      await expect(page).toHaveURL(/\/waitlist$/);
      expect(await page.evaluate(() => (window as unknown as Window & { conversionTestEvents: unknown[] }).conversionTestEvents)).toEqual([]);
    } finally { await context.close(); }
  }
});

test("the public header says Open Today to a signed-in visitor and Sign in to everyone else", async ({ page, context }) => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { email: `header-${suffix}@example.test`, name: "Header Owner", emailVerifiedAt: new Date() } });
  try {
    await prisma.workspace.create({ data: { ownerId: user.id, name: "Header fixture", slug: `header-${suffix}`, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: true, onboardingStep: 5 } } } });
    const token = randomUUID();
    await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
    const signIn = page.locator(".public-site-nav .public-sign-in");
    await page.goto("/");
    await expect(signIn).toHaveText("Sign in");
    await expect(signIn).toHaveAttribute("href", "/login");
    await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL ?? process.env.PLAYWRIGHT_BASE_URL!, httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/");
    await expect(signIn).toHaveText("Open Today");
    await expect(signIn).toHaveAttribute("href", "/jumps");
  } finally {
    await prisma.workspace.deleteMany({ where: { ownerId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("each waitlist state has its own heading", async ({ page }) => {
  await page.goto("/waitlist?submitted=1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your inbox");
  await page.goto("/waitlist?confirmed=1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You’re on the waitlist");
  await page.goto("/waitlist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Join the waitlist");
});
