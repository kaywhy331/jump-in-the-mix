import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PERSONAS } from "../src/lib/persona-mixes";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

const landingRoutes = ["/", ...PERSONAS.map(persona => `/for/${persona.slug}`)];
const copyRoutes = [...landingRoutes, "/pricing", "/features/follow-up-reminders"];
const documentRoutes = ["/contact", "/privacy", "/terms", "/security"];
const headerRoutes = [...copyRoutes, ...documentRoutes, "/faq", "/follow-up-templates", "/follow-up-templates/estimate-follow-up", "/follow-up-templates/proposal-follow-up"];
const definitions = "A Mix is a reusable follow-up plan. Each Beat is one planned text, email or call in a Mix. Today is your daily list of follow-ups and other items that need you.";
const themes = ["light", "dark"] as const;
const widths = [320, 375, 390, 599, 600, 601, 760, 761, 767, 768, 834, 900, 901, 999, 1000, 1001, 1099, 1100, 1194, 1199, 1200, 1279, 1280, 1440, 1599, 1600, 1699, 1700, 1920, 2560, 3840];

test.use({ screenshot: "off", video: "off", trace: "off" });

for (const theme of themes) {
  test(`public headers keep returning-member access and waitlist in ${theme}`, async ({ page, context }, testInfo) => {
    const database = new URL(process.env.DATABASE_URL ?? "");
    expect(["localhost", "127.0.0.1"]).toContain(database.hostname);
    expect(database.pathname).toMatch(/^\/jitm_design_/);
    const width = testInfo.project.name === "mobile-chromium" ? 375 : 1440;
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(value => localStorage.setItem("jitm-appearance", value), theme);
    const suffix = randomUUID();
    const user = await prisma.user.create({ data: { email: `public-header-${suffix}@example.test`, name: "Public Header Owner", emailVerifiedAt: new Date() } });
    try {
      await prisma.workspace.create({ data: { ownerId: user.id, name: "Public header fixture", slug: `header-${suffix}`, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: true, onboardingStep: 5 } } } });
      const token = randomUUID();
      await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
      for (const signedIn of [false, true]) {
        if (signedIn) await context.addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL!, httpOnly: true, sameSite: "Lax" }]);
        for (const route of headerRoutes) {
          await test.step(`${route} ${signedIn ? "signed in" : "signed out"} ${width}`, async () => {
            await page.goto(route);
            const header = page.locator(".public-header");
            await expect(header.getByRole("link", { name: "Join the waitlist", exact: true })).toBeVisible();
            const menu = header.locator(".public-mobile-menu > summary");
            // Use the native summary's keyboard path in desktop and touch Chromium.
            if (width === 375) { await menu.focus(); await page.keyboard.press("Enter"); }
            const nav = width === 375 ? header.getByRole("navigation", { name: "Explore the app" }) : header.getByRole("navigation", { name: "Public navigation" });
            const link = nav.getByRole("link", { name: signedIn ? "Open Today" : "Sign in", exact: true });
            await expect(link).toBeVisible();
            await expect(link).toHaveAttribute("href", signedIn ? "/jumps" : "/login");
            await page.keyboard.press("Tab");
            await link.focus();
            await expect(link).toBeFocused();
            expect(await link.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
            if (width === 375) {
              const bounds = (await link.boundingBox())!;
              expect(bounds.height).toBeGreaterThanOrEqual(44);
              await page.keyboard.press("Escape");
              await expect(nav).not.toBeVisible();
              await expect(menu).toBeFocused();
            }
            if (route === "/") {
              if (width === 375) await menu.click();
              await link.click();
              await expect(page).toHaveURL(new RegExp(signedIn ? "/jumps$" : "/login$"));
            }
          });
        }
      }
    } finally {
      await prisma.workspace.deleteMany({ where: { ownerId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  for (const route of [...copyRoutes, ...documentRoutes]) {
    test(`public copy and headers reflow in ${theme} on ${route}`, async ({ page }, testInfo) => {
      await page.addInitScript(value => localStorage.setItem("jitm-appearance", value), theme);
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      if (route === "/features/follow-up-reminders") await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible();
      if (landingRoutes.includes(route)) await expect(page.locator(".product-demo")).toHaveAttribute("aria-busy", "false");
      const main = page.getByRole("main");
      const firstUses = await main.evaluate(element => {
        const text = (element as HTMLElement).innerText.replaceAll("Jump in the Mix", "the app");
        return Object.fromEntries(["Mix", "Beat", "Today"].map(term => {
          const match = new RegExp(`\\b${term}s?\\b`).exec(text);
          return [term, match ? text.slice(match.index, match.index + 180) : ""];
        }));
      });
      if (route === "/features/follow-up-reminders") {
        expect(firstUses.Mix).toMatch(/^Mix, your reusable follow-up plan/);
        expect(firstUses.Beat).toMatch(/^Beat: one scheduled message or call step inside a Mix/);
        expect(firstUses.Today).toMatch(/^Today list, the daily list of what needs you/);
      } else if (copyRoutes.includes(route)) {
        await expect(main.getByText(definitions, { exact: true })).toBeVisible();
        expect(firstUses.Mix).toMatch(/^Mix is a reusable follow-up plan/);
        expect(firstUses.Beat).toMatch(/^Beat is one planned text, email or call in a Mix/);
        expect(firstUses.Today).toMatch(/^Today is your daily list of follow-ups and other items that need you/);
      }
      const paragraphs = main.locator("p").filter({ hasText: /A Mix is a reusable follow-up plan|A follow-up reminder in Jump in the Mix|Your Today list, the daily list/ });
      const sizes = testInfo.project.name === "desktop-chromium"
        ? [...widths.map(width => [width, 900]), [844, 390], [1280, 600]]
        : [[375, 812], [320, 568], [390, 844]];
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} ${width}x${height}`).toBe(true);
        const headerLinks = page.locator(".public-header a:visible");
        for (const link of await headerLinks.all()) {
          expect(await link.evaluate(element => {
            const box = element.getBoundingClientRect();
            return box.left >= 0 && box.right <= innerWidth + 1;
          })).toBe(true);
        }
        for (const paragraph of await paragraphs.all()) {
          expect(await paragraph.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return bounds.width > 0 && bounds.left >= 0 && bounds.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1;
          })).toBe(true);
        }
        if (process.env.UXA05_CAPTURE === "1") {
          const folder = ".artifacts/uxa05/screenshots";
          await mkdir(folder, { recursive: true });
          await page.screenshot({ path: `${folder}/${route.replaceAll("/", "_") || "home"}-${theme}-${width}x${height}-${testInfo.project.name}.png` });
        }
      }
      await page.setViewportSize({ width: 375, height: 812 });
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      for (const paragraph of await paragraphs.all()) {
        await paragraph.scrollIntoViewIfNeeded();
        await expect(paragraph).toBeVisible();
        expect(await paragraph.evaluate(element => element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1)).toBe(true);
      }
      if (process.env.UXA05_CAPTURE === "1") await page.screenshot({ path: `.artifacts/uxa05/screenshots/${route.replaceAll("/", "_") || "home"}-${theme}-200pct-${testInfo.project.name}.png` });
      expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    });
  }
}
