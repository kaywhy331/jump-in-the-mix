import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PERSONAS } from "../src/lib/persona-mixes";
import { PLANS, formatDollars } from "../src/lib/plans";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";

// JITM-UXA-14 (audit M-06, P-05): the pricing page helps a decision, and every public header and
// its Explore menu reach Pricing (JITM-09 §2.83). Copy pins are recorded on the Hub task (E-56).
const RAIL_BOUNDARY = 901; // JITM-07 §2.30: section links move into Explore below the shared 901px boundary.
const publicRoutes = ["/", ...PERSONAS.map(persona => `/for/${persona.slug}`), "/pricing", "/faq", "/features/follow-up-reminders", "/follow-up-templates", "/follow-up-templates/estimate-follow-up", "/follow-up-templates/proposal-follow-up", "/contact", "/privacy", "/terms", "/security"];
const matrixRoutes = ["/", "/faq", "/privacy", "/pricing", "/follow-up-templates"];
// JITM-07 §5, both sides of each boundary, plus a sideways phone and a 600px-high laptop.
const matrix = [320, 390, 767, 768, 834, 900, 901, 1023, 1024, 1099, 1100, 1194, 1199, 1200, 1279, 1280, 1440, 1599, 1600, 1699, 1700, 1920, 2560, 3110, 3840].map(width => ({ width, height: 900 })).concat([{ width: 844, height: 390 }, { width: 1280, height: 600 }]);
const included = [
  "Today, your daily list of who to contact next, with each message prepared for you to review and send yourself.",
  "Your contacts, with notes, saved dates and import from a file.",
  "Mixes, your reusable follow-up plans, with a text, email and call version of every Beat.",
  "Mega-Mixes, named sets of connected Mixes that cover your work from first inquiry to repeat business.",
  "The Marketplace, where you find ready-made Mixes and Mega-Mixes to add.",
  "Journey, a map of how your Mixes connect and where each person is right now.",
  "Calendar, for your meetings and time blocks.",
  "Quick Add, for adding a person, a note or a follow-up from any screen, by typing or speaking.",
  "Exporting your data or deleting your account."
];
const paidLine = "Paid plans start later. There’s nothing to buy yet.";
const enlargedText = "html { font-size: 200% !important; }";
const capture = process.env.UXA14_CAPTURE === "1";
const shots = ".artifacts/uxa14/screenshots";

test.use({ screenshot: "off", video: "off", trace: "off" });

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function noHorizontalOverflow(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: horizontal overflow`).toBe(true);
}

/** Every visible header item shares one row, none overlap, and all stay inside the viewport. */
async function headerGeometry(page: Page) {
  return page.locator(".public-header").evaluate(header => {
    const items = [...header.querySelectorAll(".logo, .public-site-nav > *, .public-mobile-menu > summary")].filter(element => element.checkVisibility()).map(element => element.getBoundingClientRect());
    return {
      oneRow: items.every(a => items.every(b => a.top < b.bottom && b.top < a.bottom)),
      overlap: items.some((a, i) => items.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)),
      inside: items.every(box => box.left >= 0 && box.right <= innerWidth + 1)
    };
  });
}

async function withSession(run: (token: string) => Promise<void>) {
  const database = new URL(process.env.DATABASE_URL ?? "");
  expect(["localhost", "127.0.0.1"]).toContain(database.hostname);
  expect(database.pathname).toMatch(/^\/jitm_design_/);
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { email: `pricing-header-${suffix}@example.test`, name: "Pricing Header Owner", emailVerifiedAt: new Date() } });
  try {
    await prisma.workspace.create({ data: { ownerId: user.id, name: "Pricing header fixture", slug: `pricing-header-${suffix}`, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: true, onboardingStep: 5 } } } });
    const token = randomUUID();
    await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
    await run(token);
  } finally {
    await prisma.workspace.deleteMany({ where: { ownerId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
}

test("the pricing page puts its one action in the Free card and says paid plans start later", async ({ page }, testInfo) => {
  const phone = testInfo.project.name === "mobile-chromium";
  const viewport = phone ? { width: 375, height: 812 } : { width: 1440, height: 900 };
  for (const scheme of ["light", "dark"] as const) {
    const label = `${scheme} ${viewport.width}px`;
    await page.setViewportSize(viewport);
    await page.goto("/pricing");
    await applyRenderedTheme(page, scheme);
    const main = page.getByRole("main");
    const cards = main.locator(".pricing-card");
    // Prices and limits come from Kevin's plans and stay unchanged.
    await expect(cards.locator("h2")).toHaveText(PLANS.map(plan => plan.name));
    await expect(cards.locator(".pricing-price")).toHaveText(PLANS.map(plan => `${formatDollars(plan.monthlyCents)}${plan.monthlyCents ? " a month" : ""}`));
    await expect(cards.locator(".pricing-yearly")).toHaveText(PLANS.map(plan => plan.yearlyCents ? `or ${formatDollars(plan.yearlyCents)} a year` : "No card needed"));
    for (const [index, plan] of PLANS.entries()) await expect(cards.nth(index).locator(".pricing-limits li")).toHaveText([`Up to ${plan.people.toLocaleString("en-US")} people with follow-ups`, `Up to ${plan.activeMixes} active Mixes`]);
    // The Free card carries the page's one action; Plus and Pro offer nothing to buy.
    const free = cards.filter({ has: page.getByRole("heading", { name: "Free", exact: true }) });
    const join = free.getByRole("link", { name: "Join the waitlist", exact: true });
    await expect(free.locator(".pricing-card-action p")).toHaveText("Free during the beta.");
    await expect(join).toHaveAttribute("href", "/waitlist");
    await expect(join).toHaveClass(/\bprimary\b/);
    await expect(main.getByRole("link", { name: "Join the waitlist", exact: true })).toHaveCount(1);
    await expect(main.locator(".button.primary")).toHaveCount(1);
    for (const name of ["Plus", "Pro"]) {
      const card = cards.filter({ has: page.getByRole("heading", { name, exact: true }) });
      await expect(card.locator(".pricing-card-action")).toHaveText(paidLine);
      await expect(card.getByRole("link")).toHaveCount(0);
      await expect(card.getByRole("button")).toHaveCount(0);
    }
    await expect(main.getByRole("link", { name: /buy|subscribe|upgrade|checkout|choose|trial/i })).toHaveCount(0);
    await expect(main.getByRole("button", { name: /buy|subscribe|upgrade|checkout|choose|trial/i })).toHaveCount(0);
    expect(await main.innerText(), `${label}: invented urgency`).not.toMatch(/\b(hurry|limited time|last chance|act now|discount|free trial|offer ends|spots? left)\b/i);
    // Every product word in the list carries its plain meaning.
    await expect(main.locator("#pricing-included + ul > li")).toHaveText(included);
    await expect(main.getByRole("link", { name: "Questions about access and your data", exact: true })).toHaveAttribute("href", "/faq");
    if (!phone) {
      // One row of cards: the Free action and the paid plans' line end level.
      const bottoms = await cards.locator(".pricing-card-action").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().bottom));
      expect(Math.max(...bottoms) - Math.min(...bottoms), `${label}: card actions level`).toBeLessThanOrEqual(1);
    }
    // Keyboard: the first stop inside main is the Free card's action, with a visible focus ring.
    await main.focus();
    await page.keyboard.press("Tab");
    await expect(join).toBeFocused();
    expect(await join.evaluate(element => getComputedStyle(element).outlineStyle), `${label}: focus ring`).not.toBe("none");
    expect((await join.boundingBox())!.height, `${label}: target`).toBeGreaterThanOrEqual(44);
    await noHorizontalOverflow(page, label);
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations, label).toEqual([]);
    if (capture) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: `${shots}/pricing-${scheme}-${viewport.width}.png`, fullPage: true }); }
    // 200% text: nothing scrolls sideways and the action and the paid line stay whole.
    await page.addStyleTag({ content: enlargedText });
    await settle(page);
    await noHorizontalOverflow(page, `${label} 200% text`);
    await join.scrollIntoViewIfNeeded();
    await expect(join).toBeInViewport();
    for (const element of await cards.locator(".pricing-card-action > *").all()) {
      expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth + 1 && node.getBoundingClientRect().right <= innerWidth + 1), `${label} 200% text: card action clipped`).toBe(true);
    }
    if (capture) await page.screenshot({ path: `${shots}/pricing-${scheme}-${viewport.width}-200pct.png`, fullPage: true });
  }
});

test("every public header and its Explore menu reach Pricing", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const phone = testInfo.project.name === "mobile-chromium";
  await page.setViewportSize(phone ? { width: 375, height: 812 } : { width: 1440, height: 900 });
  for (const route of publicRoutes) {
    await test.step(`${route} ${phone ? 375 : 1440}px`, async () => {
      await page.goto(route);
      const header = page.locator(".public-header");
      const summary = header.locator(".public-mobile-menu > summary");
      if (phone) {
        await summary.focus();
        await page.keyboard.press("Enter");
        const menu = header.getByRole("navigation", { name: "Explore the app" });
        const link = menu.getByRole("link", { name: "Pricing", exact: true });
        await expect(link).toBeInViewport();
        await expect(link).toHaveAttribute("href", "/pricing");
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        if (route === "/pricing") await expect(link).toHaveAttribute("aria-current", "page");
        else await expect(link).not.toHaveAttribute("aria-current");
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(summary).toBeFocused();
      } else {
        const link = header.getByRole("navigation", { name: "Public navigation" }).getByRole("link", { name: "Pricing", exact: true });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("href", "/pricing");
        await expect(summary).toBeHidden();
        if (route === "/pricing") await expect(link).toHaveAttribute("aria-current", "page");
        else await expect(link).not.toHaveAttribute("aria-current");
        await link.focus();
        await expect(link).toBeFocused();
        expect(await link.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
      }
      await noHorizontalOverflow(page, route);
    });
  }
  // Following the link lands on the pricing page from another page.
  await page.goto("/faq");
  const header = page.locator(".public-header");
  if (phone) {
    await header.locator(".public-mobile-menu > summary").click();
    await Promise.all([page.waitForURL(/\/pricing$/), header.getByRole("navigation", { name: "Explore the app" }).getByRole("link", { name: "Pricing", exact: true }).click()]);
  } else {
    await Promise.all([page.waitForURL(/\/pricing$/), header.getByRole("navigation", { name: "Public navigation" }).getByRole("link", { name: "Pricing", exact: true }).click()]);
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plans and pricing");
  // The current-page cue in the open menu and the inline header passes axe in both themes.
  for (const scheme of ["light", "dark"] as const) {
    await page.goto("/pricing");
    await applyRenderedTheme(page, scheme);
    if (phone) await header.locator(".public-mobile-menu > summary").click();
    expect((await axeInPage(page).include(".public-header").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations, `${scheme} header`).toEqual([]);
    if (capture) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: `${shots}/header-${scheme}-${phone ? 375 : 1440}${phone ? "-explore" : ""}.png` }); }
  }
});

test("Pricing stays reachable in a one-row header across the size matrix, signed in and out", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  test.setTimeout(300_000);
  await withSession(async token => {
    for (const signedIn of [false, true]) {
      if (signedIn) await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL ?? process.env.PLAYWRIGHT_BASE_URL!, httpOnly: true, sameSite: "Lax" }]);
      for (const route of matrixRoutes) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(route);
        const header = page.locator(".public-header");
        await expect(header.getByRole("link", { name: signedIn ? "Open Today" : "Sign in", exact: true }).first()).toBeAttached();
        const inline = header.getByRole("navigation", { name: "Public navigation" }).getByRole("link", { name: "Pricing", exact: true });
        const explore = header.locator(".public-mobile-menu > summary");
        const inMenu = header.getByRole("navigation", { name: "Explore the app", includeHidden: true }).getByRole("link", { name: "Pricing", exact: true, includeHidden: true });
        for (const size of matrix) {
          const label = `${route} ${signedIn ? "signed in" : "signed out"} ${size.width}x${size.height}`;
          await page.setViewportSize(size);
          await settle(page);
          const geometry = await headerGeometry(page);
          expect(geometry.oneRow, `${label}: one header row`).toBe(true);
          expect(geometry.overlap, `${label}: header items overlap`).toBe(false);
          expect(geometry.inside, `${label}: header item outside the viewport`).toBe(true);
          await noHorizontalOverflow(page, label);
          await expect(inMenu, label).toHaveCount(1);
          if (size.width < RAIL_BOUNDARY) {
            await expect(inline, label).toBeHidden();
            await expect(explore, label).toBeVisible();
          } else {
            await expect(inline, label).toBeVisible();
            await expect(explore, label).toBeHidden();
          }
        }
        // 200% text: the header may wrap, but its items stay inside the viewport and Pricing stays reachable.
        // Whole-page overflow is checked on /pricing only: article H1s overflow at 320px with 200% text on
        // main before this change (public typography, JITM-UXB-01), which is outside this slice.
        await page.addStyleTag({ content: enlargedText });
        for (const width of [320, 375, 900, 901, 1024, 1440]) {
          const label = `${route} ${signedIn ? "signed in" : "signed out"} ${width}px 200% text`;
          await page.setViewportSize({ width, height: 900 });
          await settle(page);
          expect((await headerGeometry(page)).inside, `${label}: header item outside the viewport`).toBe(true);
          if (route === "/pricing") await noHorizontalOverflow(page, label);
          if (width < RAIL_BOUNDARY) {
            await expect(explore, label).toBeVisible();
            await explore.click();
            await expect(inMenu, label).toBeInViewport();
            await page.keyboard.press("Escape");
          } else {
            await expect(inline, label).toBeVisible();
            expect(await inline.evaluate(element => element.getBoundingClientRect().right <= innerWidth + 1), label).toBe(true);
          }
        }
      }
    }
  });
});
