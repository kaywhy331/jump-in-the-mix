import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";

// JITM-UXB-05 (audit A-03, A-05, A-16, A-21, A-22): finding, filtering and starting take fewer steps, and an empty
// result never leaves a blank screen (JITM-08 §2.29, §2.32; JITM-06 §2.37; JITM-09 §2.36).
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(240_000);

const ARTIFACTS = ".artifacts/uxb-05";
const PEOPLE = ["Alder Brook", "Birch Cole", "Cedar Dunn"];
const MIX_NAME = "Lists fixture Mix";
const busyToken = randomUUID(), emptyToken = randomUUID();
let busyUserId: string, busyWorkspaceId: string, emptyUserId: string, emptyWorkspaceId: string, mixId: string;

async function fixtureOwner(label: string, token: string) {
  const suffix = randomUUID();
  const userId = (await prisma.user.create({ data: { email: `${label}-${suffix}@example.test`, name: `${label} fixture owner`, passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  const workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `${label}-${suffix}`, name: `${label} fixture`, members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  return { userId, workspaceId, suffix };
}

test.beforeAll(async () => {
  // An account with three follow-ups due today, one per person, from one Mix.
  const busy = await fixtureOwner("uxb05-lists", busyToken);
  busyUserId = busy.userId; busyWorkspaceId = busy.workspaceId;
  const template = await prisma.stepTemplate.create({ data: { workspaceId: busyWorkspaceId, name: "Lists fixture text", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "A lists fixture message." } });
  const mix = await prisma.mix.create({ data: { workspaceId: busyWorkspaceId, name: MIX_NAME, status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }] } }, include: { steps: true } });
  mixId = mix.id;
  // A minute after today's midnight (UTC, the owner's zone): due today whatever the hour the suite runs.
  const scheduledAt = new Date(new Date().toISOString().slice(0, 10) + "T00:01:00.000Z");
  for (const [index, displayName] of PEOPLE.entries()) {
    const phone = `+155502000${index}`;
    const contact = await prisma.contact.create({ data: { workspaceId: busyWorkspaceId, displayName, phones: { create: { phone, normalized: phone, isPrimary: true } } } });
    const id = `${busy.suffix}-jump-${index}`;
    await prisma.jump.create({ data: { id, workspaceId: busyWorkspaceId, contactId: contact.id, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt, status: "PENDING", reason: "Lists fixture follow-up", uniquenessKey: id, templateSnapshot: {}, renderedSnapshot: { body: version.body } } });
  }
  // An account with nothing in it yet: no contacts, archived contacts or support conversations.
  const empty = await fixtureOwner("uxb05-empty", emptyToken);
  emptyUserId = empty.userId; emptyWorkspaceId = empty.workspaceId;
});
test.afterAll(async () => {
  for (const workspaceId of [busyWorkspaceId, emptyWorkspaceId]) if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  for (const userId of [busyUserId, emptyUserId]) if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

async function signInAs(context: BrowserContext, token: string) {
  await context.clearCookies();
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
}
/** The shell shows the page once its account check is done (BrowserAccountBoundary). */
async function ready(page: Page) {
  const scope = page.locator("[data-browser-scope]");
  await expect(scope).not.toHaveAttribute("inert", "", { timeout: 60_000 });
  await expect(scope).toHaveCSS("visibility", "visible");
}
/** Load a page and wait until `until`, an element of the streamed page itself, shows. */
async function visit(page: Page, path: string, until?: string) {
  await page.goto(path);
  await ready(page);
  if (until) await expect(page.locator(`${until} >> visible=true`).first()).toBeVisible({ timeout: 30_000 });
}
const reviewButtons = (page: Page) => page.getByRole("button", { name: /^Review message for / });
const todaySearch = (page: Page) => page.getByRole("searchbox", { name: "Find a person, Mix, or reason", exact: true });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
type Box = { left: number; right: number; top: number; bottom: number };
const apart = (a: Box, b: Box, gap: number) => b.left - a.right >= gap || a.left - b.right >= gap || b.top - a.bottom >= gap || a.top - b.bottom >= gap;

test("Today searches from an inline field as the owner types, and its filter describes each preset and resets", async ({ page, context }) => {
  await signInAs(context, busyToken);
  await visit(page, "/jumps", ".today-search");
  const field = todaySearch(page);
  await expect(field).toBeVisible();
  await expect(reviewButtons(page)).toHaveCount(PEOPLE.length);
  // Inline: no sheet to open and no Search button to press (A-03).
  await expect(page.getByRole("dialog", { name: "Search Today" })).toHaveCount(0);
  await expect(page.getByRole("search", { name: "Search Today", exact: true }).getByRole("button", { name: "Search", exact: true })).toHaveCount(0);
  // Keyboard: Tab moves from Filter into the field.
  await page.getByRole("button", { name: /^Filter/ }).focus();
  await page.keyboard.press("Tab");
  await expect(field).toBeFocused();

  // Results follow the typing; focus stays in the field and each pause replaces the address instead of adding history.
  const entries = await page.evaluate(() => window.history.length);
  await page.keyboard.type("Birch");
  await expect(page).toHaveURL(url => url.pathname === "/jumps" && url.searchParams.get("q") === "Birch");
  await expect(reviewButtons(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Review message for Birch Cole/ })).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Birch");
  await expect(page.locator(".today-search [role=status]")).toHaveText("1 follow-up found.");
  expect(await page.evaluate(() => window.history.length)).toBe(entries);

  // No match: the card names the search and offers its one action, Clear search; the field keeps focus.
  await page.keyboard.type(" Zed");
  await expect(page.getByRole("heading", { name: "No follow-ups match “Birch Zed”", exact: true })).toBeVisible();
  await expect(field).toBeFocused();
  const card = page.locator(".empty-state");
  await expect(card.getByRole("link")).toHaveText(["Clear search"]);
  await card.getByRole("link", { name: "Clear search", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/jumps" && !url.searchParams.has("q"));
  await expect(reviewButtons(page)).toHaveCount(PEOPLE.length);
  await expect(field).toHaveValue("");

  // The field's own clear control empties the search and keeps focus in the field.
  await field.fill("Cedar");
  await expect(page).toHaveURL(url => url.searchParams.get("q") === "Cedar");
  await expect(reviewButtons(page)).toHaveCount(1);
  await page.getByRole("search", { name: "Search Today", exact: true }).getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page).toHaveURL(url => !url.searchParams.has("q"));
  await expect(field).toBeFocused();
  await expect(reviewButtons(page)).toHaveCount(PEOPLE.length);

  // Each preset says what it shows; Reset filters appears once there is something to reset.
  const filter = page.getByRole("dialog", { name: "Filter Today", exact: true });
  await page.getByRole("button", { name: /^Filter/ }).click();
  for (const [label, description] of [["Focused work", "Marks the follow-up to do next."], ["Compact scan", "A plain list, with nothing marked."], ["Show overdue", "Only open follow-ups past their due date."]]) {
    await expect(filter.getByRole("link", { name: label, exact: true })).toHaveAccessibleDescription(description);
  }
  await expect(filter.getByRole("link", { name: "Review overdue" })).toHaveCount(0);
  await expect(filter.getByRole("link", { name: "Reset filters", exact: true })).toHaveCount(0);
  await filter.getByRole("combobox", { name: "How", exact: true }).selectOption("EMAIL");
  await expect(page).toHaveURL(/channel=EMAIL/);
  await expect(page.getByRole("heading", { name: "No follow-ups match these filters", exact: true })).toBeVisible();
  await expect(page.locator(".empty-state").getByRole("link")).toHaveText(["Reset filters"]);
  await page.getByRole("button", { name: /^Filter/ }).click();
  await filter.getByRole("link", { name: "Reset filters", exact: true }).click();
  await expect(page).toHaveURL(/\/jumps$/);
  await expect(reviewButtons(page)).toHaveCount(PEOPLE.length);
});

test("Mixes: a labelled New Mix button, and a Preview/Edit switch set apart from Share and Start", async ({ page, context }) => {
  await signInAs(context, busyToken);
  // The directory, where New Mix lives; a phone shows it until a Mix is chosen.
  await visit(page, "/mixes", ".mix-library-directory");
  const create = page.locator(".mix-library-directory").getByRole("link", { name: "New Mix", exact: true });
  await expect(create).toHaveText("New Mix");
  await expect(create).toHaveAttribute("href", "/mixes/new?custom=1");
  expect((await create.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await visit(page, `/mixes?mix=${mixId}`, ".mix-view-tabs");

  const view = page.getByRole("navigation", { name: "Mix view", exact: true });
  await expect(view.getByRole("link")).toHaveText(["Preview", "Edit"]);
  await expect(view.getByRole("link", { name: "Preview", exact: true })).toHaveAttribute("aria-current", "page");
  const start = page.getByRole("link", { name: `Start ${MIX_NAME} for someone`, exact: true });
  await expect(start).toBeVisible();
  await expect(view.getByRole("link", { name: `Start ${MIX_NAME} for someone` })).toHaveCount(0);
  const look = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>(".mix-view-tabs")!, actions = document.querySelector<HTMLElement>(".mix-view-actions")!;
    const probe = document.createElement("div"); probe.style.background = "var(--surface)"; document.body.append(probe);
    const surface = getComputedStyle(probe).backgroundColor; probe.remove();
    const box = (element: Element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; };
    const segment = nav.querySelector<HTMLElement>("a:not([aria-current])")!, current = nav.querySelector<HTMLElement>("a[aria-current=page]")!;
    return { surface, track: getComputedStyle(nav).backgroundColor, segmentBorder: getComputedStyle(segment).borderTopColor, currentBackground: getComputedStyle(current).backgroundColor,
      actionBorders: [...actions.querySelectorAll<HTMLElement>(".button")].map(button => getComputedStyle(button).borderTopColor), nav: box(nav), actions: box(actions) };
  });
  // The switch is a track on --surface with borderless segments and a raised current one; the actions keep their borders.
  expect(look.track).toBe(look.surface);
  expect(look.segmentBorder).toBe("rgba(0, 0, 0, 0)");
  expect(look.currentBackground).not.toBe(look.track);
  expect(look.actionBorders.length).toBeGreaterThan(0);
  for (const border of look.actionBorders) expect(border).not.toBe("rgba(0, 0, 0, 0)");
  expect(apart(look.nav, look.actions, 8)).toBe(true);
  await view.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/view=edit/);
  await expect(page.getByRole("navigation", { name: "Mix view", exact: true }).getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("aria-current", "page");
});

test("Mix collection tabs and the Mixes header keep their clearance on narrow phones and at 200% text", async ({ page, context }) => {
  await signInAs(context, busyToken);
  for (const [width, scale] of [[328, 1], [320, 1], [390, 1], [328, 2]] as const) {
    await page.setViewportSize({ width, height: 800 });
    await visit(page, "/mixes", ".mix-library-directory .mix-library-tabs");
    if (scale > 1) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const name = `${width} px, ${scale * 100}% text`;
    const geometry = await page.evaluate(() => {
      const box = (element: Element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; };
      const aside = document.querySelector(".mix-library-directory")!;
      const tabs = [...aside.querySelectorAll<HTMLElement>(".mix-library-tabs a")].map(tab => ({ ...box(tab), fits: tab.scrollWidth <= tab.clientWidth }));
      return { aside: box(aside), tabs, title: box(aside.querySelector(".mix-directory-header h1")!), actions: [...aside.querySelectorAll(".mix-directory-actions > *")].map(box) };
    });
    expect(geometry.tabs.length, name).toBe(3);
    for (const [index, tab] of geometry.tabs.entries()) {
      expect(tab.fits, `${name}: tab ${index + 1} keeps its label`).toBe(true);
      expect(tab.left - geometry.aside.left, `${name}: tab ${index + 1} clears the column's left edge`).toBeGreaterThanOrEqual(8);
      expect(geometry.aside.right - tab.right, `${name}: tab ${index + 1} clears the column's right edge`).toBeGreaterThanOrEqual(8);
      const next = geometry.tabs[index + 1];
      if (next) expect(apart(tab, next, 8), `${name}: tabs ${index + 1} and ${index + 2} keep 8 px apart`).toBe(true);
    }
    for (const action of geometry.actions) expect(apart(geometry.title, action, 1), `${name}: the header actions never cover the title`).toBe(true);
    expect(await noOverflow(page), name).toBe(true);
  }
});

test("/mixes/new opens the ready-made library with a choice of how to start and nothing selected", async ({ page, context }, info) => {
  await signInAs(context, busyToken);
  await visit(page, "/mixes/new", ".mix-start-chooser");
  await expect(page).toHaveURL(/\/templates\?create=1$/);
  const chooser = page.getByRole("region", { name: "Create a Mix", exact: true });
  const readyMade = chooser.getByRole("link", { name: /^Start from a ready-made Mix/ });
  const scratch = chooser.getByRole("link", { name: /^Start from scratch/ });
  await expect(readyMade).toHaveAttribute("href", "#ready-made-mixes");
  await expect(scratch).toHaveAttribute("href", "/mixes/new?custom=1");
  // Nothing preselected: no current row, no selected Mix, and the chooser is the only scratch start.
  await expect(page.locator('.mix-library-item[aria-current="page"]')).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Selected ready-made Mix", exact: true })).toHaveCount(0);
  await expect(page.locator(".mix-directory-actions").getByRole("link", { name: "New Mix" })).toHaveCount(0);
  const prompt = page.getByRole("heading", { name: "Select a ready-made Mix", exact: true });
  if (info.project.name === "desktop-chromium") await expect(prompt).toBeVisible(); else await expect(prompt).toBeHidden();
  // Choosing ready-made moves focus to the list, by keyboard.
  await readyMade.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#ready-made-mixes")).toBeFocused();
  await page.locator(".mix-library-item").first().click();
  await expect(page).toHaveURL(/[?&]mix=/);
  await expect(page.getByRole("region", { name: "Selected ready-made Mix", exact: true })).toBeVisible();
  await page.goto("/mixes/new");
  await page.getByRole("region", { name: "Create a Mix", exact: true }).getByRole("link", { name: /^Start from scratch/ }).click();
  await expect(page).toHaveURL(/\/mixes\/new\?custom=1$/);
  await expect(page.getByLabel("Mix name", { exact: true })).toBeVisible();
});

test("Contacts with no match keep the detail pane, offer Clear search and announce in sentence case", async ({ page, context }, info) => {
  await signInAs(context, busyToken);
  await visit(page, `/contacts?q=${encodeURIComponent("Nobody here")}`, ".contacts-directory .empty-state");
  const card = page.locator(".contacts-directory .empty-state");
  await expect(card.getByRole("heading", { name: "No contacts matched", exact: true })).toBeVisible();
  await expect(card).toContainText("“Nobody here”");
  await expect(card.getByRole("link")).toHaveText(["Clear search"]);
  await expect(page.locator('p[role="status"][aria-live="polite"]')).toHaveText("No contacts matched “Nobody here”.");
  const pane = page.getByRole("region", { name: "Selected contact", exact: true });
  // From 1200 px the list has a detail pane: it prompts instead of going blank.
  if (info.project.name === "desktop-chromium") await expect(pane.getByRole("heading", { name: "Select a contact", exact: true })).toBeVisible();
  else await expect(pane).toBeHidden();
  await card.getByRole("link", { name: "Clear search", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/contacts" && !url.searchParams.has("q"));
  await expect(page.locator('p[role="status"][aria-live="polite"]')).toHaveText(`${PEOPLE.length} contacts found. Showing 1 through ${PEOPLE.length}.`);
});

test("An empty account: Support has one action, and Archived contacts hides search until something is archived", async ({ page, context }) => {
  await signInAs(context, emptyToken);
  await visit(page, "/account/tickets", ".empty-state");
  await expect(page.getByRole("heading", { name: "No conversations yet", exact: true })).toBeVisible();
  await expect(page.locator("main .button.primary")).toHaveText(["New conversation"]);
  await expect(page.getByRole("link", { name: "Ask for help" })).toHaveCount(0);

  await visit(page, "/contacts/archived", ".empty-state");
  await expect(page.getByRole("heading", { name: "No archived contacts", exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(page.locator(".empty-state").getByRole("link")).toHaveText(["Return to contacts"]);

  const archived = await prisma.contact.create({ data: { workspaceId: emptyWorkspaceId, displayName: "Elm Fairley", archivedAt: new Date() } });
  try {
    for (const [width, scale] of [[320, 1], [390, 1], [1280, 1], [320, 2]] as const) {
      await page.setViewportSize({ width, height: 800 });
      await visit(page, "/contacts/archived", ".filter-bar");
      if (scale > 1) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      const search = page.getByRole("searchbox", { name: "Search archived Contacts", exact: true });
      await expect(search).toBeVisible();
      await expect(search).toHaveAttribute("placeholder", "Search archived");
      await page.evaluate(() => document.fonts.ready);
      const room = await search.evaluate((input: HTMLInputElement) => {
        const style = getComputedStyle(input), context = document.createElement("canvas").getContext("2d")!;
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return { text: context.measureText(input.placeholder).width, room: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
      });
      expect(room.text, `${width} px, ${scale * 100}% text: the placeholder fits`).toBeLessThanOrEqual(room.room);
    }
    await page.setViewportSize({ width: 390, height: 800 });
    await visit(page, `/contacts/archived?q=${encodeURIComponent("Nobody here")}`, ".empty-state");
    await expect(page.getByRole("heading", { name: "No archived contacts matched", exact: true })).toBeVisible();
    await expect(page.locator(".empty-state").getByRole("link")).toHaveText(["Clear search"]);
    await expect(page.locator(".empty-state").getByRole("link", { name: "Clear search", exact: true })).toHaveAttribute("href", "/contacts/archived");
  } finally {
    await prisma.contact.deleteMany({ where: { id: archived.id } });
  }
});

test("the changed states pass in both themes across the layout widths, sideways, zoomed and at 200% text", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "The width matrix sets its own viewports; it runs once.");
  test.setTimeout(600_000);
  await mkdir(ARTIFACTS, { recursive: true });
  const states: Array<{ name: string; token: string; path: string; key: string }> = [
    { name: "today", token: busyToken, path: "/jumps", key: ".today-search" },
    { name: "today-no-match", token: busyToken, path: "/jumps?q=Nobody", key: ".empty-state" },
    { name: "mix-view", token: busyToken, path: `/mixes?mix=${mixId}`, key: ".mix-view-toolbar" },
    { name: "mix-chooser", token: busyToken, path: "/mixes/new", key: ".mix-start-chooser" },
    { name: "contacts-no-match", token: busyToken, path: "/contacts?q=Nobody", key: ".contacts-directory .empty-state" },
    { name: "tickets-empty", token: emptyToken, path: "/account/tickets", key: ".empty-state" },
    { name: "archived-empty", token: emptyToken, path: "/contacts/archived", key: ".empty-state" }
  ];
  const widths = [320, 390, 767, 768, 834, 900, 901, 1099, 1100, 1194, 1199, 1200, 1279, 1280, 1440, 1599, 1600, 1699, 1700, 1920, 2560, 3440];
  const fitsInView = async (selector: string) => {
    const seen = await page.evaluate(target => {
      const element = [...document.querySelectorAll(target)].find(match => match.getClientRects().length > 0);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, view: innerWidth };
    }, selector);
    const fits = Boolean(seen && seen.width > 0 && seen.left >= 0 && seen.right <= seen.view + 1);
    if (!fits) console.log("not in view", selector, page.url(), JSON.stringify(seen));
    return fits;
  };
  for (const state of states) {
    await signInAs(context, state.token);
    await page.setViewportSize({ width: 1280, height: 900 });
    await visit(page, state.path, state.key);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noOverflow(page), `${state.name} at ${width} px`).toBe(true);
      expect(await fitsInView(state.key), `${state.name} at ${width} px: ${state.key} in view`).toBe(true);
    }
    // A phone turned sideways and a 600 px-high laptop.
    for (const viewport of [{ width: 844, height: 390 }, { width: 1280, height: 600 }]) {
      await page.setViewportSize(viewport);
      expect(await noOverflow(page), `${state.name} at ${viewport.width}x${viewport.height}`).toBe(true);
      expect(await fitsInView(state.key), `${state.name} at ${viewport.width}x${viewport.height}`).toBe(true);
    }
    for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await applyRenderedTheme(page, colorScheme);
      expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations, `${state.name}, ${colorScheme}, ${width} px`).toEqual([]);
      const path = `${ARTIFACTS}/${state.name}-${width}-${colorScheme}.png`;
      await page.screenshot({ path });
      // Checked by code, not by eye: a PNG of the viewport's width.
      const png = await readFile(path);
      expect(png.readUInt32BE(16), path).toBe(width);
    }
    // 200% text at the narrowest and a desktop width: the changed element stays in view and nothing scrolls sideways.
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await visit(page, state.path, state.key);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      expect(await fitsInView(state.key), `${state.name} at ${width} px, 200% text`).toBe(true);
    }
    // A fractional layout width, as 110% zoom gives.
    await page.setViewportSize({ width: 1280, height: 900 });
    await visit(page, state.path, state.key);
    await page.evaluate(() => { document.documentElement.style.zoom = "1.1"; });
    expect(await noOverflow(page), `${state.name} at 110% zoom`).toBe(true);
  }
});
