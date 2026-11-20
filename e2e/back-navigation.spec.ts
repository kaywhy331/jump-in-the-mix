import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { SWIPE } from "../src/lib/gestures/swipe";
import { prisma } from "../src/lib/prisma";

// Back: history entries, the slide-back, scroll restoration and the installed iOS app's edge swipe (JITM-NAV-04;
// JITM-08 §2.46; docs/design/NATIVE-NAVIGATION.md §3 C).
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(120_000);

let workspaceId: string, userId: string, contactId: string, mixId: string;
const token = randomUUID();

test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `back-${suffix}@example.com`, name: "Back fixture owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `back-${suffix}`, name: "Back fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  // A long list, so the list scrolls far past the height of one contact's page.
  await prisma.contact.createMany({ data: Array.from({ length: 40 }, (_, index) => ({ workspaceId, firstName: `Person ${index + 10}`, displayName: `Person ${index + 10}` })) });
  contactId = (await prisma.contact.findFirstOrThrow({ where: { workspaceId, displayName: "Person 40" } })).id;
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Estimate text", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi, your estimate is ready." } });
  mixId = (await prisma.mix.create({ data: { workspaceId, name: "Estimate plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }] } } })).id;
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
  // Every View Transition the app starts: its slide, the scroll it captures the new page at, and its animations.
  await context.addInitScript(() => {
    const marks = window as unknown as { slides: Array<{ side: string; top?: number; animations?: string[] }> };
    marks.slides = [];
    const start = Document.prototype.startViewTransition;
    Document.prototype.startViewTransition = function (this: Document, ...args: Parameters<Document["startViewTransition"]>) {
      const mark: { side: string; top?: number; animations?: string[] } = { side: document.documentElement.dataset.slide ?? "" };
      marks.slides.push(mark);
      const transition = start.apply(this, args);
      void transition.ready.then(() => {
        mark.top = Math.round(window.scrollY);
        mark.animations = document.getAnimations().map(animation => `${(animation as CSSAnimation).animationName}${(animation.effect as KeyframeEffect).pseudoElement}${animation.effect?.getComputedTiming().duration}`);
      }, () => undefined);
      return transition;
    };
  });
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
}
const slides = (page: Page) => page.evaluate(() => (window as unknown as { slides: Array<{ side: string; top?: number; animations?: string[] }> }).slides);
const historyIndex = (page: Page) => page.evaluate(() => (window as unknown as { navigation: { currentEntry: { index: number } } }).navigation.currentEntry.index);
const main = (page: Page) => page.locator("#workspace-main");
const offsetX = (page: Page) => main(page).evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
/**
 * Scrolls the contact list down and opens a contact already in view, so the list stays where it was, then forgets the
 * list's own saved position, so only history restores it. Returns the contact's path.
 */
async function scrolledList(page: Page) {
  await open(page, "/contacts");
  // The list may still be settling: wait until its height holds, then scroll until the position holds.
  let height = -1;
  await expect.poll(async () => { const previous = height; height = await page.evaluate(() => document.documentElement.scrollHeight); return height === previous; }, { intervals: [300] }).toBe(true);
  await expect.poll(() => page.evaluate(() => { window.scrollTo({ top: 900, behavior: "instant" }); return Math.round(window.scrollY); })).toBe(900);
  const href = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>("a.contact-open")].find(link => { const box = link.getBoundingClientRect(); return box.top > 120 && box.bottom < innerHeight - 160; })!.getAttribute("href")!);
  await page.locator(`a.contact-open[href="${href}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  // The contact opens near its top, nowhere near the list's position.
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeLessThan(100);
  await page.evaluate(() => { for (const key of Object.keys(sessionStorage)) if (key.includes("contacts:list-state")) sessionStorage.removeItem(key); });
  return href;
}
/** The browser's own Back, as its button sends it, without waiting for a page: a guard may keep this one. */
async function systemBack(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const { currentIndex, entries } = await cdp.send("Page.getNavigationHistory");
  await cdp.send("Page.navigateToHistoryEntry", { entryId: entries[currentIndex - 1].id });
  await cdp.detach();
}
/** The installed iOS app: standalone display and iOS's `navigator.standalone`. `ios: false` is Android's installed app. */
async function installed(page: Page, ios = true) {
  await page.addInitScript(ios => {
    const match = window.matchMedia.bind(window);
    window.matchMedia = query => query.includes("display-mode: standalone") ? match("(min-width: 0px)") : match(query);
    if (ios) Object.defineProperty(navigator, "standalone", { value: true });
  }, ios);
}
/** A real horizontal touch drag from `x`, at the middle of the screen: slow (distance decides) or a fling. */
async function edgeDrag(page: Page, x: number, dx: number, { fling = false, hold = false } = {}) {
  // A point on the page, clear of fields and sideways scrollers by a margin, which keep their own touch.
  const y = await page.evaluate(x => {
    const plain = (y: number) => {
      const target = document.elementFromPoint(x, y);
      if (!target?.closest(".app-shell") || target.closest("input, textarea, select, [contenteditable], [role='slider'], [data-swipe-ignore], a, button")) return false;
      for (let node: Element | null = target; node; node = node.parentElement) if (node.scrollWidth > node.clientWidth && /auto|scroll/.test(getComputedStyle(node).overflowX)) return false;
      return true;
    };
    for (let y = Math.round(innerHeight * 0.3); y < innerHeight * 0.85; y += 8) if ([-12, 0, 12].every(offset => plain(y + offset))) return y;
    return Math.round(innerHeight / 2);
  }, x);
  const cdp = await page.context().newCDPSession(page);
  const start = Date.now() / 1000, steps = fling ? 4 : 12, step = fling ? 0.01 : 0.025;
  const send = (type: "touchStart" | "touchMove" | "touchEnd", at: number, to?: number) => cdp.send("Input.dispatchTouchEvent", { type, timestamp: start + at, touchPoints: to === undefined ? [] : [{ x: to, y, id: 1 }] });
  await send("touchStart", 0, x);
  for (let index = 1; index <= steps; index++) await send("touchMove", index * step, x + (dx * index) / steps);
  const lift = async () => { await send("touchEnd", steps * step + (fling ? 0.01 : 0.2)); await cdp.detach(); };
  if (hold) return lift;
  await lift();
}

test.describe("on a touch phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== "mobile-chromium", "Touch runs once, in the phone project."); });

  test("every drill-in is a history entry that Back returns from", async ({ page }) => {
    const drillIn = async (from: string, click: () => Promise<void>, to: RegExp) => {
      await open(page, from);
      const before = await historyIndex(page);
      await click();
      await expect(page).toHaveURL(to);
      expect(await historyIndex(page), String(to)).toBe(before + 1);
      await page.goBack();
      await expect(page).toHaveURL(new URL(from, process.env.APP_URL).href);
    };
    await drillIn("/contacts", () => page.locator(`a.contact-open[href="/contacts/${contactId}"]`).click(), new RegExp(`/contacts/${contactId}$`));
    await drillIn("/mixes", () => page.locator(`a.mix-library-item[href*="mix=${mixId}"]`).first().click(), new RegExp(`/mixes\\?mix=${mixId}`));
    await drillIn(`/mixes?mix=${mixId}`, () => page.locator(".mix-view-tabs").getByRole("link", { name: "Edit" }).click(), /view=edit/);
    await drillIn("/settings", () => page.locator('a[href="/settings/jump-date-types"]').first().click(), /\/settings\/jump-date-types$/);
    await drillIn(`/contacts/${contactId}`, async () => { await page.locator(".contact-detail-more > summary").click(); await page.getByRole("link", { name: "View Journey" }).click(); }, /\/journey\?contactId=/);
  });

  test("Back slides the parent in from the left with the settle token, at its restored scroll; Forward slides the child back in", async ({ page }) => {
    const contact = await scrolledList(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(900);
    await expect.poll(async () => (await slides(page)).length).toBe(1);
    const [back] = await slides(page);
    expect(back.side).toBe("back");
    // The new page was captured at its restored scroll, and slides with --motion-settle (220ms).
    await expect.poll(async () => (await slides(page))[0].top).toBe(900);
    expect((await slides(page))[0].animations).toEqual(expect.arrayContaining(["slide-in-left::view-transition-new(root)220", "slide-out-right::view-transition-old(root)220"]));
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${contact}$`));
    await expect.poll(async () => (await slides(page)).map(mark => mark.side)).toEqual(["back", "forward"]);
    // Between two ring stops, history slides in ring order: Contacts enters from the left of Mixes.
    await open(page, "/contacts");
    await page.locator(".mobile-nav").getByRole("link", { name: "Mixes" }).click();
    await expect(page).toHaveURL(/\/mixes$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect.poll(async () => (await slides(page)).at(-1)?.side).toBe("back");
  });

  test("the back control goes back through history, restores the parent's scroll and adds no entry, by tap or keyboard", async ({ page }) => {
    await scrolledList(page);
    const before = await historyIndex(page), length = await page.evaluate(() => history.length);
    const control = page.getByRole("link", { name: "Back to contacts" }).locator("visible=true").first();
    await expect(control).toBeVisible();
    await control.click();
    await expect(page).toHaveURL(/\/contacts$/);
    expect(await historyIndex(page)).toBe(before - 1);
    expect(await page.evaluate(() => history.length)).toBe(length);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(900);
    expect((await slides(page)).map(mark => mark.side)).toEqual(["back"]);
    // Keyboard: the same control, focused and pressed.
    await open(page, "/settings");
    await page.locator('a[href="/settings/jump-date-types"]').first().click();
    await page.locator("[data-back-link]").first().focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("reduced motion swaps instantly: no transition runs, and the scroll still comes back", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await scrolledList(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(900);
    expect(await slides(page)).toEqual([]);
  });

  test.describe("in the installed iOS app", () => {
    test.beforeEach(async ({ page }) => { await installed(page); });

    test("a swipe from within 20 px of the left edge follows the finger and goes back exactly once past 35%", async ({ page }) => {
      await open(page, "/contacts");
      await page.locator(`a.contact-open[href="/contacts/${contactId}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}$`));
      const before = await historyIndex(page), width = 390;
      // Short of 35%: it follows the finger 1:1, then springs back.
      const lift = await edgeDrag(page, SWIPE.backEdge - 4, width * (SWIPE.commit.x - 0.1), { hold: true });
      await expect(main(page)).toHaveAttribute("data-swipe-state", "dragging");
      expect(await offsetX(page)).toBeCloseTo(width * (SWIPE.commit.x - 0.1), 0);
      await lift!();
      await expect.poll(() => main(page).evaluate(element => element.style.transform + (element.dataset.swipeState ?? ""))).toBe("");
      await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}$`));
      // A start 21 px or more from the edge is not a back swipe.
      await edgeDrag(page, SWIPE.backEdge + 6, width * 0.6);
      await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}$`));
      // Past 35%: back to the list, one entry back, with the slide.
      await edgeDrag(page, 8, width * (SWIPE.commit.x + 0.1));
      await expect(page).toHaveURL(/\/contacts$/);
      expect(await historyIndex(page)).toBe(before - 1);
      await expect.poll(() => main(page).evaluate(element => element.style.transform + (element.dataset.swipeState ?? ""))).toBe("");
      expect((await slides(page)).map(mark => mark.side)).toEqual(["back"]);
      // On a ring stop the edge is not a back swipe.
      await edgeDrag(page, 8, width * 0.6);
      await expect(page).toHaveURL(/\/contacts$/);
      expect(await historyIndex(page)).toBe(before - 1);
      // A fling commits from a short distance.
      await page.locator(`a.contact-open[href="/contacts/${contactId}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}$`));
      await edgeDrag(page, 8, 60, { fling: true });
      await expect(page).toHaveURL(/\/contacts$/);
    });

    test("works at phone and tablet widths, sideways, at 110% zoom and 200% text, in both themes", async ({ page }) => {
      await open(page, "/settings");
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        for (const [width, height] of [[320, 640], [390, 844], [767, 1024], [768, 1024], [834, 1194], [844, 390], [900, 1200]] as const) {
          await page.setViewportSize({ width, height });
          await page.locator('a[href="/settings/jump-date-types"]').first().click();
          await expect(page, `${width}x${height}`).toHaveURL(/\/settings\/jump-date-types$/);
          const lift = await edgeDrag(page, 8, width * 0.5, { hold: true });
          await expect(main(page)).toHaveAttribute("data-swipe-state", "dragging");
          const file = `.artifacts/nav04/screens/edge-drag-${colorScheme}-${width}x${height}.png`;
          const png = await page.screenshot({ path: file });
          expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(await page.evaluate(() => [innerWidth * devicePixelRatio, innerHeight * devicePixelRatio].map(Math.round)));
          // The header and the bottom navigation stay where they are while the page moves.
          expect(await page.locator(".mobile-nav").evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41)).toBe(0);
          await lift!();
          await expect(page, `${width}x${height}`).toHaveURL(/\/settings$/);
        }
      }
      // From 901 px the rail holds the left edge: a swipe from there moves the page beside it, and the rail stays.
      for (const [width, height] of [[901, 1200], [1194, 834]] as const) {
        await page.setViewportSize({ width, height });
        await page.locator('a[href="/settings/jump-date-types"]').first().click();
        await expect(page).toHaveURL(/\/settings\/jump-date-types$/);
        const lift = await edgeDrag(page, 8, width * 0.5, { hold: true });
        await expect(main(page)).toHaveAttribute("data-swipe-state", "dragging");
        expect(await page.locator(".app-shell > .sidebar").evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41)).toBe(0);
        await lift!();
        await expect(page, `${width}x${height}`).toHaveURL(/\/settings$/);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      for (const style of ["html { zoom: 1.1; }", "html { font-size: 200% !important; }"]) {
        const tag = await page.addStyleTag({ content: style });
        await page.locator('a[href="/settings/jump-date-types"]').first().click();
        await expect(page).toHaveURL(/\/settings\/jump-date-types$/);
        await edgeDrag(page, 8, 390 * 0.5);
        await expect(page, style).toHaveURL(/\/settings$/);
        await tag.evaluate(element => (element as Element).remove());
      }
    });

    test("the unsaved guard asks once on back by swipe, by the back control and by the system, and keeps the edits", async ({ page }) => {
      const asked: string[] = [];
      let answer = false;
      page.on("dialog", dialog => { asked.push(dialog.message()); void (answer ? dialog.accept() : dialog.dismiss()); });
      await open(page, "/account");
      await page.getByRole("link", { name: "Edit preferences" }).click();
      await expect(page).toHaveURL(/\/account\/preferences$/);
      const name = page.getByLabel("Display name");
      await name.click();
      await page.keyboard.press("End");
      await page.keyboard.type(" Jr");
      const edited = await name.inputValue();
      const stays = async (how: string) => {
        await expect.poll(() => asked.length, how).toBe(1);
        expect(asked[0]).toBe("Leave without saving your changes?");
        await expect(page, how).toHaveURL(/\/account\/preferences$/);
        await expect(name).toHaveValue(edited);
        asked.length = 0;
      };
      // Keeping the edits: the swipe springs back, and the page stays.
      await edgeDrag(page, 8, 390 * 0.5);
      await stays("swipe");
      await expect.poll(() => main(page).evaluate(element => element.style.transform + (element.dataset.swipeState ?? ""))).toBe("");
      await page.locator("[data-back-link]").first().click();
      await stays("back control");
      await name.click();
      await systemBack(page);
      await stays("system back");
      // Leaving: one question, then back to the parent.
      answer = true;
      await edgeDrag(page, 8, 390 * 0.5);
      await expect(page).toHaveURL(/\/account$/);
      expect(asked).toEqual(["Leave without saving your changes?"]);
    });
  });

  test("in a browser tab and in Android's installed app, the edge is the system's: nothing moves and nothing goes back", async ({ page }) => {
    for (const android of [false, true]) {
      if (android) await installed(page, false);
      await open(page, "/settings");
      await page.locator('a[href="/settings/jump-date-types"]').first().click();
      await expect(page).toHaveURL(/\/settings\/jump-date-types$/);
      const lift = await edgeDrag(page, 8, 390 * 0.5, { hold: true });
      expect(await main(page).getAttribute("data-swipe-state")).toBeNull();
      expect(await offsetX(page)).toBe(0);
      await lift!();
      await expect(page).toHaveURL(/\/settings\/jump-date-types$/);
    }
  });
});

test.describe("with a fine pointer", () => {
  test.use({ hasTouch: false, isMobile: false });
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== "desktop-chromium", "Fine pointers run once, in the desktop project."); });

  test("desktop is unchanged: Back runs no transition, and the parent still gets its scroll back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await scrolledList(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(900);
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "/settings");
    await page.locator('a[href="/settings/jump-date-types"]').first().click();
    await expect(page).toHaveURL(/\/settings\/jump-date-types$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
    expect(await slides(page)).toEqual([]);
  });
});
