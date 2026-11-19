import { createHash, randomUUID } from "node:crypto";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// Pane tabs in every state (JITM-NAV-02-R2; JITM-10 §2.26, JITM-08 §2.46; docs/design/NATIVE-NAVIGATION.md §3 B). Whatever a
// screen shows, including a creation form, an empty or filtered-empty list, a missing item, a single usable tab and a route
// that is still loading, every tab that can be focused or selected controls exactly one tab panel, linked both ways; a tab
// with nothing to show is disabled and skipped. Left, Right, Home and End always leave focus and selection on the same tab,
// with its panel showing, in both themes. The mobile project pages by swiping (coarse pointer); desktop keeps the switcher.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(300_000);

type Owner = { userId: string; workspaceId: string; token: string };
let full: Owner, empty: Owner, megaMixId: string;
const mixes: string[] = [], templates: string[] = [], errors: string[] = [];
const MIXES = "Mix workspace panels", JOURNEY = "Journey workspace panels";
const NO_MATCH = `zz-no-match-${randomUUID().slice(0, 8)}`;

async function makeOwner(label: string): Promise<Owner> {
  const userId = (await prisma.user.create({ data: { email: `pager-states-${randomUUID()}@example.invalid`, name: label, emailVerifiedAt: new Date() } })).id;
  const workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: label, slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  const token = randomUUID();
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  return { userId, workspaceId, token };
}
async function signIn(context: BrowserContext, owner: Owner) {
  await context.clearCookies();
  await context.addCookies([{ name: "jitm_session", value: owner.token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
}

test.beforeAll(async () => {
  full = await makeOwner("Pager states");
  empty = await makeOwner("Pager states, nothing yet");
  for (let index = 0; index < 3; index++) {
    const mix = await prisma.mix.create({ data: { workspaceId: full.workspaceId, name: `States Mix ${index + 1}`, description: "A reusable follow-up.", status: "DRAFT", triggerMode: "MANUAL_START" } });
    mixes.push(mix.id);
    const template = await prisma.stepTemplate.create({ data: { workspaceId: full.workspaceId, name: "Say hello", channel: "PHONE_CALL", versions: { create: { version: 1, script: "Hello! What would help most today?" } } }, include: { versions: true } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 0 } });
  }
  megaMixId = (await prisma.megaMixPipeline.create({ data: { workspaceId: full.workspaceId, name: "States Mega-Mix", members: { create: { mixId: mixes[0], position: 0 } } } })).id;
  for (const title of ["States ready-made one", "States ready-made two"]) templates.push((await prisma.sharedMix.create({ data: { title, description: "A ready-made plan you can adapt to your own words.", category: "Relationships", framework: "Ready-made", durationDays: 7, steps: [{ name: "Say hello", channel: "PHONE_CALL", script: "What would be helpful to talk about?", dayOffset: 0, sendTimeMinutes: 600 }], status: "APPROVED" } })).id);
});
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(() => expect(errors).toEqual([]));
test.afterAll(async () => {
  await prisma.sharedMix.deleteMany({ where: { id: { in: templates } } });
  await prisma.workspace.deleteMany({ where: { id: { in: [full?.workspaceId, empty?.workspaceId].filter(Boolean) } } });
  await prisma.user.deleteMany({ where: { id: { in: [full?.userId, empty?.userId].filter(Boolean) } } });
});

type State = { name: string; owner: () => Owner; path: () => string; list?: string; choose?: string };
/** Every state a pager can be in on Journey and the Mix library, and the creation flows beside them. */
const states: State[] = [
  { name: "Journey", owner: () => full, path: () => "/journey", list: JOURNEY },
  { name: "Journey, no Mixes yet", owner: () => empty, path: () => "/journey", list: JOURNEY },
  { name: "My Mixes, first Mix", owner: () => full, path: () => "/mixes", list: MIXES },
  { name: "My Mixes, chosen Mix", owner: () => full, path: () => `/mixes?mix=${mixes[1]}`, list: MIXES },
  { name: "My Mixes, no match", owner: () => full, path: () => `/mixes?q=${NO_MATCH}`, list: MIXES },
  { name: "My Mixes, no Mixes yet", owner: () => empty, path: () => "/mixes", list: MIXES },
  { name: "New Mix", owner: () => full, path: () => "/mixes/new?custom=1" },
  { name: "Mega-Mixes, chosen Mega-Mix", owner: () => full, path: () => `/mixes/mega?megaMix=${megaMixId}`, list: MIXES },
  { name: "Mega-Mixes, no match", owner: () => full, path: () => `/mixes/mega?q=${NO_MATCH}`, list: MIXES },
  { name: "Mega-Mixes, none yet", owner: () => empty, path: () => "/mixes/mega", list: MIXES },
  { name: "New Mega-Mix", owner: () => full, path: () => "/mixes/mega?new=1", list: MIXES },
  { name: "New Mega-Mix, first one", owner: () => empty, path: () => "/mixes/mega?new=1", list: MIXES },
  { name: "Ready-made, chosen Mix", owner: () => full, path: () => `/templates?mix=${templates[1]}`, list: MIXES },
  { name: "Ready-made, no match", owner: () => full, path: () => `/templates?q=${NO_MATCH}`, list: MIXES },
  { name: "Marketplace, chosen item", owner: () => full, path: () => "/marketplace?q=States%20ready-made%20one", choose: "States ready-made one", list: MIXES },
  { name: "Marketplace, no match", owner: () => full, path: () => `/marketplace?q=${NO_MATCH}`, list: MIXES },
  { name: "Marketplace, item no longer there", owner: () => full, path: () => `/marketplace?item=${encodeURIComponent(`listing:${randomUUID()}`)}`, list: MIXES }
];

async function show(page: Page, state: State) {
  await signIn(page.context(), state.owner());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(state.path(), { waitUntil: "networkidle" });
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
  if (state.choose) { await page.locator(".mix-library-item", { hasText: state.choose }).click(); await expect(page).toHaveURL(/item=/); }
  if (state.list) await expect(page.getByRole("tablist", { name: state.list, exact: true })).toBeVisible();
}

/** Every way the tabs and tab panels on the page can disagree; an empty list means the state is sound. */
const tabProblems = (page: Page) => page.evaluate(() => {
  const problems: string[] = [], panels = [...document.querySelectorAll<HTMLElement>("[role=tabpanel]")];
  for (const list of document.querySelectorAll<HTMLElement>("[role=tablist]")) {
    const tabs = [...list.querySelectorAll<HTMLButtonElement>("[role=tab]")], name = list.getAttribute("aria-label");
    const selected = tabs.filter(tab => tab.getAttribute("aria-selected") === "true");
    if (selected.length !== 1) problems.push(`${name}: ${selected.length} selected tabs`);
    for (const tab of tabs) {
      const label = `${name} › ${tab.textContent}`, isSelected = tab.getAttribute("aria-selected") === "true", disabled = tab.disabled || tab.getAttribute("aria-disabled") === "true";
      if (disabled && isSelected) problems.push(`${label}: selected but disabled`);
      if (disabled && tab.tabIndex >= 0) problems.push(`${label}: disabled but in the tab order`);
      // A tab that can be focused or selected controls exactly one panel, which it names.
      if (!disabled || isSelected || document.activeElement === tab) {
        const controls = tab.getAttribute("aria-controls"), owned = controls ? panels.filter(panel => panel.id === controls) : [];
        if (owned.length !== 1) problems.push(`${label}: ${isSelected ? "selected" : "focusable"} with ${owned.length} tab panels`);
        else if (!tab.id || owned[0].getAttribute("aria-labelledby") !== tab.id) problems.push(`${label}: its panel is not named by it`);
      } else if (tab.getAttribute("aria-controls")) problems.push(`${label}: disabled but controls a panel`);
    }
  }
  for (const panel of panels) {
    const owners = [...document.querySelectorAll<HTMLButtonElement>("[role=tab]")].filter(tab => tab.getAttribute("aria-controls") === panel.id);
    if (owners.length !== 1 || owners[0].id !== panel.getAttribute("aria-labelledby")) problems.push(`panel ${panel.getAttribute("data-pager-pane") ?? panel.id}: controlled by ${owners.length} tabs`);
    else if (owners[0].disabled) problems.push(`panel ${panel.getAttribute("data-pager-pane")}: its tab is disabled`);
  }
  return problems;
});

/** Which tab has focus and is selected, and which tab panels are showing: reachable and on screen. */
const keyboardState = (page: Page, name: string) => page.evaluate(listName => {
  const list = [...document.querySelectorAll<HTMLElement>("[role=tablist]")].find(item => item.getAttribute("aria-label") === listName)!;
  const selected = list.querySelector<HTMLElement>("[role=tab][aria-selected=true]"), active = document.activeElement as HTMLElement | null;
  const showing = [...document.querySelectorAll<HTMLElement>("[role=tabpanel]")].filter(panel => {
    if (panel.closest("[inert]")) return false;
    for (let node: HTMLElement | null = panel; node; node = node.parentElement) if (getComputedStyle(node).display === "none") return false;
    // A panel outside paging adds no box of its own: its landmark is what shows.
    const box = (getComputedStyle(panel).display === "contents" ? panel.firstElementChild ?? panel : panel).getBoundingClientRect();
    return box.width > 0 && box.left > -1 && box.left < innerWidth / 2;
  }).map(panel => document.getElementById(panel.getAttribute("aria-labelledby") ?? "")?.textContent ?? "?");
  return { focused: active?.getAttribute("role") === "tab" && list.contains(active) ? active.textContent : null, selected: selected?.textContent ?? null, showing };
}, name);

/** The keyboard state once focus, selection and the showing panel agree, or as it stands when the time runs out. */
async function settled(page: Page, list: string) {
  const until = Date.now() + 5_000;
  for (;;) {
    const now = await keyboardState(page, list);
    if (now.focused !== null && now.focused === now.selected && now.showing.length === 1 && now.showing[0] === now.selected || Date.now() > until) return now;
    await page.waitForTimeout(100);
  }
}

test("in every state, each tab that can be focused or selected controls exactly one tab panel, linked both ways", async ({ page }) => {
  for (const state of states) {
    await show(page, state);
    expect.soft(await tabProblems(page), state.name).toEqual([]);
  }
  // While a library route loads, its loading screen stands in for the pager; it never shows a tab without a panel.
  await signIn(page.context(), full);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/mixes/mega?megaMix=${megaMixId}`, { waitUntil: "networkidle" });
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === "/mixes" && url.searchParams.has("_rsc"), async route => { await held; await route.continue(); });
  await page.getByRole("tab", { name: "Mixes", exact: true }).click();
  await page.getByRole("navigation", { name: "Mix collection" }).getByRole("link", { name: "My Mixes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Loading Mixes…" })).toBeVisible();
  expect.soft(await tabProblems(page), "My Mixes while it loads").toEqual([]);
  release();
  await expect(page.getByRole("complementary", { name: "Mix library", exact: true })).toBeAttached();
  await expect(page.getByRole("tablist", { name: MIXES, exact: true })).toBeVisible();
  expect.soft(await tabProblems(page), "My Mixes once loaded").toEqual([]);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("in every state and both themes, Left, Right, Home and End leave focus and selection on the same tab, with its panel showing", async ({ page }) => {
  const keys = ["End", "Home", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft", "End", "ArrowLeft", "Home", "ArrowLeft"] as const;
  for (const state of states.filter(item => item.list)) {
    await show(page, state);
    const list = page.getByRole("tablist", { name: state.list!, exact: true });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await list.locator("[role=tab][aria-selected=true]").focus();
      for (const key of keys) {
        await page.keyboard.press(key);
        const where = `${state.name}, ${scheme}, ${key}`;
        const now = await settled(page, state.list!);
        expect.soft(now, where).toEqual({ focused: now.selected, selected: now.selected, showing: [now.selected] });
      }
    }
    await page.emulateMedia({ colorScheme: null });
  }
});
