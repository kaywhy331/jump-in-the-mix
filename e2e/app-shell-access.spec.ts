import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";

// JITM-UXB-03 (design audit E-08, E-09, E-17, A-13, A-20): the signed-in app works by keyboard, screen reader and touch
// as the public site does. Skip link and focus after a page change: JITM-10 §2.9 and §2.23. A disabled action's visible
// reason: JITM-08 §2.6. Hover gating and shortcut badges: JITM-06 §2.36.

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(240_000);

/** The one condition every :hover rule sits under (JITM-06 §2.36), as the CSSOM serializes it. */
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";
const enlargedText = "html { font-size: 200% !important; }";
const REASON = "Type or speak something to continue.";
const token = randomUUID();
let userId = "", workspaceId = "";

test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `app-shell-${suffix}@example.invalid`, name: "Shell fixture owner", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Shell fixture", slug: `app-shell-${suffix}`, members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  // Journey draws its map, with the zoom controls, for a Mix with a Beat.
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Welcome", status: "ACTIVE", triggerMode: "MANUAL_START" } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Welcome call", channel: "PHONE_CALL", versions: { create: { version: 1, script: "Fixture only" } } }, include: { versions: true } });
  await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 0 } });
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

const sessionCookie = () => ({ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" as const });
test.beforeEach(async ({ context }) => { await context.addCookies([sessionCookie()]); });

/** The account check has revealed the page and its content has replaced the loading screen, so focus can enter it. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
  await expect(page.locator("#workspace-main h1", { hasText: /^Loading/ })).toHaveCount(0, { timeout: 60_000 });
}

/** A phone or tablet: no hover and a coarse pointer, whatever its width. */
async function touchScreen(browser: Browser, baseURL: string | undefined, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ baseURL, viewport, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await context.addCookies([sessionCookie()]);
  return { context, page: await context.newPage() };
}

/**
 * Holds :hover on the first element matching the selector, as a touch browser leaves it after a tap (a synthetic tap here
 * does not). Whether its hover styles then apply is up to the stylesheet's gating.
 */
async function holdHover(page: Page, selector: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover"] });
  expect(await page.locator(selector).first().evaluate(element => element.matches(":hover")), `${selector} holds :hover`).toBe(true);
}
const BEAT_OPTIONS = ".mix-beat-options > summary", ZOOM_IN = 'button[aria-label="Zoom in"]';
const lookOf = (page: Page, selector: string) => page.locator(selector).first().evaluate(element => { const style = getComputedStyle(element); return [style.backgroundColor, style.transform, style.boxShadow].join(" | "); });

/** The page's own H1: a loading screen's H1 hands focus on to it. */
const pageHeading = (page: Page) => page.locator("#workspace-main h1:visible");

async function expectHeadingFocused(page: Page, label: string) {
  const heading = pageHeading(page);
  await expect(heading, `${label}: the new page's H1 has focus`).toBeFocused();
  await expect(heading, `${label}: the loading screen handed focus on`).not.toHaveText(/^Loading/);
  // A programmatic target: it never becomes a Tab stop of its own.
  await expect(heading).toHaveAttribute("tabindex", "-1");
}

const scrollTop = (page: Page) => page.evaluate(() => Math.round(Math.max(scrollY, document.getElementById("workspace-main")?.scrollTop ?? 0)));

test("the first Tab stop on every app page is Skip to content, and it lands on the workspace main (E-08)", async ({ page }, testInfo) => {
  const phone = testInfo.project.name === "mobile-chromium";
  const routes = ["/jumps", "/contacts", "/mixes", "/journey", "/calendar", "/more"];
  // Both sides of every layout boundary the shell has (JITM-07 §2.1), then every section at the desktop width.
  const cases = phone ? routes.map(path => ({ path, width: 0 })) : [...[320, 390, 767, 768, 900, 901, 1279, 1280, 1440, 1920].map(width => ({ path: "/jumps", width })), ...routes.map(path => ({ path, width: 1280 }))];
  for (const { path, width } of cases) {
    if (width) await page.setViewportSize({ width, height: 844 });
    const label = `${path} at ${page.viewportSize()!.width}px`;
    await open(page, path);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content", exact: true });
    await expect(skip, label).toBeFocused();
    await expect(skip).toHaveAttribute("href", "#workspace-main");
    await expect.poll(async () => { const box = await skip.boundingBox(); return Boolean(box && box.y >= 0 && box.x >= 0 && box.x + box.width <= page.viewportSize()!.width); }, `${label}: the focused skip link is on screen`).toBe(true);
    await page.keyboard.press("Enter");
    const main = page.locator("main#workspace-main");
    await expect(main, `${label}: Enter moves focus to the workspace main`).toBeFocused();
    await expect(main).toHaveAttribute("tabindex", "-1");
    // No #workspace-main history entry, which would reload the page behind its loading screen.
    expect(new URL(page.url()).hash, label).toBe("");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("#workspace-main"))), `${label}: the next Tab stays in the page`).toBe(true);
  }
  // Readable in both themes and at 200% text, at the narrowest width.
  if (!phone) await page.setViewportSize({ width: 320, height: 844 });
  await open(page, "/jumps");
  await page.addStyleTag({ content: enlargedText });
  for (const scheme of ["light", "dark"] as const) {
    await applyRenderedTheme(page, scheme);
    await page.locator("body").focus();
    const skip = page.getByRole("link", { name: "Skip to content", exact: true });
    await skip.focus();
    // It slides in from above the page once focused.
    await expect.poll(async () => { const box = await skip.boundingBox(); return Boolean(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= page.viewportSize()!.width); }, `${scheme} at 200% text: on screen`).toBe(true);
    expect((await axeInPage(page).include(".public-skip-link").withRules(["color-contrast"]).analyze()).violations, `${scheme} skip link contrast`).toEqual([]);
  }
});

test("after a page change in the app, focus moves to the new page's H1 without scrolling (A-20, F-10)", async ({ page }, testInfo) => {
  const phone = testInfo.project.name === "mobile-chromium";
  const nav = page.locator(phone ? ".mobile-nav" : ".sidebar").getByRole("navigation", { name: "Primary navigation" });
  await open(page, "/jumps");

  // The keyboard: a navigation link, then Enter.
  await nav.getByRole("link", { name: "Contacts", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/contacts$/);
  await expectHeadingFocused(page, "Contacts by keyboard");
  expect(await scrollTop(page), "no scroll on arrival").toBe(0);
  // The next Tab continues from the H1, inside the new page.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest("#workspace-main")))).toBe(true);

  // A query change on the same page is not a new page: the search field keeps the owner's typing.
  const search = page.getByRole("searchbox", { name: "Search contacts" });
  await search.click();
  await page.keyboard.type("Nobody");
  await expect(page).toHaveURL(/[?&]q=Nobody/);
  await expect(search).toBeFocused();

  // The pointer, onto a section with a loading screen, whose H1 hands focus on to the page's own.
  await nav.getByRole("link", { name: "Mixes", exact: true }).click();
  await expect(page).toHaveURL(/\/mixes$/);
  await expectHeadingFocused(page, "Mixes by pointer");
  expect(await scrollTop(page)).toBe(0);

  // Journey keeps its H1 in the people pane, which a phone hides behind the map: focus falls back to the workspace main.
  if (phone) {
    await open(page, "/more");
    await page.locator("#workspace-main").getByRole("link", { name: /^Journey/ }).click();
    await expect(page).toHaveURL(/\/journey$/);
    await expect(page.locator("main#workspace-main"), "Journey on a phone: the workspace main has focus").toBeFocused();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("#workspace-main"))), "the next Tab starts in Journey").toBe(true);
  }

  // A server action that saves and lands on another page (F-10): the new contact's profile.
  await open(page, "/contacts/new");
  await page.getByLabel("First name", { exact: true }).fill("Focus");
  await page.locator("#lastName").fill(`Arrival ${randomUUID().slice(0, 8)}`);
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts\/[^/?]+\?created=1/);
  await expectHeadingFocused(page, "a saved contact");

  // History back is a page change too. The form would focus First name itself; a page change still lands on the H1.
  await page.goBack();
  await expect(page).toHaveURL(/\/contacts\/new$/);
  await expectHeadingFocused(page, "back to the new-contact form");

  // On a short screen, a scrolled page that is left and returned to keeps its place; focus does not scroll it.
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 480 });
  await open(page, "/more");
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  const before = await scrollTop(page);
  expect(before, "More scrolls on a 480 px screen").toBeGreaterThan(0);
  await page.locator("#workspace-main").getByRole("link", { name: /^Help/ }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expectHeadingFocused(page, "a More destination");
  await page.goBack();
  await expect(page).toHaveURL(/\/more$/);
  await expectHeadingFocused(page, "back to More");
  await expect.poll(() => scrollTop(page), "the returned page keeps its place").toBe(before);
});

test("Quick Add's Continue says why it waits, in visible text tied to the button (E-09)", async ({ page }) => {
  await open(page, "/jumps");
  await page.getByRole("button", { name: "Quick Add", exact: true }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Quick Add", exact: true });
  const capture = dialog.getByRole("textbox", { name: "What do you want to remember?" });
  const proceed = dialog.getByRole("button", { name: "Continue", exact: true });
  const reason = dialog.getByText(REASON, { exact: true });
  await expect(proceed).toBeDisabled();
  await expect(reason).toBeVisible();
  await expect(proceed).toHaveAccessibleDescription(REASON);
  // Beside the button, not only in a hover title.
  await expect(proceed).not.toHaveAttribute("title", /.+/);
  const [reasonBox, buttonBox] = [(await reason.boundingBox())!, (await proceed.boundingBox())!];
  expect(buttonBox.y - (reasonBox.y + reasonBox.height), "the reason sits just above Continue").toBeLessThan(buttonBox.height);

  await capture.fill("Call Casey Friday about the estimate");
  await expect(proceed).toBeEnabled();
  await expect(reason).toHaveCount(0);
  await expect(proceed).not.toHaveAttribute("aria-describedby", /.+/);
  await capture.fill("   ");
  await expect(proceed).toBeDisabled();
  await expect(reason).toBeVisible();

  // Both themes and 200% text: readable, in view and without sideways scrolling.
  for (const enlarged of [false, true]) {
    if (enlarged) await page.addStyleTag({ content: enlargedText });
    for (const scheme of ["light", "dark"] as const) {
      await applyRenderedTheme(page, scheme);
      await reason.scrollIntoViewIfNeeded();
      await expect(reason).toBeInViewport();
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${scheme}${enlarged ? " at 200%" : ""}: no sideways scroll`).toBe(true);
      expect((await axeInPage(page).include(".quick-add-dialog").withRules(["color-contrast", "aria-valid-attr-value"]).analyze()).violations, `${scheme}${enlarged ? " at 200%" : ""}`).toEqual([]);
    }
  }
});

/**
 * Every :hover rule in the document's sheets (or one <style>'s) and whether the hovering fine-pointer query gates it;
 * `active` counts the ungated :active press states. Runs in the page.
 */
function scanSheets([query, index]: [string, number | null]) {
  const sheets = index === null ? [...document.styleSheets] : [document.querySelector<HTMLStyleElement>(`style[data-index="${index}"]`)!.sheet!];
  const found: { selector: string; gated: boolean }[] = [];
  let active = 0;
  const walk = (rules: CSSRuleList, gated: boolean) => {
    for (const rule of [...rules]) {
      if (rule instanceof CSSMediaRule) walk(rule.cssRules, gated || rule.conditionText === query);
      else if (rule instanceof CSSStyleRule) {
        if (rule.selectorText.includes(":hover")) found.push({ selector: rule.selectorText, gated });
        else if (rule.selectorText.includes(":active") && !gated) active++;
        if (rule.cssRules.length) walk(rule.cssRules, gated);
      } else if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules, gated);
    }
  };
  for (const sheet of sheets) walk(sheet.cssRules, false);
  return { found, active };
}

test("every :hover rule in every stylesheet sits inside the hovering fine-pointer query (E-17)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Stylesheet source is the same on every project.");
  const files: string[] = [];
  const collect = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) collect(path); else if (entry.name.endsWith(".css")) files.push(path); } };
  collect("src");
  // A CSS module's :global(x) is plain x once built.
  const sources = files.map(file => ({ file, css: readFileSync(file, "utf8").replace(/:global\(([^()]*)\)/g, "$1") }));
  await page.setContent(`<!doctype html>${sources.map((_, index) => `<style data-index="${index}"></style>`).join("")}`);
  await page.evaluate(texts => texts.forEach((text, index) => { document.querySelector(`style[data-index="${index}"]`)!.textContent = text; }), sources.map(source => source.css));
  const results: { selector: string; gated: boolean }[][] = [];
  for (let index = 0; index < sources.length; index++) results.push((await page.evaluate(scanSheets, [HOVER_QUERY, index] as [string, number | null])).found);
  let total = 0;
  sources.forEach(({ file, css }, index) => {
    // Every :hover written in the file reached the CSSOM, so none hides in a rule the browser dropped.
    // Selectors only: comments and the (hover: hover) media feature itself are not :hover rules.
    const written = (css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\(\s*hover\s*:\s*[a-z]+\s*\)/g, "").match(/:hover/g) ?? []).length;
    const parsed = results[index].reduce((sum, rule) => sum + (rule.selector.match(/:hover/g) ?? []).length, 0);
    expect(parsed, `${file}: every :hover is in a parsed rule`).toBe(written);
    expect(results[index].filter(rule => !rule.gated).map(rule => rule.selector), `${file}: :hover outside ${HOVER_QUERY}`).toEqual([]);
    total += parsed;
  });
  expect(total, "the scan found the app's hover rules").toBeGreaterThan(60);
});

test("the built app's stylesheets gate hover and keep press states, and a hovering mouse still gets its hover look (E-17)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "A hovering fine pointer; touch screens are checked below.");
  for (const path of ["/jumps", "/journey"]) {
    await open(page, path);
    const { found, active } = await page.evaluate(scanSheets, [HOVER_QUERY, null] as [string, number | null]);
    expect(found.length, `${path}: hover rules loaded`).toBeGreaterThan(0);
    expect(found.filter(rule => !rule.gated).map(rule => rule.selector), `${path}: ungated hover`).toEqual([]);
    expect(active, `${path}: :active press states stay for touch`).toBeGreaterThan(0);
  }
  // The two touch cases (D-09) still answer a mouse: Beat options at 390 and Journey's Zoom in at 768.
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/mixes/new?custom=1");
  const restingOptions = await lookOf(page, BEAT_OPTIONS);
  await holdHover(page, BEAT_OPTIONS);
  expect(await lookOf(page, BEAT_OPTIONS), "Beat options hovered by a mouse").not.toBe(restingOptions);
  await page.setViewportSize({ width: 768, height: 1024 });
  await open(page, "/journey");
  await page.mouse.move(0, 0);
  const resting = await lookOf(page, ZOOM_IN);
  await page.locator(ZOOM_IN).hover();
  await expect.poll(() => lookOf(page, ZOOM_IN), "a mouse over Zoom in changes its look").not.toBe(resting);
  // The N badge shows where a keyboard and a mouse are the input, on the compact rail too.
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".sidebar .global-quick-add kbd"), `${width}px`).toBeVisible();
  }
});

test("on a touch screen a tap leaves no hover look, and the N badge is hidden at every width (E-17, A-13)", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Touch screens are made explicitly, once.");
  // The Mix editor's Beat options at 390 (D-09).
  const phone = await touchScreen(browser, baseURL, { width: 390, height: 844 });
  try {
    await open(phone.page, "/mixes/new?custom=1");
    const options = phone.page.getByRole("group", { name: "Beat 1" }).getByLabel("Options for Beat 1", { exact: true });
    const resting = await lookOf(phone.page, BEAT_OPTIONS);
    await options.tap();
    await expect(options.locator("xpath=..")).toHaveAttribute("open", "");
    await options.tap();
    await expect(options.locator("xpath=..")).not.toHaveAttribute("open", "");
    await holdHover(phone.page, BEAT_OPTIONS);
    expect(await lookOf(phone.page, BEAT_OPTIONS), "a tapped, closed Beat options keeps its resting look").toBe(resting);
  } finally { await phone.context.close(); }

  // Journey's Zoom in at 768 (D-09).
  const tablet = await touchScreen(browser, baseURL, { width: 768, height: 1024 });
  try {
    await open(tablet.page, "/journey");
    const resting = await lookOf(tablet.page, ZOOM_IN);
    await tablet.page.getByRole("button", { name: "Zoom in", exact: true }).tap();
    await holdHover(tablet.page, ZOOM_IN);
    expect(await lookOf(tablet.page, ZOOM_IN), "a tapped Zoom in keeps its resting look").toBe(resting);
  } finally { await tablet.context.close(); }

  // The compact rail on a touch tablet (A-13), the full rail on a large touch screen and a sideways phone.
  for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    const screen = await touchScreen(browser, baseURL, viewport);
    try {
      await open(screen.page, "/jumps");
      const label = `${viewport.width}x${viewport.height}`;
      const badge = screen.page.locator(".global-quick-add kbd");
      if (await badge.count()) await expect(badge, `${label}: no N badge on a touch screen`).toBeHidden();
      // The shortcut still works from an attached keyboard, so its name stays for assistive technology.
      await expect(screen.page.getByRole("button", { name: "Quick Add", exact: true }).filter({ visible: true }).first()).toHaveAttribute("aria-keyshortcuts", "N");
    } finally { await screen.context.close(); }
  }
});
