import { expect, test } from "@playwright/test";
import { axeInPage } from "./axe-in-page";

test.use({ screenshot: "off", video: "off", trace: "off" });

test("homepage keeps signup prominent, navigation spaced, and the first demo compact", async ({ page }, testInfo) => {
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
        sampleActionTop: box(".demo-actions .primary").top,
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
      expect(geometry.sampleHeight).toBeLessThan(830);
      expect(geometry.sampleActionTop).toBeLessThan(1350);
    }
    await expect(page.locator(".demo-start")).toHaveAttribute("href", "/waitlist");
  }
});

test("sample link, signup paths, FAQ, and public accessibility work in both themes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport and theme matrix.");
  for (const colorScheme of ["light", "dark"] as const) for (const width of [390, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Know who to follow up with. And what to say." })).toBeVisible();
    await page.getByRole("link", { name: "Try the demo", exact: false }).click();
    await expect(page).toHaveURL(/#sample$/);
    const sampleTop = await page.locator(".product-demo").evaluate(element => element.getBoundingClientRect().top);
    expect(Math.abs(sampleTop)).toBeLessThan(40);
    await expect(page.locator(".public-faq")).toHaveCount(0);
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    // The questions live on their own page; the header link is hidden on phones, the footer link is not.
    await page.getByRole("link", { name: "Questions", exact: true }).first().click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.getByRole("heading", { level: 1, name: "A little clarity before you start." })).toBeVisible();
    await page.getByText("Will Jump in the Mix be sending messages for me?", { exact: true }).click();
    await expect(page.locator(".public-faq details[open] p")).toHaveText("You review your follow-ups and send them through your own messaging app by default. Automatic sending is optional and needs a connected provider. Personal invitations are emailed through the System Mix after you choose a contact and press Send.");
    await page.getByRole("link", { name: "Your data", exact: true }).click();
    await expect(page).toHaveURL(/\/faq#your-data$/);
    await page.getByText("How can I control my data?", { exact: true }).click();
    await expect(page.locator("#your-data")).toContainText("Data & privacy");
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.getByRole("link", { name: "Back to home", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.locator(".demo-start").click();
    await expect(page).toHaveURL(/\/waitlist$/);
    await expect(page.getByRole("heading", { name: "Join the waitlist" })).toBeVisible();
  }
});

test("homepage metadata describes the relationship product and exposes a real sharing image", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Know who to follow up with\. And what to say\./);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /relationships that matter/);
  const image = await request.get("/relationship-preview.png");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  expect((await image.body()).byteLength).toBeGreaterThan(1000);
});

test("conversion hooks distinguish demo handoffs from signup and exclude draft content", async ({ page }) => {
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
  await expect(page.getByRole("radio", { name: "Lead", exact: true })).toBeEnabled();
  await page.locator(".demo-beat.open").getByLabel("Message", { exact: true }).fill("Private draft content must never reach analytics");
  await page.locator(".demo-beat.open").getByRole("link", { name: "Text Message", exact: true }).click();
  await page.locator(".demo-start").click();
  await expect(page).toHaveURL(/\/waitlist$/);
  const events = await page.evaluate(() => (window as Window & { conversionTestEvents?: Record<string, unknown>[] }).conversionTestEvents ?? []);
  expect(events.filter(event => event.name === "sample_engaged")).toHaveLength(1);
  expect(events).toContainEqual({ name: "handoff_requested", placement: "sample", channel: "text", version: "relationships-v1", viewport: test.info().project.name === "mobile-chromium" ? "compact" : "wide" });
  expect(events.some(event => event.name === "signup_start" && event.placement === "sample")).toBe(true);
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
      await page.getByRole("radio", { name: "Quote", exact: true }).check();
      await page.locator(".demo-start").click();
      await expect(page).toHaveURL(/\/waitlist$/);
      expect(await page.evaluate(() => (window as unknown as Window & { conversionTestEvents: unknown[] }).conversionTestEvents)).toEqual([]);
    } finally { await context.close(); }
  }
});
