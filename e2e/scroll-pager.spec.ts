import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

// Pane paging (JITM-NAV-02; JITM-08 §2.46; docs/design/NATIVE-NAVIGATION.md §3 B). On a touch screen up to 1024px the pane
// tabs of Journey and the Mix library (My Mixes, Ready-made, Marketplace) also page by swiping, with native scroll snapping.
// Fine pointers and wider screens keep the one-pane switcher. The mobile project is a coarse pointer; desktop is fine.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(180_000);

let userId: string, workspaceId: string;
const token = randomUUID(), mixes: string[] = [], templates: string[] = [], errors: string[] = [];
const coarse = (name: string) => name === "mobile-chromium";

test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `scroll-pager-${randomUUID()}@example.invalid`, name: "Pager fixture", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Pager fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  for (let index = 0; index < 8; index++) await prisma.contact.create({ data: { workspaceId, displayName: `Pager person ${index + 1}` } });
  // Twenty Mixes make the directory pane taller than the screen, so its own vertical scroll can be checked.
  for (let index = 0; index < 20; index++) {
    const mix = await prisma.mix.create({ data: { workspaceId, name: `Pager Mix ${String(index + 1).padStart(2, "0")}`, description: "A reusable follow-up.", status: "DRAFT", triggerMode: "MANUAL_START" } });
    mixes.push(mix.id);
    for (let beat = 0; beat < 2; beat++) {
      const template = await prisma.stepTemplate.create({ data: { workspaceId, name: beat ? "Check in again" : "Say hello", channel: "PHONE_CALL", versions: { create: { version: 1, script: beat ? "How has everything been going?" : "Hello! What would help most today?" } } }, include: { versions: true } });
      await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id, dayOffset: beat * 7, sortOrder: beat } });
    }
  }
  for (const title of ["Pager ready-made one", "Pager ready-made two"]) templates.push((await prisma.sharedMix.create({ data: { title, description: "A ready-made plan you can adapt to your own words.", category: "Relationships", framework: "Ready-made", durationDays: 7, steps: [{ name: "Say hello", channel: "PHONE_CALL", script: "What would be helpful to talk about?", dayOffset: 0, sendTimeMinutes: 600 }], status: "APPROVED" } })).id);
});
test.beforeEach(async ({ page, context }) => {
  errors.length = 0;
  page.on("pageerror", error => errors.push(error.message));
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
});
test.afterEach(() => expect(errors).toEqual([]));
test.afterAll(async () => {
  await prisma.sharedMix.deleteMany({ where: { id: { in: templates } } });
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

const tablist = (page: Page, name: string) => page.getByRole("tablist", { name, exact: true });
const pager = (page: Page) => page.locator(".scroll-pager");
const track = (page: Page) => page.locator(".scroll-pager-track");
const MIXES = "Mix workspace panels", JOURNEY = "Journey workspace panels";

async function open(page: Page, path: string, width = 412, height = 915) {
  await page.setViewportSize({ width, height });
  await page.goto(path, { waitUntil: "networkidle" });
}
/** The scroll position of a pane inside the track, and the track's own position. */
async function geometry(page: Page, pane: string) {
  return track(page).evaluate((element, id) => {
    const target = element.querySelector<HTMLElement>(`[data-pager-pane="${id}"]`)!;
    return { offset: Math.round(target.getBoundingClientRect().left - element.getBoundingClientRect().left + element.scrollLeft), left: Math.round(element.scrollLeft), width: element.clientWidth, paneWidth: Math.round(target.getBoundingClientRect().width) };
  }, pane);
}
async function restsOn(page: Page, list: string, pane: string, label: string) {
  await expect(tablist(page, list).getByRole("tab", { name: label, exact: true })).toHaveAttribute("aria-selected", "true");
  await expect.poll(async () => { const g = await geometry(page, pane); return Math.abs(g.left - g.offset); }, { timeout: 10_000 }).toBeLessThanOrEqual(1);
}
/** A one-finger touch drag through the browser's own input pipeline, so scrolling, snapping and momentum are native. */
async function swipe(page: Page, from: { x: number; y: number }, dx: number, dy = 0, options: { steps?: number; hold?: boolean } = {}) {
  const cdp = await page.context().newCDPSession(page), steps = options.steps ?? 10;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  for (let step = 1; step <= steps; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + dx * step / steps, y: from.y + dy * step / steps }] });
    await page.waitForTimeout(16);
  }
  const end = async () => { await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await cdp.detach(); };
  if (options.hold) return end;
  await end();
  return async () => {};
}
const middle = (page: Page) => { const size = page.viewportSize()!; return { x: Math.round(size.width / 2), y: Math.round(size.height * .55) }; };
/** Swipe left (finger right to left) goes to the next pane; swipe right goes back, as native pagers do. */
const next = (page: Page) => { const size = page.viewportSize()!; return swipe(page, { x: Math.round(size.width * .8), y: Math.round(size.height * .55) }, -Math.round(size.width * .6)); };
const previous = (page: Page) => { const size = page.viewportSize()!; return swipe(page, { x: Math.round(size.width * .2), y: Math.round(size.height * .55) }, Math.round(size.width * .6)); };
/** Frames from the finger lifting mid-page until the track rests on a pane, sampled once per frame. */
async function framesToRest(page: Page) {
  const size = page.viewportSize()!;
  const release = await swipe(page, { x: Math.round(size.width * .8), y: Math.round(size.height * .55) }, -Math.round(size.width * .45), 0, { hold: true });
  await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>(".scroll-pager-track")!, state = { samples: [] as number[], released: -1 };
    Object.assign(window, { pagerRest: state });
    document.addEventListener("touchend", () => { state.released = state.samples.length; }, { capture: true, once: true });
    const sample = () => { state.samples.push(element.scrollLeft); if (state.samples.length < 120) requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
  });
  await page.waitForTimeout(100);
  await release();
  await page.waitForTimeout(2_200);
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>(".scroll-pager-track")!, { samples, released } = (window as unknown as { pagerRest: { samples: number[]; released: number } }).pagerRest;
    const offsets = [...element.querySelectorAll<HTMLElement>("[data-pager-pane]")].map(pane => pane.getBoundingClientRect().left - element.getBoundingClientRect().left + element.scrollLeft);
    const resting = (value: number) => offsets.some(offset => Math.abs(offset - value) <= 1);
    if (released < 0 || resting(samples[released - 1] ?? 0)) throw new Error(`The finger was not lifted mid-page: ${JSON.stringify({ released, samples: samples.slice(0, 12) })}`);
    let rest = samples.length;
    while (rest > released && resting(samples[rest - 1]) && samples[rest - 1] === samples[samples.length - 1]) rest--;
    return rest - released;
  });
}

test.describe("on a touch screen", () => {
  test.beforeEach(({}, info) => test.skip(!coarse(info.project.name), "Paging needs a coarse pointer."));

  test("My Mixes pages Mixes, Beats and Details by swiping both ways, with native snapping", async ({ page }) => {
    await open(page, `/mixes?mix=${mixes[0]}`);
    await expect(pager(page)).toHaveAttribute("data-paging");
    const style = await track(page).evaluate(element => { const css = getComputedStyle(element); return { snap: css.scrollSnapType, overscroll: css.overscrollBehaviorX }; });
    expect(style.snap).toBe("x mandatory");
    expect(style.overscroll).toBe("contain");
    await restsOn(page, MIXES, "beats", "Beats");
    const g = await geometry(page, "beats");
    expect(g.paneWidth).toBe(g.width);
    await next(page); await restsOn(page, MIXES, "details", "Details");
    await previous(page); await restsOn(page, MIXES, "beats", "Beats");
    await previous(page); await restsOn(page, MIXES, "library", "Mixes");
    await next(page); await restsOn(page, MIXES, "beats", "Beats");
    // Only the pane on screen takes part; the others are off-screen like the switcher's hidden panes.
    await expect(page.locator('[data-pager-pane="library"]')).toHaveAttribute("inert", "");
    await expect(page.locator('[data-pager-pane="beats"]')).not.toHaveAttribute("inert", "");
  });

  test("the indicator follows the finger and the selected tab changes when the scroll comes to rest", async ({ page }) => {
    await open(page, "/mixes");
    await restsOn(page, MIXES, "library", "Mixes");
    const size = page.viewportSize()!;
    const release = await swipe(page, { x: Math.round(size.width * .8), y: Math.round(size.height * .55) }, -Math.round(size.width * .3), 0, { hold: true });
    const during = await page.evaluate(() => {
      const indicator = document.querySelector<HTMLElement>(".scroll-pager-indicator")!, tabs = [...document.querySelectorAll<HTMLElement>('[role=tablist] [role=tab]')];
      return { x: new DOMMatrixReadOnly(getComputedStyle(indicator).transform).m41, first: tabs[0].offsetLeft, second: tabs[1].offsetLeft };
    });
    expect(during.x).toBeGreaterThan(during.first + 1);
    expect(during.x).toBeLessThan(during.second);
    await expect(tablist(page, MIXES).getByRole("tab", { name: "Mixes", exact: true })).toHaveAttribute("aria-selected", "true");
    await release();
    await restsOn(page, MIXES, "beats", "Beats");
    await expect.poll(() => page.evaluate(() => { const indicator = document.querySelector<HTMLElement>(".scroll-pager-indicator")!, tab = document.querySelector<HTMLElement>('[role=tab][aria-selected=true]')!; return Math.round(new DOMMatrixReadOnly(getComputedStyle(indicator).transform).m41 - tab.offsetLeft); })).toBe(0);
  });

  test("each pane keeps its own vertical scroll, and a vertical swipe never pages", async ({ page }) => {
    await open(page, "/mixes");
    await restsOn(page, MIXES, "library", "Mixes");
    const directory = page.locator('[data-pager-pane="library"]');
    await swipe(page, middle(page), 0, -320);
    await expect.poll(() => directory.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
    await page.waitForTimeout(400);
    await expect(tablist(page, MIXES).getByRole("tab", { name: "Mixes", exact: true })).toHaveAttribute("aria-selected", "true");
    expect((await geometry(page, "library")).left).toBe(0);
    // Read the position once the fling has come to rest.
    let last = -1;
    await expect.poll(async () => { const now = await directory.evaluate(element => element.scrollTop), same = now === last; last = now; return same; }, { intervals: [250] }).toBe(true);
    const kept = last;
    await tablist(page, MIXES).getByRole("tab", { name: "Beats", exact: true }).click();
    await restsOn(page, MIXES, "beats", "Beats");
    await tablist(page, MIXES).getByRole("tab", { name: "Mixes", exact: true }).click();
    await restsOn(page, MIXES, "library", "Mixes");
    expect(await directory.evaluate(element => element.scrollTop)).toBe(kept);
  });

  test("a swipe that starts on a field does not page", async ({ page }) => {
    await open(page, "/mixes");
    await restsOn(page, MIXES, "library", "Mixes");
    const box = (await page.getByRole("searchbox", { name: "Search Mixes", exact: true }).boundingBox())!;
    await swipe(page, { x: Math.round(box.x + box.width * .8), y: Math.round(box.y + box.height / 2) }, -Math.round(page.viewportSize()!.width * .6));
    await page.waitForTimeout(600);
    expect((await geometry(page, "library")).left).toBe(0);
    await expect(tablist(page, MIXES).getByRole("tab", { name: "Mixes", exact: true })).toHaveAttribute("aria-selected", "true");
  });

  test("past the first and last panes the pager reports overscroll for the section hand-off", async ({ page }) => {
    await open(page, "/mixes");
    await restsOn(page, MIXES, "library", "Mixes");
    await page.evaluate(() => { const seen: unknown[] = []; Object.assign(window, { pagerOverscroll: seen }); document.addEventListener("scrollpager:overscroll", event => seen.push((event as CustomEvent).detail)); });
    const seen = () => page.evaluate(() => (window as unknown as { pagerOverscroll: { edge: string; phase: string; distance: number }[] }).pagerOverscroll);
    await previous(page);
    await expect.poll(async () => (await seen()).map(event => `${event.edge}:${event.phase}`).filter((value, index, all) => all.indexOf(value) === index)).toEqual(["first:start", "first:move", "first:end"]);
    expect((await seen()).at(-1)!.distance).toBeGreaterThan(100);
    await restsOn(page, MIXES, "library", "Mixes");
    await tablist(page, MIXES).getByRole("tab", { name: "Details", exact: true }).click();
    await restsOn(page, MIXES, "details", "Details");
    await page.evaluate(() => (window as unknown as { pagerOverscroll: unknown[] }).pagerOverscroll.splice(0));
    await next(page);
    await expect.poll(async () => (await seen()).map(event => `${event.edge}:${event.phase}`).filter((value, index, all) => all.indexOf(value) === index)).toEqual(["last:start", "last:move", "last:end"]);
    await restsOn(page, MIXES, "details", "Details");
  });

  test("reduced motion: a tab, an arrow key and a released swipe all land at once", async ({ page }) => {
    await open(page, "/mixes");
    await restsOn(page, MIXES, "library", "Mixes");
    // Without reduced motion a tab scrolls smoothly, so one frame later the pane is still on its way.
    const smooth = await page.evaluate(() => new Promise<number>(resolve => { document.querySelector<HTMLElement>('[role=tab][data-pane="details"]')!.click(); requestAnimationFrame(() => resolve(document.querySelector(".scroll-pager-track")!.scrollLeft)); }));
    const details = await geometry(page, "details");
    expect(smooth).toBeLessThan(details.offset);
    await restsOn(page, MIXES, "details", "Details");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const instant = await page.evaluate(() => new Promise<number>(resolve => { document.querySelector<HTMLElement>('[role=tab][data-pane="library"]')!.click(); requestAnimationFrame(() => resolve(document.querySelector(".scroll-pager-track")!.scrollLeft)); }));
    expect(instant).toBe(0);
    await tablist(page, MIXES).getByRole("tab", { name: "Mixes", exact: true }).press("ArrowRight");
    expect(Math.abs((await geometry(page, "beats")).left - (await geometry(page, "beats")).offset)).toBeLessThanOrEqual(1);
    await restsOn(page, MIXES, "beats", "Beats");
    // A swipe released mid-way settles on the pane the browser chose without the snap animation.
    const reducedFrames = await framesToRest(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await tablist(page, MIXES).getByRole("tab", { name: "Beats", exact: true }).click();
    await restsOn(page, MIXES, "beats", "Beats");
    const nativeFrames = await framesToRest(page);
    test.info().annotations.push({ type: "frames from release to rest", description: `reduced ${reducedFrames}, native ${nativeFrames}` });
    expect(reducedFrames).toBeLessThanOrEqual(3);
    expect(nativeFrames).toBeGreaterThan(reducedFrames);
  });

  test("Journey pages People, Mixes and Details by swiping both ways", async ({ page }) => {
    await open(page, "/journey");
    await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
    await expect(pager(page)).toHaveAttribute("data-paging");
    await restsOn(page, JOURNEY, "map", "Mixes");
    await next(page); await restsOn(page, JOURNEY, "details", "Details");
    await previous(page); await restsOn(page, JOURNEY, "map", "Mixes");
    await previous(page); await restsOn(page, JOURNEY, "people", "People");
    await next(page); await restsOn(page, JOURNEY, "map", "Mixes");
    await expect(page.getByRole("complementary", { name: "Journey details", exact: true })).toHaveAttribute("inert", "");
  });

  test("Ready-made and Marketplace page their panes by swiping both ways", async ({ page }) => {
    await open(page, `/templates?mix=${templates[0]}`);
    await expect(pager(page)).toHaveAttribute("data-paging");
    await restsOn(page, MIXES, "beats", "Beats");
    await previous(page); await restsOn(page, MIXES, "library", "Mixes");
    await next(page); await restsOn(page, MIXES, "beats", "Beats");
    await next(page); await restsOn(page, MIXES, "details", "Details");
    await open(page, "/marketplace?q=Pager%20ready-made%20one");
    await page.locator(".mix-library-item", { hasText: "Pager ready-made one" }).click();
    await expect(page).toHaveURL(/item=/);
    await restsOn(page, MIXES, "beats", "Beats");
    await next(page); await restsOn(page, MIXES, "details", "Details");
    await previous(page); await restsOn(page, MIXES, "beats", "Beats");
    await previous(page); await restsOn(page, MIXES, "library", "Mixes");
  });

  test("paging holds across the touch widths, short screens, both themes and 200% text, and hands over at 1025px", async ({ page }) => {
    const report: string[] = [];
    for (const [width, height] of [[320, 640], [390, 844], [767, 1024], [768, 1024], [834, 1147], [900, 1024], [901, 1024], [1024, 768], [844, 390], [667, 375]] as const) {
      await open(page, `/mixes?mix=${mixes[1]}`, width, height);
      await expect(pager(page), `${width}x${height}`).toHaveAttribute("data-paging");
      await restsOn(page, MIXES, "beats", "Beats");
      const fit = await page.evaluate(() => {
        const pane = document.querySelector<HTMLElement>('[data-pager-pane="beats"]')!.getBoundingClientRect(), nav = document.querySelector(".mobile-nav"), header = document.querySelector(".mobile-app-header");
        const navTop = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().top : innerHeight, headerBottom = header && getComputedStyle(header).display !== "none" ? header.getBoundingClientRect().bottom : 0;
        const tabs = [...document.querySelectorAll<HTMLElement>("[role=tab]")].map(tab => tab.getBoundingClientRect().height);
        return { top: Math.round(pane.top), bottom: Math.round(pane.bottom), height: Math.round(pane.height), navTop: Math.round(navTop), headerBottom: Math.round(headerBottom), tab: Math.min(...tabs), overflow: document.documentElement.scrollWidth - innerWidth, layout: innerWidth };
      });
      report.push(`${width}x${height}: pane ${fit.top}-${fit.bottom} (${fit.height}px), header ${fit.headerBottom}, nav ${fit.navTop}`);
      if (process.env.NAV02_ARTIFACTS) await page.screenshot({ path: `${process.env.NAV02_ARTIFACTS}/pager-${width}x${height}-light.png`, scale: "css" });
      expect(fit.bottom, `${width}x${height} pane ends at the navigation`).toBeLessThanOrEqual(fit.navTop + 1);
      expect(fit.height, `${width}x${height} pane height`).toBeGreaterThan(80);
      expect(fit.tab).toBeGreaterThanOrEqual(44);
      expect(fit.overflow, `${width}x${height} page overflow`).toBeLessThanOrEqual(0);
      // A phone widens its layout viewport to fit overflowing content, which would hide overflow from the check above.
      expect(fit.layout, `${width}x${height} layout viewport`).toBe(width);
    }
    for (const width of [1025, 1194, 1199]) {
      await open(page, `/mixes?mix=${mixes[1]}`, width, 834);
      await expect(tablist(page, MIXES)).toBeVisible();
      await expect(pager(page)).not.toHaveAttribute("data-paging");
      await expect(page.locator(".mix-library-directory")).toBeHidden();
    }
    await open(page, `/mixes?mix=${mixes[1]}`, 1200, 834);
    await expect(tablist(page, MIXES)).toBeHidden();
    await expect(page.locator(".mix-library-directory")).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, `/mixes?mix=${mixes[1]}`, 390, 844);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await expect(pager(page)).toHaveAttribute("data-paging");
      await next(page); await restsOn(page, MIXES, "details", "Details");
      const shown = await page.evaluate(() => { const tab = document.querySelector<HTMLElement>('[role=tab][aria-selected=true]')!; return { indicator: getComputedStyle(document.querySelector(".scroll-pager-indicator")!).backgroundColor, tab: tab.getBoundingClientRect().height, overflow: document.documentElement.scrollWidth - innerWidth, layout: innerWidth }; });
      if (process.env.NAV02_ARTIFACTS) await page.screenshot({ path: `${process.env.NAV02_ARTIFACTS}/pager-390x844-200pct-${scheme}.png`, scale: "css" });
      expect(shown.indicator).not.toBe("rgba(0, 0, 0, 0)");
      expect(shown.tab).toBeGreaterThanOrEqual(44);
      expect(shown.overflow).toBeLessThanOrEqual(0);
      expect(shown.layout).toBe(390);
      const audit = await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(audit.violations.map(violation => violation.id), scheme).toEqual([]);
    }
    test.info().annotations.push({ type: "pane fit", description: report.join("; ") });
  });
});

test("the pane tabs are ARIA tabs with arrow keys, names and selected states", async ({ page }, info) => {
  await open(page, `/mixes?mix=${mixes[2]}`, 390, 844);
  const list = tablist(page, MIXES), tabs = list.getByRole("tab");
  await expect(tabs).toHaveText(["Mixes", "Beats", "Details"]);
  await expect(list.locator("[aria-selected=true]")).toHaveCount(1);
  for (const tab of await tabs.all()) await expect(page.locator(`#${await tab.getAttribute("aria-controls")}`)).toHaveCount(1);
  const beats = list.getByRole("tab", { name: "Beats", exact: true });
  await expect(beats).toHaveAttribute("aria-selected", "true");
  await expect(beats).toHaveAttribute("tabindex", "0");
  await expect(list.getByRole("tab", { name: "Mixes", exact: true })).toHaveAttribute("tabindex", "-1");
  await beats.focus();
  await page.keyboard.press("ArrowRight");
  await expect(list.getByRole("tab", { name: "Details", exact: true })).toBeFocused();
  await expect(list.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(list.getByRole("tab", { name: "Mixes", exact: true })).toBeFocused();
  await expect(list.getByRole("tab", { name: "Mixes", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(list.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(list.getByRole("tab", { name: "Mixes", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(list.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("complementary", { name: "People and Journey connections", exact: true })).toBeVisible();
  if (coarse(info.project.name)) await restsOn(page, MIXES, "details", "Details");
  else await expect(page.getByRole("complementary", { name: "Mix library", exact: true })).toBeHidden();
  await open(page, "/journey", 390, 844);
  const journey = tablist(page, JOURNEY);
  await expect(journey.getByRole("tab")).toHaveText(["People", "Mixes", "Details"]);
  await expect(journey.getByRole("tab", { name: "Mixes", exact: true })).toHaveAttribute("aria-controls", "journey-map-pane");
  await journey.getByRole("tab", { name: "Mixes", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(journey.getByRole("tab", { name: "People", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("complementary", { name: "Journey directory", exact: true })).toBeVisible();
});

test("fine pointers keep the one-pane switcher at every width", async ({ page }, info) => {
  test.skip(coarse(info.project.name), "Fine pointer only.");
  for (const width of [320, 390, 768, 834, 1024, 1194, 1199]) {
    await open(page, `/mixes?mix=${mixes[3]}`, width, 900);
    await expect(pager(page)).not.toHaveAttribute("data-paging");
    await expect(tablist(page, MIXES)).toBeVisible();
    await expect(page.locator(".scroll-pager-indicator")).toBeHidden();
    await expect(page.locator(".mix-library-directory")).toBeHidden();
    await expect(page.locator(".mix-editor-workspace")).toBeVisible();
    await tablist(page, MIXES).getByRole("tab", { name: "Details", exact: true }).click();
    await expect(page.locator(".mix-editor-workspace")).toBeHidden();
    await expect(page.locator(".mix-context-pane")).toBeVisible();
  }
  for (const width of [1200, 1440, 1920]) {
    await open(page, `/mixes?mix=${mixes[3]}`, width, 1000);
    await expect(tablist(page, MIXES)).toBeHidden();
    await expect(page.locator(".mix-library-directory")).toBeVisible();
    await expect(page.locator(".mix-editor-workspace")).toBeVisible();
  }
  await open(page, "/journey", 834, 1000);
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
  await expect(pager(page)).not.toHaveAttribute("data-paging");
  await expect(page.locator("#journey-people-pane")).toBeHidden();
  await expect(page.locator("#journey-map-pane")).toBeVisible();
});
