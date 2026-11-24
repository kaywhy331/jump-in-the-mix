import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { installMegaMix } from "../src/lib/mega-mix-service";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";
import { hydrated } from "./phone-menu";

// JITM-UXB-07 (audit P-07, P-08, P-09, T-03): phone and tablet screens are designed for touch. Phone checks run in the
// touch project and wide-screen checks in the desktop project, so each runs once. Boundaries: JITM-07 §2.1 (768 in the
// app, 761 on public pages).
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(300_000);

const PHONES = [{ width: 375, height: 667 }, { width: 328, height: 667 }] as const;
const THEMES = ["light", "dark"] as const;
const enlargedText = "html { font-size: 200% !important; }";
const shots = ".artifacts/uxb07";
// Page-height budgets for the folded phone defaults, with the 13-Mix ready-made Contractor Mega-Mix: about 15% above
// the measured folded heights. Unfolded at 375 / 328px the pages measured Journey list 6,347 / 6,731, Mega-Mixes
// 4,481 / 4,757 and ready-made 5,540 / 6,149; pricing was 3,334 / 3,670 before its compact cards.
const BUDGET: Record<string, Record<number, number>> = {
  journey: { 375: 2_800, 328: 3_000 },
  megaMixes: { 375: 2_000, 328: 2_200 },
  readyMade: { 375: 2_450, 328: 2_600 },
  pricing: { 375: 2_850, 328: 3_150 }
};

let workspaceId = "", userId = "", activeMixId = "";
const token = randomUUID();
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `phone-touch-${randomUUID()}@example.invalid`, name: "Phone touch owner", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Phone touch details", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
  const mixes = await prisma.mix.findMany({ where: { workspaceId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  expect(mixes.length).toBeGreaterThan(10);
  activeMixId = mixes[0].id;
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

const phoneOnly = (name: string) => test.skip(name !== "mobile-chromium", "Phone checks run on the touch project.");
const wideOnly = (name: string) => test.skip(name !== "desktop-chromium", "Wide-screen checks run on the desktop project.");

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
/** Choose a phone pane once its button is hydrated (each page's first render resets the pane). */
async function choosePane(page: Page, panels: string, name: string) {
  const button = page.getByRole("navigation", { name: panels, exact: true }).getByRole("button", { name, exact: true });
  await hydrated(button);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}
async function noHorizontalOverflow(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: horizontal overflow`).toBe(true);
}
async function axeClean(page: Page, label: string) {
  expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations, label).toEqual([]);
}
/** The control is on screen, at least 44px each way, and nothing covers its centre. */
async function reachable(control: Locator, label: string) {
  await control.scrollIntoViewIfNeeded();
  const result = await control.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { width: box.width, height: box.height, inside: box.left >= -1 && box.right <= innerWidth + 1, hit: Boolean(hit && element.contains(hit)) };
  });
  expect(result.width, `${label}: width`).toBeGreaterThanOrEqual(44);
  expect(result.height, `${label}: height`).toBeGreaterThanOrEqual(44);
  expect(result.inside, `${label}: inside the screen`).toBe(true);
  expect(result.hit, `${label}: covered`).toBe(true);
}
/** The smallest gap between the drawn labels (icon and words) of neighbouring tabs in each visible tab bar. */
async function tabLabelClearance(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll(".mix-phone-panes, nav[aria-label$='workspace panels']")].filter(bar => bar.checkVisibility()).map(bar => {
    const labels = [...bar.querySelectorAll(":scope > button")].filter(tab => tab.checkVisibility()).map(tab => { const range = document.createRange(); range.selectNodeContents(tab); return range.getBoundingClientRect(); });
    const gaps = labels.slice(1).map((label, index) => label.left - labels[index].right);
    return { bar: bar.getAttribute("aria-label") ?? bar.className, tabs: labels.length, gap: gaps.length ? Math.min(...gaps) : Infinity };
  }));
}
async function pageHeight(page: Page) {
  return page.evaluate(() => document.documentElement.scrollHeight);
}
/** The first Show more names how many items it folds, and by keyboard reveals all of them with focus on the first. */
async function showMoreByKeyboard(page: Page, name: RegExp, label: string) {
  const button = page.getByRole("button", { name }).first();
  await expect(button, label).toBeVisible();
  // Pricing has two lists: hold on to this one, as the locator moves to the next button once this one goes.
  const group = await button.evaluateHandle(element => element.parentElement!);
  const hidden = () => group.evaluate(element => [...element.querySelectorAll("[data-more]")].filter(item => !item.checkVisibility()).length);
  const folded = await hidden();
  expect(folded, `${label}: folded items`).toBeGreaterThan(0);
  expect(await button.textContent(), label).toContain(String(folded));
  await reachable(button, `${label} Show more`);
  await hydrated(button);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => group.evaluate(element => element.querySelector(":scope > .show-more-button") === null), { message: `${label}: one way` }).toBe(true);
  expect(await hidden(), `${label}: revealed`).toBe(0);
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest("[data-more]"))), { message: `${label}: focus on the first revealed item` }).toBe(true);
}

test("phone Mix detail: Start is the one full-width primary, Edit and Share sit in the menu, and the pane has one tab bar", async ({ page }, testInfo) => {
  phoneOnly(testInfo.project.name);
  await mkdir(shots, { recursive: true });
  for (const theme of THEMES) for (const viewport of PHONES) {
    const label = `${theme} ${viewport.width}px`;
    await page.setViewportSize(viewport);
    await page.goto(`/mixes?mix=${activeMixId}`, { waitUntil: "networkidle" });
    await applyRenderedTheme(page, theme);
    const header = page.locator(".mix-selected-header");
    const start = header.getByRole("link", { name: /^Start .+ for someone$/ });
    const more = header.getByRole("button", { name: "More Mix actions", exact: true });
    // One filled primary, full width; Edit and Share wait in the menu; Preview is the current view, so it hides.
    await expect(start, label).toBeVisible();
    await expect(header.locator(".button.primary"), label).toHaveCount(1);
    const [startBox, navBox] = await Promise.all([start.boundingBox(), header.locator(".mix-view-actions").boundingBox()]);
    expect(Math.abs(startBox!.width - navBox!.width), `${label}: Start fills the row`).toBeLessThanOrEqual(1);
    for (const name of ["Edit", "Preview"]) await expect(header.getByRole("link", { name, exact: true }), `${label}: ${name}`).toBeHidden();
    await expect(header.getByRole("button", { name: /^Share .+ on the Marketplace$/ }), label).toBeHidden();
    // The menu button shares the title row, and Start starts below the title.
    const titleBox = (await header.locator("> div > h2").boundingBox())!, moreBox = (await more.boundingBox())!;
    expect(moreBox.y, `${label}: menu on the title row`).toBeLessThan(titleBox.y + titleBox.height);
    expect(startBox!.y, `${label}: Start below the title`).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
    await reachable(page.locator(".mix-view-more > .phone-menu-button").first(), `${label} menu button`);
    await reachable(page.locator(".mix-start-action").first(), `${label} Start`);
    // Keyboard: Enter opens, Tab reaches Edit, Escape closes and returns focus.
    await hydrated(more);
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(header.getByRole("link", { name: "Edit", exact: true })).toBeVisible();
    await reachable(page.locator(".mix-view-more .phone-menu-items > a").first(), `${label} Edit`);
    await reachable(page.locator(".mix-view-more .phone-menu-items .sheet-trigger > button").first(), `${label} Share`);
    await page.keyboard.press("Tab");
    await expect(header.getByRole("link", { name: "Edit", exact: true })).toBeFocused();
    await noHorizontalOverflow(page, `${label} menu open`);
    await axeClean(page, `${label} menu open`);
    await page.screenshot({ path: `${shots}/mix-detail-menu-${theme}-${viewport.width}.png` });
    await page.keyboard.press("Escape");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(more).toBeFocused();
    // Share opens its sheet from the menu; closing the sheet leaves the menu where it was.
    await more.click();
    await header.getByRole("button", { name: /^Share .+ on the Marketplace$/ }).click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    // A press elsewhere closes the menu.
    await header.locator("> div > h2").click();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    // Edit from the menu: Preview, the way back, shows beside Start.
    await more.click();
    await header.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(/view=edit/);
    await expect(header.getByRole("link", { name: "Preview", exact: true })).toBeVisible();
    await expect(start).toBeVisible();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await reachable(page.locator(".mix-view-actions > a[data-back-link]").first(), `${label} Preview while editing`);
    // One tab bar: the collection tabs are one selector under Mixes / Beats / Details.
    await page.goto(`/mixes?mix=${activeMixId}`, { waitUntil: "networkidle" });
    await choosePane(page, "Mix workspace panels", "Mixes");
    const collection = page.getByRole("navigation", { name: "Mix collection", exact: true });
    const selector = collection.getByRole("button", { name: "My Mixes", exact: true });
    await expect(selector).toBeVisible();
    for (const name of ["My Mixes", "Mega-Mixes", "Marketplace"]) await expect(collection.getByRole("link", { name, exact: true }), `${label}: ${name} folded`).toBeHidden();
    expect((await tabLabelClearance(page)).every(bar => bar.gap >= 8), `${label}: tab labels ${JSON.stringify(await tabLabelClearance(page))}`).toBe(true);
    await reachable(page.locator(".mix-collection-menu > .phone-menu-button").first(), `${label} collection selector`);
    await hydrated(selector);
    await selector.click();
    for (const name of ["My Mixes", "Mega-Mixes", "Marketplace"]) await expect(collection.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(collection.getByRole("link", { name: "My Mixes", exact: true })).toHaveAttribute("aria-current", "page");
    await reachable(page.locator(".mix-collection-menu .phone-menu-items > a[href='/marketplace']").first(), `${label} Marketplace choice`);
    await axeClean(page, `${label} selector open`);
    await collection.getByRole("link", { name: "Mega-Mixes", exact: true }).click();
    await expect(page).toHaveURL(/\/mixes\/mega/);
    await expect(page.getByRole("navigation", { name: "Mix collection", exact: true }).getByRole("button", { name: "Mega-Mixes", exact: true })).toBeVisible();
    // 200% text: the title row, Start and the menu still fit.
    await page.goto(`/mixes?mix=${activeMixId}`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: enlargedText });
    await settle(page);
    await noHorizontalOverflow(page, `${label} 200% text`);
    await reachable(page.locator(".mix-start-action").first(), `${label} 200% text Start`);
    await reachable(page.locator(".mix-view-more > .phone-menu-button").first(), `${label} 200% text menu button`);
    await page.screenshot({ path: `${shots}/mix-detail-${theme}-${viewport.width}-200pct.png` });
  }
});

test("wide screens keep the Mix actions and the collection tabs in their rows", async ({ page }, testInfo) => {
  wideOnly(testInfo.project.name);
  const sizes = [[767, 900], [768, 1024], [834, 1147], [900, 900], [901, 900], [1199, 900], [1200, 900], [1280, 600], [1440, 900], [1920, 1080], [2560, 1080], [3440, 1440], [844, 390]] as const;
  for (const [width, height] of sizes) {
    const label = `${width}x${height}`;
    await page.setViewportSize({ width, height });
    await page.goto(`/mixes?mix=${activeMixId}`, { waitUntil: "networkidle" });
    const header = page.locator(".mix-selected-header");
    const more = header.getByRole("button", { name: "More Mix actions", exact: true });
    if (width < 768) {
      await expect(more, label).toBeVisible();
      await expect(header.getByRole("link", { name: "Edit", exact: true }), label).toBeHidden();
      continue;
    }
    await expect(more, label).toBeHidden();
    // Preview and Edit switch the view, then Share and Start act: one row, Start the one primary.
    const row = header.locator(".mix-view-actions");
    const controls = [row.getByRole("link", { name: "Preview", exact: true }), row.getByRole("link", { name: "Edit", exact: true }), row.getByRole("button", { name: /^Share .+ on the Marketplace$/ }), row.getByRole("link", { name: /^Start .+ for someone$/ })];
    const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const control of controls) { await expect(control, label).toBeVisible(); boxes.push((await control.boundingBox())!); }
    expect(Math.max(...boxes.map(box => box.y)) - Math.min(...boxes.map(box => box.y)), `${label}: one row`).toBeLessThanOrEqual(1);
    expect(boxes.every((box, index) => index === 0 || box.x >= boxes[index - 1].x + boxes[index - 1].width), `${label}: in order, apart`).toBe(true);
    await expect(header.locator(".button.primary"), label).toHaveCount(1);
    // The directory shows the three collection tabs wherever it shows.
    if (width < 1200) await choosePane(page, "Mix workspace panels", "Mixes");
    const collection = page.getByRole("navigation", { name: "Mix collection", exact: true });
    await expect(collection.getByRole("button"), label).toBeHidden();
    for (const name of ["My Mixes", "Mega-Mixes", "Marketplace"]) await expect(collection.getByRole("link", { name, exact: true }), `${label}: ${name}`).toBeVisible();
    await noHorizontalOverflow(page, label);
  }
  // A fractional layout width (110% zoom) keeps the wide row.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/mixes?mix=${activeMixId}`, { waitUntil: "networkidle" });
  const zoom = await page.addStyleTag({ content: "html { zoom: 1.1; }" });
  await expect(page.locator(".mix-selected-header").getByRole("link", { name: "Edit", exact: true })).toBeVisible();
  await noHorizontalOverflow(page, "1440 at 110% zoom");
  await zoom.evaluate(node => node.parentNode?.removeChild(node));
  await axeClean(page, "1440");
});

test("long phone pages fold their secondary sections, and Show more reveals the rest", async ({ page }, testInfo) => {
  phoneOnly(testInfo.project.name);
  test.setTimeout(480_000);
  const pages = [
    { name: "Journey list", path: "/journey", more: /^Show \d+ more Mixes$/, budget: BUDGET.journey },
    { name: "Mega-Mixes", path: "/mixes/mega", more: /^Show \d+ more Mixes$/, budget: BUDGET.megaMixes, pane: "Beats" },
    { name: "Ready-made Mega-Mix", path: "/templates/journeys?journey=contractor", more: /^Show \d+ more Mixes$/, budget: BUDGET.readyMade },
    { name: "Pricing", path: "/pricing", more: /^Show \d+ more$/, budget: BUDGET.pricing }
  ];
  for (const theme of THEMES) for (const viewport of PHONES) for (const item of pages) {
    const label = `${item.name} ${theme} ${viewport.width}px`;
    await page.setViewportSize(viewport);
    await page.goto(item.path, { waitUntil: "networkidle" });
    await applyRenderedTheme(page, theme);
    if (item.pane) await choosePane(page, "Mix workspace panels", item.pane);
    await settle(page);
    const height = await pageHeight(page);
    expect(height, `${label}: folded height`).toBeLessThanOrEqual(item.budget[viewport.width]);
    await noHorizontalOverflow(page, label);
    if (viewport.width === 328) expect((await tabLabelClearance(page)).every(bar => bar.gap >= 8), `${label}: tab labels ${JSON.stringify(await tabLabelClearance(page))}`).toBe(true);
    await axeClean(page, label);
    await page.screenshot({ path: `${shots}/${item.name.toLowerCase().replaceAll(" ", "-")}-${theme}-${viewport.width}.png`, fullPage: true });
    // Pricing has two lists; each reveals on its own.
    for (let round = 0; round < (item.name === "Pricing" ? 2 : 1); round++) {
      const button = page.getByRole("button", { name: item.more }).first();
      await expect(button, label).toBeVisible();
      await hydrated(button);
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".show-more-button")).toHaveCount(item.name === "Pricing" ? 1 - round : 0);
      await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest("[data-more]"))), { message: `${label}: focus on the first revealed item` }).toBe(true);
    }
    expect(await page.locator("[data-more]").evaluateAll(items => items.filter(element => !element.checkVisibility()).length), `${label}: all revealed`).toBe(0);
    expect(await pageHeight(page), `${label}: the fold saved space`).toBeGreaterThan(height);
    // 200% text: still no sideways scrolling, folded again on a fresh load.
    await page.goto(item.path, { waitUntil: "networkidle" });
    if (item.pane) await choosePane(page, "Mix workspace panels", item.pane);
    await page.addStyleTag({ content: enlargedText });
    await settle(page);
    await noHorizontalOverflow(page, `${label} 200% text`);
    await showMoreByKeyboard(page, item.more, `${label} 200% text`);
  }
});

test("the rest of the phone matrix, 320 and 390px: one primary row, folded long pages, nothing sideways", async ({ page }, testInfo) => {
  phoneOnly(testInfo.project.name);
  for (const width of [320, 390]) {
    const label = `${width}px`;
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/mixes?mix=${activeMixId}`, { waitUntil: "networkidle" });
    const header = page.locator(".mix-selected-header");
    const [start, row] = await Promise.all([header.locator(".mix-start-action").boundingBox(), header.locator(".mix-view-actions").boundingBox()]);
    expect(Math.abs(start!.width - row!.width), `${label}: Start fills the row`).toBeLessThanOrEqual(1);
    await reachable(page.locator(".mix-view-more > .phone-menu-button").first(), `${label} menu button`);
    await noHorizontalOverflow(page, `${label} Mix detail`);
    for (const path of ["/journey", "/mixes/mega", "/templates/journeys?journey=contractor", "/pricing"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      if (path === "/mixes/mega") await choosePane(page, "Mix workspace panels", "Beats");
      await expect(page.locator(".show-more-button").first(), `${label} ${path}`).toBeVisible();
      await reachable(page.locator(".show-more-button").first(), `${label} ${path} Show more`);
      await noHorizontalOverflow(page, `${label} ${path}`);
    }
  }
});

test("a chosen Mix past the first three opens the phone Journey list in full", async ({ page }, testInfo) => {
  phoneOnly(testInfo.project.name);
  await page.setViewportSize(PHONES[0]);
  await page.goto("/journey", { waitUntil: "networkidle" });
  const order = await page.locator("[data-list-mix]").evaluateAll(items => items.map(item => item.getAttribute("data-list-mix")!));
  expect(order.length).toBeGreaterThan(8);
  const later = order[7];
  await expect(page.locator(`[data-list-mix="${later}"]`)).toBeHidden();
  await page.goto(`/journey?mix=${later}`, { waitUntil: "networkidle" });
  await choosePane(page, "Journey workspace panels", "Mixes");
  await expect(page.locator(`[data-list-mix="${later}"]`)).toBeVisible();
  await expect(page.locator(".show-more-button")).toHaveCount(0);
  expect(await page.locator("[data-more]").count()).toBe(0);
});

test("wide screens show every item with no Show more, from each boundary up", async ({ page }, testInfo) => {
  wideOnly(testInfo.project.name);
  const checks = [
    { path: "/journey", list: true, phoneBelow: 768 },
    { path: "/templates/journeys?journey=contractor", phoneBelow: 768 },
    { path: "/pricing", phoneBelow: 761 }
  ];
  for (const check of checks) for (const width of [check.phoneBelow - 1, check.phoneBelow, 1024, 1440]) {
    const label = `${check.path} ${width}px`;
    await page.setViewportSize({ width, height: 900 });
    await page.goto(check.path, { waitUntil: "networkidle" });
    if (check.list) {
      const listView = page.getByRole("group", { name: "Show the journey as" }).getByRole("button", { name: "List", exact: true });
      await hydrated(listView);
      await listView.click();
      if (width < 1200) await choosePane(page, "Journey workspace panels", "Mixes");
    }
    await settle(page);
    const folded = await page.locator("[data-more]").evaluateAll(items => items.filter(item => !item.checkVisibility()).length);
    const buttons = await page.locator(".show-more-button").evaluateAll(items => items.filter(item => item.checkVisibility()).length);
    // Below the boundary the phone fold applies; from it up, a list the owner chooses (Journey's) shows in full.
    if (width < check.phoneBelow) { expect(folded, label).toBeGreaterThan(0); expect(buttons, label).toBeGreaterThan(0); }
    else { expect(folded, label).toBe(0); expect(buttons, label).toBe(0); }
    await noHorizontalOverflow(page, label);
  }
});

test("the phone Calendar's week buttons keep chevrons and short labels on one line, and its heading is in sentence case", async ({ page }, testInfo) => {
  phoneOnly(testInfo.project.name);
  for (const theme of THEMES) for (const viewport of PHONES) for (const enlarged of [false, true]) {
    const label = `${theme} ${viewport.width}px${enlarged ? " 200% text" : ""}`;
    await page.setViewportSize(viewport);
    await page.goto("/calendar", { waitUntil: "networkidle" });
    await applyRenderedTheme(page, theme);
    if (enlarged) { await page.addStyleTag({ content: enlargedText }); await settle(page); }
    const week = page.getByRole("navigation", { name: "Calendar weeks", exact: true });
    for (const name of ["Previous week", "Today", "Next week"]) {
      const link = week.getByRole("link", { name, exact: true });
      await expect(link, `${label}: ${name}`).toBeVisible();
      const lines = await link.evaluate(element => {
        const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE || (node as Element).tagName === "SPAN").filter(node => node.nodeType === Node.TEXT_NODE || (node as Element).checkVisibility());
        return text.map(node => { const range = document.createRange(); range.selectNodeContents(node); return range.getClientRects().length; });
      });
      expect(lines.every(count => count <= 1), `${label}: ${name} on one line`).toBe(true);
      if (name !== "Today") await expect(link.locator("svg"), `${label}: ${name} chevron`).toHaveCount(1);
    }
    const tops = await week.getByRole("link").evaluateAll(links => links.map(link => Math.round(link.getBoundingClientRect().top)));
    expect(new Set(tops).size, `${label}: one row`).toBe(1);
    const heading = page.getByRole("heading", { name: "Your next seven days", exact: true });
    await expect(heading).toBeVisible();
    expect(await heading.evaluate(element => getComputedStyle(element).textTransform), label).toBe("none");
    expect(await heading.evaluate(element => (element as HTMLElement).innerText), label).toBe("Your next seven days");
    await noHorizontalOverflow(page, label);
    if (!enlarged) await axeClean(page, label);
  }
});

test("the Journey map tells each input what it can do: one finger on touch screens, Space and drag with a mouse", async ({ page }, testInfo) => {
  const touch = testInfo.project.name === "mobile-chromium";
  await page.setViewportSize(touch ? PHONES[0] : { width: 1440, height: 900 });
  await page.goto("/journey", { waitUntil: "networkidle" });
  if (touch) {
    const mapView = page.getByRole("group", { name: "Show the journey as" }).getByRole("button", { name: "Map", exact: true });
    await hydrated(mapView);
    await mapView.click();
  }
  const canvas = page.getByRole("region", { name: /^Scrollable journey diagram/ });
  await expect(canvas).toBeVisible();
  const help = page.locator("details", { has: page.locator("summary", { hasText: /^Help$/ }) });
  await help.locator("summary").click();
  const text = await help.innerText();
  const name = await canvas.getAttribute("aria-label");
  if (touch) {
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    expect(text).toContain("drag with one finger");
    expect(text).not.toMatch(/Space|middle mouse|Arrow keys|Tab and Enter/);
    expect(name).toContain("Drag with one finger");
    expect(name).not.toContain("Space");
  } else {
    expect(text).toContain("hold Space and drag");
    expect(text).not.toContain("one finger");
    expect(name).toContain("hold Space and drag");
  }
});
