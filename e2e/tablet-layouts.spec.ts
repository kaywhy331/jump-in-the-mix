import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";

// JITM-UXA-11 (audit T-01, T-02, A-02): tablet layouts get room of their own.
// Boundaries come from JITM-07 §2.1; the Today queue widths are §2.15's and stay unchanged.
const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";
const RAIL_BOUNDARY = 901;
const tablets = [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }];
const enlargedText = "html { font-size: 200% !important; }";

test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(240_000);

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function noHorizontalOverflow(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: horizontal overflow`).toBe(true);
}

/** Every visible header item shares one row, and none of them overlap. */
async function publicHeaderGeometry(page: Page) {
  return page.locator(".public-header").evaluate(header => {
    const items = [...header.querySelectorAll(".logo, .public-site-nav > *, .public-mobile-menu > summary")].filter(element => element.checkVisibility()).map(element => element.getBoundingClientRect());
    const oneRow = items.every(a => items.every(b => a.top < b.bottom && b.top < a.bottom));
    const overlap = items.some((a, i) => items.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
    return { oneRow, overlap, count: items.length };
  });
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
  await Promise.all([page.waitForURL(/\/(jumps|onboarding)(\?|$)/), page.getByRole("button", { name: "Sign in" }).click()]);
}

test("public headers keep one row on tablets, with section links in Explore below the rail boundary", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  const database = new URL(process.env.DATABASE_URL ?? "");
  expect(["localhost", "127.0.0.1"]).toContain(database.hostname);
  expect(database.pathname).toMatch(/^\/jitm_design_/);
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { email: `tablet-header-${suffix}@example.test`, name: "Tablet Header Owner", emailVerifiedAt: new Date() } });
  try {
    await prisma.workspace.create({ data: { ownerId: user.id, name: "Tablet header fixture", slug: `tablet-header-${suffix}`, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: true, onboardingStep: 5 } } } });
    const token = randomUUID();
    await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
    const widths = [768, 834, 900, RAIL_BOUNDARY, 1024, 1279];
    // The signed-in "Open Today" label is the longest header; the FAQ and Privacy headers wrapped at 768 before this change.
    for (const signedIn of [false, true]) {
      if (signedIn) await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL ?? process.env.PLAYWRIGHT_BASE_URL!, httpOnly: true, sameSite: "Lax" }]);
      for (const route of ["/", "/faq", "/privacy"]) {
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.goto(route);
        for (const width of widths) {
          const label = `${route} ${signedIn ? "signed in" : "signed out"} ${width}px`;
          await page.setViewportSize({ width, height: 900 });
          await settle(page);
          const geometry = await publicHeaderGeometry(page);
          expect(geometry.oneRow, `${label}: one header row`).toBe(true);
          expect(geometry.overlap, `${label}: header items overlap`).toBe(false);
          await noHorizontalOverflow(page, label);
          const header = page.locator(".public-header");
          const inline = header.getByRole("navigation", { name: "Public navigation" }).locator(".public-section-link");
          const explore = header.locator(".public-mobile-menu > summary");
          await expect(header.getByRole("link", { name: "Join the waitlist", exact: true })).toBeVisible();
          if (width < RAIL_BOUNDARY) {
            await expect(inline.first()).toBeHidden();
            await expect(explore).toBeVisible();
          } else {
            await expect(inline.first()).toBeVisible();
            await expect(explore).toBeHidden();
          }
        }
      }
    }
  } finally {
    await prisma.workspace.deleteMany({ where: { ownerId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("the tablet Explore menu opens from the keyboard, lists the section links and passes axe in both themes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  for (const scheme of ["light", "dark"] as const) {
    for (const width of [768, 900]) {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto("/faq");
      await applyRenderedTheme(page, scheme);
      const header = page.locator(".public-header");
      const summary = header.locator(".public-mobile-menu > summary");
      const box = (await summary.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await summary.focus();
      await page.keyboard.press("Enter");
      const menu = header.getByRole("navigation", { name: "Explore the app" });
      await expect(menu.getByRole("link", { name: "Try the demo", exact: true })).toBeInViewport();
      await expect(menu.getByRole("link", { name: "Templates", exact: true })).toBeVisible();
      for (const link of await menu.getByRole("link").all()) expect((await link.boundingBox())!.height, `${scheme} ${width}px menu target`).toBeGreaterThanOrEqual(44);
      expect((await axeInPage(page).include(".public-header").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations, `${scheme} ${width}px`).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(summary).toBeFocused();
    }
  }
});

test("Today, Contacts and Mixes give tablet and desktop lists room without changing the Today queue", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  await signIn(page);
  for (const viewport of tablets) {
    for (const scale of ["normal", "200%"] as const) {
      const label = `${viewport.width}x${viewport.height} ${scale} text`;
      await page.setViewportSize(viewport);
      await page.goto("/jumps", { waitUntil: "networkidle" });
      // Today streams in after load; measure the settled queue header, not the loading state.
      await expect(page.locator(".today-page-header p").first()).toContainText("your attention");
      await expect(page.locator(".today-page-header .today-header-tools")).toBeVisible();
      if (scale === "200%") await page.addStyleTag({ content: enlargedText });
      await settle(page);
      const today = await page.locator(".today-page").evaluate(element => {
        const box = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
        const subtitle = element.querySelector(".today-page-header p")!;
        const style = getComputedStyle(subtitle);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
        const h1 = box(".today-page-header h1"), tools = box(".today-header-tools"), text = subtitle.getBoundingClientRect();
        return {
          boxes: JSON.stringify({ h1, tools, text }),
          queue: parseFloat(getComputedStyle(element).gridTemplateColumns),
          header: box(".today-page-header").width,
          subtitleWidth: text.width,
          subtitleLines: Math.round(text.height / lineHeight),
          toolsBesideTitle: tools.top < h1.bottom && h1.top < tools.bottom && tools.bottom <= text.top,
          toolsClear: h1.right <= tools.left,
        };
      });
      // JITM-07 §2.15: 300px from 768 to 900 and clamp(300px, 26vw, 440px) above; owner input is needed before it widens.
      const expectedQueue = viewport.width <= 900 ? 300 : Math.min(Math.max(300, viewport.width * 0.26), 440);
      expect(Math.abs(today.queue - expectedQueue), `${label}: Today queue`).toBeLessThan(1);
      expect(Math.abs(today.subtitleWidth - today.header), `${label}: the attention line spans the queue`).toBeLessThan(1);
      expect(today.toolsBesideTitle, `${label}: Search and Filter sit on the title row ${today.boxes}`).toBe(true);
      expect(today.toolsClear, `${label}: the title and tools do not collide ${today.boxes}`).toBe(true);
      if (scale === "normal") expect(today.subtitleLines, `${label}: Today subtitle lines`).toBeLessThanOrEqual(2);
      await noHorizontalOverflow(page, `Today ${label}`);
    }

    await page.goto("/contacts");
    const directory = page.locator(".contacts-directory");
    await expect(directory.locator(".contact-row-summary").first()).toBeVisible();
    const contacts = await directory.evaluate(element => ({ width: element.getBoundingClientRect().width, text: element.querySelector(".contact-row-summary")!.getBoundingClientRect().width }));
    if (viewport.width < 1200) expect(contacts.text, `${viewport.width}px Contacts row text`).toBeGreaterThanOrEqual(320);
    else expect(contacts.width, `${viewport.width}px Contacts directory`).toBeGreaterThanOrEqual(360);
    await noHorizontalOverflow(page, `Contacts ${viewport.width}px`);

    await page.goto("/mixes");
    const item = page.locator(".mix-library-directory .mix-library-item").first();
    await expect(item).toBeVisible();
    const mixes = await item.evaluate(element => {
      const style = getComputedStyle(element);
      const icon = element.querySelector(".mix-row-icon")?.getBoundingClientRect().width ?? 0;
      return {
        directory: element.closest(".mix-library-directory")!.getBoundingClientRect().width,
        text: element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - icon - (parseFloat(style.columnGap) || 0),
      };
    });
    if (viewport.width < 1200) expect(mixes.text, `${viewport.width}px Mix row text`).toBeGreaterThanOrEqual(320);
    else expect(mixes.directory, `${viewport.width}px Mixes directory`).toBeGreaterThanOrEqual(360);
    await noHorizontalOverflow(page, `Mixes ${viewport.width}px`);
  }
});

test("320px phones keep the Explore menu and reflow without sideways scrolling", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  await page.setViewportSize({ width: 320, height: 640 });
  for (const route of ["/", "/faq", "/privacy"]) {
    await page.goto(route);
    await expect(page.locator(".public-header .public-mobile-menu > summary")).toBeVisible();
    await expect(page.locator(".public-site-nav .public-section-link").first()).toBeHidden();
    await noHorizontalOverflow(page, `${route} 320px`);
  }
  await signIn(page);
  for (const scale of ["normal", "200%"] as const) {
    await page.goto("/jumps");
    await expect(page.locator(".today-page-header h1")).toBeVisible();
    if (scale === "200%") await page.addStyleTag({ content: enlargedText });
    await settle(page);
    await noHorizontalOverflow(page, `Today 320px ${scale} text`);
  }
});
