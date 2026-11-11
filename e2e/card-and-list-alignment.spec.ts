import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { applyRenderedTheme } from "./theme-fixture";

// Four small visible defects in shared components (JITM-UXA-15; audit A-10, M-11, M-10, E-15):
// checkbox rows keep the title and its description apart and every checkbox the same size; actions in
// the 404, onboarding and account-gate cards line up with the text above them; auth cards keep clear
// space after a button; inline lists keep every item on one baseline.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(240_000);

/** JITM-07 §5 widths on both sides of the phone and desktop boundaries, plus wide screens. */
const WIDTHS = [320, 390, 767, 768, 834, 900, 901, 1099, 1100, 1194, 1199, 1200, 1279, 1280, 1440, 1599, 1600, 1699, 1700, 1920, 2560, 3440] as const;
/** The screenshot review sizes. */
const REVIEW = [375, 1440] as const;
const THEMES = ["light", "dark"] as const;
/** At least this much clear space follows an auth card's button (M-10). */
const AUTH_GAP = 12;
/** A title and its description sit on separate lines, or this far apart on one line (A-10). */
const LABEL_GAP = 8;

let workspaceId: string, userId: string;
const token = randomUUID();
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `card-list-alignment-${randomUUID()}@example.invalid`, name: "Alignment owner", emailVerifiedAt: new Date() } })).id;
  // A finished setup, so /onboarding shows the "Setup is complete" card.
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Alignment", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true, onboardingStep: 5 } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function signIn(page: Page) {
  await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
}
async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function noSidewaysScroll(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${label}: no sideways scroll`).toBeLessThanOrEqual(1);
}
async function review(page: Page, testInfo: TestInfo, name: string, check: (label: string) => Promise<void>) {
  for (const theme of THEMES) for (const width of REVIEW) {
    await applyRenderedTheme(page, theme, { width, height: 900 });
    await check(`${name} ${theme} ${width}`);
    await page.screenshot({ path: testInfo.outputPath(`${name}-${theme}-${width}.png`), fullPage: true });
  }
  await applyRenderedTheme(page, "light", { width: 1440, height: 900 });
}
/** `pageAt200` false: the page has a known overflow at 200% text outside this slice, so the check covers only its own element. */
async function atEveryWidth(page: Page, name: string, check: (label: string) => Promise<void>, { pageAt200 = true } = {}) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await settle(page);
    await check(`${name} ${width}`);
    await noSidewaysScroll(page, `${name} ${width}`);
  }
  // A phone turned sideways, a short laptop and a fractional width (110% zoom).
  for (const [width, height] of [[844, 390], [1280, 600]] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    await check(`${name} ${width}x${height}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "1.1"; });
  await settle(page);
  await check(`${name} 1440 at 110% zoom`);
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });
  // 200% text at a phone and a desktop width.
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await settle(page);
    await check(`${name} ${width} at 200% text`);
    if (pageAt200) await noSidewaysScroll(page, `${name} ${width} at 200% text`);
  }
}

// A-10: every checkbox row with a title and a description.
async function expectCheckboxRows(page: Page, label: string, sizes: Map<string, string>) {
  const rows = await page.locator(".checkbox-card:visible").evaluateAll(cards => cards.map(card => {
    const input = card.querySelector(":scope > input")!.getBoundingClientRect();
    const title = card.querySelector("strong")?.getBoundingClientRect();
    const help = card.querySelector("small")?.getBoundingClientRect();
    return { text: card.textContent!.trim().slice(0, 40), input: { width: input.width, height: input.height },
      title: title && { right: title.right, bottom: title.bottom }, help: help && { left: help.left, top: help.top } };
  }));
  expect(rows.length, `${label}: checkbox rows`).toBeGreaterThan(0);
  for (const row of rows) {
    if (row.title && row.help) {
      const ownLine = row.help.top >= row.title.bottom - 0.5;
      expect(ownLine || row.help.left - row.title.right >= LABEL_GAP, `${label}: "${row.text}" keeps title and description apart`).toBe(true);
    }
    expect(row.input, `${label}: "${row.text}" checkbox matches the first`).toEqual(rows[0].input);
    // The same checkbox keeps its size at every width.
    const size = JSON.stringify(row.input);
    if (!sizes.has(row.text)) sizes.set(row.text, size);
    expect(size, `${label}: "${row.text}" checkbox size across widths`).toBe(sizes.get(row.text));
  }
}

// M-11: the first action in a card lines up with the heading and text above it.
async function expectActionsAligned(page: Page, card: string, label: string) {
  const edges = await page.locator(card).first().evaluate(element => {
    const actions = element.querySelector(":scope > .page-actions")!;
    const first = [...actions.children].find(child => child.getBoundingClientRect().width > 0)!;
    let text = actions.previousElementSibling;
    while (text && (text.tagName !== "P" || text.getBoundingClientRect().height === 0)) text = text.previousElementSibling;
    return { action: first.getBoundingClientRect().left, heading: element.querySelector("h1")!.getBoundingClientRect().left, text: text!.getBoundingClientRect().left };
  });
  expect(Math.abs(edges.action - edges.text), `${label}: action left edge matches the text`).toBeLessThanOrEqual(1);
  expect(Math.abs(edges.action - edges.heading), `${label}: action left edge matches the heading`).toBeLessThanOrEqual(1);
}

// M-10: clear space between an auth card's button (alone or ending a form) and the next line of text.
async function authGaps(page: Page) {
  return page.locator(".auth-card:visible").first().evaluate(card => [...card.children].flatMap(element => {
    const buttons = element.matches(".button") ? [element] : [...element.querySelectorAll("button, .button")];
    const visible = buttons.filter(button => button.getBoundingClientRect().height > 0);
    if (!visible.length) return [];
    let next = element.nextElementSibling;
    while (next && (next.getBoundingClientRect().height === 0 || !next.textContent!.trim())) next = next.nextElementSibling;
    if (!next) return [];
    const bottom = Math.max(...visible.map(button => button.getBoundingClientRect().bottom));
    return [{ button: visible.at(-1)!.textContent!.trim(), next: next.textContent!.trim().slice(0, 40), gap: next.getBoundingClientRect().top - bottom }];
  }));
}
async function expectAuthGaps(page: Page, label: string) {
  const gaps = await authGaps(page);
  for (const gap of gaps) expect(gap.gap, `${label}: "${gap.button}" to "${gap.next}"`).toBeGreaterThanOrEqual(AUTH_GAP);
  return gaps;
}

// E-15: items on one row of an inline list share a baseline.
async function expectOneBaseline(page: Page, list: string, label: string) {
  const items = await page.locator(list).evaluate(element => [...element.children].map(item => {
    const box = item.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, width: document.documentElement.clientWidth, baseline: (item.querySelector("a") ?? item).getBoundingClientRect().bottom };
  }));
  for (const item of items) expect(item.right, `${label}: item stays on screen`).toBeLessThanOrEqual(item.width + 1);
  let pairs = 0;
  for (let index = 1; index < items.length; index++) {
    if (items[index].left <= items[index - 1].left) continue; // wrapped to a new row
    pairs++;
    expect(Math.round((items[index].top - items[index - 1].top) * 100) / 100, `${label}: item ${index + 1} top`).toBe(0);
    expect(Math.round((items[index].baseline - items[index - 1].baseline) * 100) / 100, `${label}: item ${index + 1} baseline`).toBe(0);
  }
  return pairs;
}

test("the new-contact checkbox row keeps the title apart from the description, and the checkbox keeps its size", async ({ page }, testInfo) => {
  await signIn(page);
  // The first-follow-up row on a new contact renders in every environment.
  await page.goto("/contacts/new");
  await expect(page.getByText("Schedule a follow-up now")).toBeVisible();
  const contactSizes = new Map<string, string>();
  await review(page, testInfo, "contact-new-checkbox", label => expectCheckboxRows(page, label, contactSizes));
  await atEveryWidth(page, "contact-new-checkbox", label => expectCheckboxRows(page, label, new Map()));
});

test("Notifications checkboxes keep the title apart from the description, and match in size", async ({ page }, testInfo) => {
  await signIn(page);
  // Notifications shows its email checkboxes only where a mail sender is configured.
  await page.goto("/settings/notifications");
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  const digest = page.locator(".checkbox-card", { hasText: "Morning digest" });
  test.skip(!(await digest.count()), "Email reminders need a configured mail sender.");
  const notificationSizes = new Map<string, string>();
  await review(page, testInfo, "notifications-checkbox", label => expectCheckboxRows(page, label, notificationSizes));
  // The phone and desktop checkboxes match each other too.
  expect(new Set(notificationSizes.values()).size, "one checkbox size at 375 and 1440").toBe(1);
  await atEveryWidth(page, "notifications-checkbox", label => expectCheckboxRows(page, label, new Map()));
});

test("actions in the 404, onboarding and account-gate cards line up with the text above them", async ({ page }, testInfo) => {
  await page.goto("/uxa15-missing-page");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await review(page, testInfo, "not-found", label => expectActionsAligned(page, ".recovery-card", label));
  await atEveryWidth(page, "not-found", label => expectActionsAligned(page, ".recovery-card", label));
  // The actions stay reachable from the keyboard, in reading order.
  await page.goto("/uxa15-missing-page");
  const home = page.getByRole("link", { name: "Go to home" });
  for (let press = 0; press < 30 && !(await home.evaluate(link => link === document.activeElement)); press++) await page.keyboard.press("Tab");
  await expect(home).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Contact support" })).toBeFocused();

  await signIn(page);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { level: 1, name: "Setup is complete" })).toBeVisible();
  await review(page, testInfo, "onboarding-complete", label => expectActionsAligned(page, ".onboarding-card", label));
  await atEveryWidth(page, "onboarding-complete", label => expectActionsAligned(page, ".onboarding-card", label));

  // An unreachable account check shows the "Reconnect to continue" gate over the workspace.
  await page.goto("/jumps");
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  await page.route("**/api/auth/browser-context", route => route.fulfill({ status: 503 }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const gate = page.locator(".browser-account-gate");
  await expect(gate).toContainText("Reconnect to continue");
  await review(page, testInfo, "account-gate", label => expectActionsAligned(page, ".browser-account-gate .auth-card", label));
  await atEveryWidth(page, "account-gate", label => expectActionsAligned(page, ".browser-account-gate .auth-card", label));
});

for (const route of ["/waitlist", "/register", "/forgot-password", "/login"]) {
  test(`${route}: the auth card keeps clear space after its buttons`, async ({ page }, testInfo) => {
    await page.goto(route);
    await expect(page.locator(".auth-card")).toBeVisible();
    const found = await authGaps(page);
    // Forgot password shows its form only where a mail sender is configured.
    test.skip(!found.length && route === "/forgot-password", "Password-reset email is unavailable here.");
    expect(found.length, `${route}: a button followed by text`).toBeGreaterThan(0);
    const name = route.slice(1).replace(/\W+/g, "-");
    await review(page, testInfo, `auth-${name}`, label => expectAuthGaps(page, label).then(() => undefined));
    await atEveryWidth(page, `auth-${name}`, label => expectAuthGaps(page, label).then(() => undefined));
    await testInfo.attach(`gaps-${name}`, { body: JSON.stringify(await authGaps(page)), contentType: "application/json" });
  });
}

test("inline lists keep every item on one baseline", async ({ page }, testInfo) => {
  await page.goto("/follow-up-templates/proposal-follow-up");
  const contents = page.locator(".public-contents ul");
  await expect(contents).toBeVisible();
  const related = page.locator(".public-related-links");
  for (const [list, name] of [[".public-contents ul", "On this page"], [".public-related-links", "Related"]] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page);
    expect(await expectOneBaseline(page, list, `${name} 1440`), `${name}: items share a row at 1440`).toBeGreaterThan(0);
    await review(page, testInfo, `inline-list-${name.replace(/\W+/g, "-").toLowerCase()}`, label => expectOneBaseline(page, list, label).then(() => undefined));
    // At 390 px and 200% text the article's H1 is wider than the screen (a separate follow-up), so that check covers the list only.
    await atEveryWidth(page, `inline-list-${name.replace(/\W+/g, "-").toLowerCase()}`, label => expectOneBaseline(page, list, label).then(() => undefined), { pageAt200: false });
    await page.reload();
    await expect(contents).toBeVisible();
    await expect(related).toBeVisible();
  }
});
