import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// Swipe down to dismiss bottom sheets (JITM-NAV-01; JITM-08 §2.46; docs/design/NATIVE-NAVIGATION.md §3 D).
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(120_000);

let workspaceId: string, userId: string, jumpId: string;
const token = randomUUID();
const body = "Hi Alex, your estimate is ready.";

test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `sheet-swipe-${suffix}@example.com`, name: "Swipe fixture owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `sheet-swipe-${suffix}`, name: "Swipe fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Estimate text", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }] } }, include: { steps: true } });
  // Long notes make the review sheet scroll, so inner scrolling can be checked against dismissal.
  const contactId = (await prisma.contact.create({ data: { workspaceId, firstName: "Alex", displayName: "Alex Rivera", publicNotes: Array.from({ length: 40 }, (_, line) => `Note ${line + 1}: prefers a text after five.`).join("\n"), phones: { create: { phone: "+15550100300", normalized: "+15550100300", isPrimary: true } } } })).id;
  const scheduledAt = new Date(Date.now() - 60_000);
  jumpId = `${suffix}-swipe-jump`;
  await prisma.jump.create({ data: {
    id: jumpId, workspaceId, contactId, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason: "Estimate follow-up", uniquenessKey: jumpId,
    templateSnapshot: { subject: null, body, script: null, channel: "SMS", originalLocalDate: scheduledAt.toISOString().slice(0, 10), timezone: "UTC" },
    renderedSnapshot: { subject: null, body, script: null }
  } });
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

async function today(page: Page) {
  await page.goto("/jumps");
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
}
const review = (page: Page) => page.locator("dialog.follow-up-review-sheet");
const actions = (page: Page) => page.locator("dialog.sheet", { hasText: "Move it to a better day" });
const filter = (page: Page) => page.getByRole("dialog", { name: "Filter Today", exact: true });
const quickAdd = (page: Page) => page.getByRole("dialog", { name: "Quick Add", exact: true });
const panelOf = (sheet: Locator) => sheet.locator(":scope > .sheet-panel");
const headerOf = (sheet: Locator) => sheet.locator(".sheet-header, .quick-add-dialog-header").first();
async function openReview(page: Page) {
  await page.locator(`#jump-${jumpId}`).getByRole("button", { name: /^Review / }).click();
  await expect(review(page)).toHaveAttribute("open", "");
}
async function openFilter(page: Page) {
  await page.locator(".filter-trigger").first().click();
  await expect(filter(page)).toBeVisible();
}

/** A real touch drag through the browser's input pipeline, so touch-action, native scrolling and Pointer Events all apply. */
async function touchDrag(page: Page, from: Locator | { x: number; y: number }, dy: number, { fling = false } = {}) {
  const point = "x" in from ? from : await (async () => {
    const box = (await from.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + Math.min(12, box.height / 2) };
  })();
  // Event times are set explicitly, so speed is exact whatever the dispatch latency: a slow drag moves 25 ms a
  // step and holds still for 200 ms before release (distance alone decides); a fling moves 10 ms a step.
  const cdp = await page.context().newCDPSession(page);
  const start = Date.now() / 1000, steps = fling ? 4 : 12, step = fling ? 0.01 : 0.025;
  const send = (type: "touchStart" | "touchMove" | "touchEnd", at: number, y?: number) => cdp.send("Input.dispatchTouchEvent", { type, timestamp: start + at, touchPoints: y === undefined ? [] : [{ x: point.x, y, id: 1 }] });
  await send("touchStart", 0, point.y);
  for (let index = 1; index <= steps; index++) await send("touchMove", index * step, point.y + (dy * index) / steps);
  await send("touchEnd", steps * step + (fling ? 0.01 : 0.2));
  await cdp.detach();
}
/** A point on the sheet's body, below its header, that is not a field or a control. */
async function bodyPoint(sheet: Locator) {
  return sheet.evaluate(dialog => {
    const panel = dialog.querySelector<HTMLElement>(":scope > .sheet-panel")!;
    const box = panel.getBoundingClientRect(), top = panel.querySelector(".sheet-header")!.getBoundingClientRect().bottom;
    for (let y = top + 16; y < box.bottom - 16; y += 8) {
      const target = document.elementFromPoint(box.left + box.width / 2, y);
      if (target && panel.contains(target) && !target.closest("input, textarea, select, [contenteditable], a, button, .review-action-bar")) return { x: box.left + box.width / 2, y };
    }
    throw new Error("The sheet shows no plain body content.");
  });
}
async function atRest(sheet: Locator, surface = panelOf(sheet)) {
  await expect(sheet).toHaveAttribute("open", "");
  await expect.poll(() => surface.evaluate(element => element.style.transform + (element.dataset.swipeState ?? ""))).toBe("");
}

test.describe("on a touch phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== "mobile-chromium", "Touch runs once, in the phone project."); });

  test("the review sheet's handle and header drag it closed past 30%, and spring back short of it", async ({ page }) => {
    await today(page);
    await openReview(page);
    const sheet = review(page), header = headerOf(sheet);
    await expect(header).toHaveCSS("touch-action", "none");
    const height = (await panelOf(sheet).boundingBox())!.height;
    await touchDrag(page, header, height * 0.2);
    await atRest(sheet);
    await expect(sheet.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
    // The handle is the top of the header.
    await touchDrag(page, header, height * 0.45);
    await expect(sheet).not.toHaveAttribute("open", "");
    // As Close does, focus returns to the trigger and the next open starts at rest.
    await expect(page.locator(`#jump-${jumpId}`).getByRole("button", { name: /^Review / })).toBeFocused();
    await openReview(page);
    await atRest(sheet);
    await sheet.getByRole("button", { name: "Close Follow up with Alex Rivera", exact: true }).click();
    await expect(sheet).not.toHaveAttribute("open", "");
  });

  test("inner content scrolls first, and dismissal from the body starts only at its top", async ({ page }) => {
    // At this height the review scrolls.
    await page.setViewportSize({ width: 390, height: 600 });
    await today(page);
    await openReview(page);
    const sheet = review(page), panel = panelOf(sheet);
    const scrollTop = () => panel.evaluate(element => element.scrollTop);
    // The body keeps native scrolling.
    await touchDrag(page, await bodyPoint(sheet), -300);
    await expect.poll(scrollTop).toBeGreaterThan(50);
    const scrolled = await scrollTop();
    await atRest(sheet);
    // Pulling down on the body scrolls it back to its top; the sheet stays, even once the top is reached mid-touch.
    await touchDrag(page, await bodyPoint(sheet), scrolled + 150);
    await expect.poll(scrollTop).toBe(0);
    await atRest(sheet);
    // A pinned header still drags the sheet closed while the body is scrolled.
    await panel.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await scrollTop()).toBeGreaterThan(50);
    await touchDrag(page, headerOf(sheet), 300);
    await expect(sheet).not.toHaveAttribute("open", "");
    // At the top, a downward drag on the body dismisses.
    await openReview(page);
    await panel.evaluate(element => { element.scrollTop = 0; });
    await touchDrag(page, await bodyPoint(sheet), 300);
    await expect(sheet).not.toHaveAttribute("open", "");
  });

  test("a fling closes from a short distance, and fields, edges and upward drags never dismiss", async ({ page }) => {
    await today(page);
    await openFilter(page);
    const sheet = filter(page);
    const box = (await headerOf(sheet).boundingBox())!;
    // The 24 px screen edges belong to the system.
    await touchDrag(page, { x: 10, y: box.y + 12 }, 400);
    await atRest(sheet);
    // A field keeps its own touch.
    const field = sheet.locator("select").first();
    await touchDrag(page, field, 400);
    await atRest(sheet);
    // An upward drag never moves a resting sheet.
    await touchDrag(page, headerOf(sheet), -200);
    await atRest(sheet);
    // 60 px is far short of 30%, but fast.
    await touchDrag(page, headerOf(sheet), 60, { fling: true });
    await expect(sheet).toBeHidden();
  });

  test("the follow-up actions sheet drags closed", async ({ page }) => {
    await today(page);
    await page.getByRole("button", { name: /^More options for Alex Rivera/ }).first().click();
    const sheet = actions(page);
    await expect(sheet).toHaveAttribute("open", "");
    await touchDrag(page, headerOf(sheet), 400);
    await expect(sheet).not.toHaveAttribute("open", "");
  });

  test("closing the review by swipe keeps unsaved message edits exactly as Close does, and Today's guard still asks", async ({ page }) => {
    let release = () => undefined as void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let saves = 0;
    await page.route(`**/api/jumps/${jumpId}/draft`, async route => { saves += 1; await held; await route.continue(); });
    await today(page);
    await openReview(page);
    const field = review(page).getByRole("textbox", { name: "Your message", exact: true });
    await field.fill(`${body} Whenever you are ready.`);
    await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(1);
    await expect.poll(() => saves).toBeGreaterThan(0);
    await touchDrag(page, headerOf(review(page)), 500);
    await expect(review(page)).not.toHaveAttribute("open", "");
    await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(1);
    await page.locator(".today-queue-group").first().locator("summary").click();
    await page.getByRole("link", { name: "View upcoming follow-ups" }).click();
    const guard = page.getByRole("dialog", { name: "Keep your message edits?", exact: true });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(page).toHaveURL(/\/jumps$/);
    await expect(review(page)).toHaveAttribute("open", "");
    await expect(field).toHaveValue(`${body} Whenever you are ready.`);
    release();
    await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
    await prisma.jumpDraft.deleteMany({ where: { jumpId } });
  });

  test("Quick Add drags closed, and asks first about a capture as Close does", async ({ page }) => {
    await today(page);
    const open = async () => { await page.getByRole("button", { name: "Quick Add", exact: true }).locator("visible=true").first().click(); await expect(quickAdd(page)).toBeVisible(); };
    await open();
    const dialog = quickAdd(page), header = headerOf(dialog);
    await expect(header).toHaveCSS("touch-action", "none");
    await touchDrag(page, header, 500);
    await expect(dialog).toBeHidden();

    await open();
    await dialog.getByRole("textbox").first().fill("Call Jordan tomorrow at 9");
    await touchDrag(page, header, 500);
    const discard = page.getByRole("dialog", { name: "Discard this Quick Add draft?", exact: true });
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "Cancel", exact: true }).click();
    // Keeping the draft springs the sheet back open, with the capture intact.
    await atRest(dialog, dialog);
    await expect(dialog.getByRole("textbox").first()).toHaveValue("Call Jordan tomorrow at 9");
    await touchDrag(page, header, 500);
    await discard.getByRole("button", { name: "Discard draft", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test("settles with the motion tokens, and instantly under reduced motion", async ({ page }) => {
    const dismissMs = async () => {
      await openFilter(page);
      await filter(page).evaluate(dialog => {
        const marks = window as unknown as { swipeUp?: number; swipeClosed?: number };
        delete marks.swipeUp; delete marks.swipeClosed;
        window.addEventListener("pointerup", () => { marks.swipeUp = performance.now(); }, { capture: true, once: true });
        dialog.addEventListener("close", () => { marks.swipeClosed = performance.now(); }, { once: true });
      });
      await touchDrag(page, headerOf(filter(page)), 400);
      await expect(filter(page)).toBeHidden();
      return page.evaluate(() => { const marks = window as unknown as { swipeUp: number; swipeClosed: number }; return marks.swipeClosed - marks.swipeUp; });
    };
    await today(page);
    // --motion-settle is 220ms.
    expect(await dismissMs()).toBeGreaterThanOrEqual(150);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await dismissMs()).toBeLessThan(100);
  });

  test("the sheet follows the finger 1:1 in both themes, and its Close and Escape stay", async ({ page }) => {
    await today(page);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await openReview(page);
        const sheet = review(page), panel = panelOf(sheet);
        const box = (await headerOf(sheet).boundingBox())!;
        const point = { x: box.x + box.width / 2, y: box.y + 12 };
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...point, id: 1 }] });
        for (const dy of [20, 60, 120]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x, y: point.y + dy, id: 1 }] });
        await expect.poll(() => panel.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)).toBe(120);
        await expect(panel).toHaveAttribute("data-swipe-state", "dragging");
        const file = `.artifacts/nav01/screens/review-drag-${colorScheme}-${width}.png`;
        const png = await page.screenshot({ path: file });
        // PNG width and height, from the header, at the device's pixel ratio.
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(await page.evaluate(() => [innerWidth * devicePixelRatio, innerHeight * devicePixelRatio].map(Math.round)));
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x, y: point.y + 30, id: 1 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
        await atRest(sheet);
        // The visible equivalents are unchanged.
        await expect(sheet.getByRole("button", { name: "Close Follow up with Alex Rivera", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(sheet).not.toHaveAttribute("open", "");
      }
    }
  });

  test("works below 768px at every phone width, at 200% text and on a short sideways phone, and not from 768px", async ({ page }) => {
    await today(page);
    // Phones both sides of 768px, a sideways phone under 480px high, then tablets and large touch screens.
    for (const [width, height, closes] of [[320, 640, true], [390, 844, true], [767, 1024, true], [768, 1024, false], [834, 1194, false], [667, 375, true],
      [1194, 834, false], [1280, 800, false], [1920, 1080, false], [3440, 1440, false]] as const) {
      await page.setViewportSize({ width, height });
      await openFilter(page);
      await touchDrag(page, headerOf(filter(page)), Math.min(400, height * 0.6));
      if (closes) await expect(filter(page), `${width}x${height}`).toBeHidden();
      else {
        await expect(filter(page), `${width}x${height}`).toBeVisible();
        await expect.poll(() => panelOf(filter(page)).evaluate(element => element.style.transform)).toBe("");
        await page.keyboard.press("Escape");
        await expect(filter(page)).toBeHidden();
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    // 110% zoom gives a fractional width.
    const zoom = await page.addStyleTag({ content: "html { zoom: 1.1; }" });
    await openFilter(page);
    await touchDrag(page, headerOf(filter(page)), 400);
    await expect(filter(page), "110% zoom").toBeHidden();
    await zoom.evaluate(element => (element as Element).remove());
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await openReview(page);
    await touchDrag(page, headerOf(review(page)), 600);
    await expect(review(page)).not.toHaveAttribute("open", "");
  });
});

test.describe("with a fine pointer", () => {
  test.use({ hasTouch: false, isMobile: false });
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== "desktop-chromium", "Fine pointers run once, in the desktop project."); });

  test("a mouse drag never moves or closes a sheet, at phone or desktop width", async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      await today(page);
      await openFilter(page);
      const header = headerOf(filter(page));
      await expect(header).toHaveCSS("touch-action", "auto");
      const box = (await header.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + 12);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + 400, { steps: 12 });
      await page.mouse.up();
      await expect(filter(page)).toBeVisible();
      await expect.poll(() => panelOf(filter(page)).evaluate(element => element.style.transform)).toBe("");
      await filter(page).getByRole("button", { name: "Close Filter Today", exact: true }).click();
      await expect(filter(page)).toBeHidden();
    }
  });
});
